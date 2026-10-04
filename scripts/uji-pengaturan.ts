// Skrip uji sekali pakai (Pengaturan).
//   npx tsx --env-file=.env.local scripts/uji-pengaturan.ts db "<sql>"
//   npx tsx --env-file=.env.local scripts/uji-pengaturan.ts clerk        (hanya membaca daftar izin)
//   npx tsx --env-file=.env.local scripts/uji-pengaturan.ts clerk-uji    (tambah lalu hapus email palsu)
import postgres from "postgres";
import { createClerkClient } from "@clerk/backend";

const EMAIL_UJI = "uji-simpel@example.com";

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === "db") {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", prepare: false, connect_timeout: 15 });
    const r = await sql.unsafe(rest.join(" "));
    console.log(JSON.stringify(r, null, 1));
    await sql.end();
    return;
  }
  if (mode === "cek") {
    // Uji kueri halaman Pengaturan. Bagian tulis dibungkus transaksi yang SELALU dibatalkan.
    const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", prepare: false, connect_timeout: 15 });
    const BAGIAN = ["pembuka", "substansi", "penutup"];
    console.log("baku", (await sql`select id from pertanyaan_baku order by array_position(${BAGIAN}::text[], bagian), urutan, created_at`).length);
    const dari = "2026-01-01", sampai = "2026-12-31", q = "%HD%";
    const kond = sql`true and a.waktu >= (${dari}::date)::timestamp at time zone 'Asia/Jakarta' and a.waktu < ((${sampai}::date + 1))::timestamp at time zone 'Asia/Jakarta'
      and a.user_id is null and (e.nomor_registrasi ilike ${q} or a.record_id ilike ${q} or a.entri_id::text = ${"HD"})`;
    console.log("audit", await sql`select count(*)::int as n from audit_log a left join entri e on e.id = a.entri_id where ${kond}`);
    const id = null;
    console.log("libur", await sql`select nama from hari_libur where tanggal = ${"2026-01-01"} and (${id}::uuid is null or id <> ${id}::uuid)`);
    console.log("libur in", (await sql`select tanggal::text from hari_libur where tanggal in ${sql(["2026-01-01", "2027-01-01"])}`).length);
    console.log("bank", await sql`select jenis_pelanggaran, coalesce(max(urutan), 0)::int as m from bank_pertanyaan where nama_set = ${"x"} group by jenis_pelanggaran limit 1`);
    await sql.begin(async (tx) => {
      await tx`update golongan_ruang set ${tx({ pangkat: "Uji", urutan: 99 })} where kode = ${"I/a"}`;
      await tx`update pengaturan set nilai = ${tx.json("uji" as never)} where kunci = ${"tempat_surat"}`;
      await tx`update peran set ${tx({ nama: "Admin", keterangan: null, urutan: 1, boleh_buat: true })} where kode = ${"admin"}`;
      await tx`insert into hari_libur ${tx({ tanggal: "2099-01-01", nama: "Uji", jenis: "libur_nasional", keterangan: null })}`;
      console.log("tulis ok (akan dibatalkan)");
      throw new Error("ROLLBACK_SENGAJA");
    }).catch((e) => console.log("transaksi uji:", (e as Error).message));
    await sql.end();
    return;
  }
  const c = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  if (mode === "clerk") {
    const l = await c.allowlistIdentifiers.getAllowlistIdentifierList({ limit: 100 });
    console.log("totalCount", l.totalCount, l.data.map((x) => ({ id: x.id, identifier: x.identifier, type: x.identifierType })));
    const u = await c.users.getUserList({ limit: 10 });
    console.log("users", u.totalCount, u.data.map((x) => ({ id: x.id, emails: x.emailAddresses.map((e) => e.emailAddress) })));
    return;
  }
  if (mode === "clerk-uji") {
    const a = await c.allowlistIdentifiers.createAllowlistIdentifier({ identifier: EMAIL_UJI, notify: false });
    console.log("dibuat", a.id, a.identifier);
    try {
      await c.allowlistIdentifiers.createAllowlistIdentifier({ identifier: EMAIL_UJI, notify: false });
      console.log("duplikat diterima");
    } catch (e) {
      const er = e as { status?: number; errors?: { code?: string; message?: string }[] };
      console.log("duplikat ditolak", er.status, er.errors?.map((x) => x.code));
    }
    const d = await c.allowlistIdentifiers.deleteAllowlistIdentifier(a.id);
    console.log("dihapus", d.deleted);
    const u = await c.users.getUserList({ emailAddress: [EMAIL_UJI] });
    console.log("pengguna dengan email uji", u.totalCount);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
