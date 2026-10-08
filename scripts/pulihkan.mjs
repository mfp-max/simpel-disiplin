// Memulihkan isi database SIMPEL dari folder cadangan (hasil ekspor JSON per tabel)
// ke database yang SKEMANYA SUDAH DIBUAT dengan `npm run db:migrate`.
// Pakai: npm run db:pulihkan -- <folder-cadangan> [--paksa] [--clerk-baru]
//
// - Semua tabel diisi dalam SATU transaksi: gagal satu, batal semua.
// - Pemicu (trigger) buatan SIMPEL dimatikan sementara agar data tersalin apa adanya
//   (cap waktu, audit, kunci katalog tidak ikut berjalan), lalu dinyalakan lagi.
// - Relasi (foreign key) dilepas selama pengisian — ada relasi melingkar antar tabel
//   (dokumen ↔ template) — lalu dipasang lagi persis seperti semula; saat dipasang,
//   Postgres memeriksa ulang seluruh data sehingga relasi yang rusak tetap ketahuan.
// - Kolom hasil hitungan dilewati; kolom identitas memakai nilai asli; urutan
//   (sequence) diselaraskan setelahnya.
// - Menolak berjalan bila database tujuan sudah berisi pengguna/kasus, kecuali --paksa.
// - --clerk-baru: lepaskan tautan akun Clerk lama (app_users.clerk_user_id) bila aplikasi
//   Clerk diganti; tiap pengguna tertaut ulang otomatis lewat email saat login pertama.
// - Bila folder cadangan berisi storage/<bucket>/…, berkasnya diunggah ulang ke Supabase
//   Storage (bucket dibuat privat bila belum ada; berkas yang sudah ada ditimpa).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const [folder, ...bendera] = process.argv.slice(2);
const paksa = bendera.includes("--paksa");
const clerkBaru = bendera.includes("--clerk-baru");
if (!folder || !existsSync(join(folder, "data"))) {
  console.error("Pakai: npm run db:pulihkan -- <folder-cadangan> [--paksa] [--clerk-baru]   (folder berisi subfolder data/)");
  process.exit(1);
}
const url = process.env.DATABASE_URL_MIGRASI || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_MIGRASI belum diisi di .env.local");
  process.exit(1);
}

const sql = postgres(url, { ssl: /sslmode=disable/.test(url) ? false : "require", prepare: false, max: 1, onnotice: () => {} });
const LEWATI = new Set(["skema_migrasi"]); // dikelola oleh skrip migrasi

try {
  const tabelDb = new Set((await sql`select tablename from pg_tables where schemaname = 'public'`).map((r) => r.tablename));
  const tabelCadangan = readdirSync(join(folder, "data")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).filter((t) => !LEWATI.has(t));
  const hilang = tabelCadangan.filter((t) => !tabelDb.has(t));
  if (hilang.length) throw new Error(`Tabel berikut belum ada di database tujuan (jalankan db:migrate dulu): ${hilang.join(", ")}`);

  const [{ n }] = await sql`select (select count(*) from app_users) + (select count(*) from entri) as n`;
  if (Number(n) > 0 && !paksa) throw new Error("Database tujuan sudah berisi pengguna/kasus. Tambahkan --paksa bila memang ingin ditimpa.");

  const urutan = [...tabelCadangan].sort();
  const relasi = await sql`select conrelid::regclass::text as tabel, conname, pg_get_constraintdef(oid) as def
    from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`;

  const kolom = await sql`select table_name, column_name, is_generated, identity_generation
    from information_schema.columns where table_schema = 'public'`;

  const hasil = await sql.begin(async (tx) => {
    for (const r of relasi) await tx.unsafe(`alter table ${r.tabel} drop constraint "${r.conname}"`);
    for (const t of urutan) await tx`alter table ${tx(t)} disable trigger user`;
    for (const t of urutan) await tx`delete from ${tx(t)}`; // kosongkan (mis. baris bawaan migrasi)
    const jumlah = {};
    for (const t of urutan) {
      const baris = JSON.parse(readFileSync(join(folder, "data", `${t}.json`), "utf8"));
      jumlah[t] = baris.length;
      if (!baris.length) continue;
      const kol = kolom.filter((k) => k.table_name === t && k.is_generated !== "ALWAYS").map((k) => k.column_name);
      const identitas = kolom.some((k) => k.table_name === t && k.identity_generation === "ALWAYS");
      const daftar = kol.map((k) => `"${k}"`).join(", ");
      // Dikirim per 500 baris agar parameter tidak terlalu besar.
      for (let i = 0; i < baris.length; i += 500) {
        const potong = JSON.stringify(baris.slice(i, i + 500));
        await tx.unsafe(
          `insert into "${t}" (${daftar}) ${identitas ? "overriding system value" : ""}
           select ${daftar} from jsonb_populate_recordset(null::"${t}", $1::text::jsonb)`,
          [potong],
        );
      }
    }
    if (clerkBaru) await tx`update app_users set clerk_user_id = null`;
    for (const t of urutan) await tx`alter table ${tx(t)} enable trigger user`;
    for (const r of relasi) await tx.unsafe(`alter table ${r.tabel} add constraint "${r.conname}" ${r.def}`);
    // Selaraskan urutan ID dengan nilai terbesar yang kini ada.
    const seq = await tx`select s.relname as seq, t.relname as tabel, a.attname as kol
      from pg_class s join pg_depend d on d.objid = s.oid and d.deptype in ('a','i')
      join pg_class t on t.oid = d.refobjid join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
      where s.relkind = 'S' and s.relnamespace = 'public'::regnamespace`;
    for (const s of seq) {
      await tx.unsafe(`select setval('"${s.seq}"', coalesce((select max("${s.kol}") from "${s.tabel}"), 0) + 1, false)`);
    }
    return jumlah;
  });

  // Periksa ulang jumlah baris.
  let beda = 0;
  for (const [t, harap] of Object.entries(hasil)) {
    const [{ c }] = await sql`select count(*)::int as c from ${sql(t)}`;
    if (c !== harap) { beda++; console.error(`  ✗ ${t}: ${c} baris (seharusnya ${harap})`); }
  }
  const total = Object.values(hasil).reduce((a, b) => a + b, 0);
  console.log(beda ? `Pemulihan selesai dengan ${beda} selisih.` : `Pemulihan selesai: ${urutan.length} tabel, ${total} baris — semua cocok.`);
  if (beda) process.exitCode = 1;
  if (clerkBaru) console.log("Tautan akun Clerk lama dilepas — pengguna tertaut ulang lewat email saat login pertama.");
} catch (e) {
  console.error("Pemulihan gagal:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

if (!process.exitCode && existsSync(join(folder, "storage"))) await pulihkanBerkas();

async function pulihkanBerkas() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    console.error("Berkas tidak diunggah: SUPABASE_URL / SUPABASE_SECRET_KEY belum diisi di .env.local");
    process.exitCode = 1;
    return;
  }
  const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const MIME = { docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip: "application/zip", json: "application/json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webm: "audio/webm", mp3: "audio/mpeg", m4a: "audio/mp4" };
  const semua = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? semua(join(d, n)) : [join(d, n)]));
  let n = 0, gagal = 0;
  for (const bucket of readdirSync(join(folder, "storage"))) {
    const { data: ada } = await s.storage.getBucket(bucket);
    if (!ada) {
      const { error } = await s.storage.createBucket(bucket, { public: false, fileSizeLimit: "50MB" });
      if (error) { console.error(`  ✗ bucket ${bucket}: ${error.message}`); process.exitCode = 1; return; }
    }
    for (const berkas of semua(join(folder, "storage", bucket))) {
      const path = relative(join(folder, "storage", bucket), berkas).split(sep).join("/");
      const ext = path.split(".").pop().toLowerCase();
      const { error } = await s.storage.from(bucket).upload(path, readFileSync(berkas), { contentType: MIME[ext] ?? "application/octet-stream", upsert: true });
      if (error) { gagal++; console.error(`  ✗ ${bucket}/${path}: ${error.message}`); } else n++;
    }
  }
  console.log(gagal ? `Berkas: ${n} terunggah, ${gagal} gagal.` : `Berkas: ${n} terunggah ke Supabase Storage.`);
  if (gagal) process.exitCode = 1;
}
