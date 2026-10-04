import Link from "next/link";
import { Gavel, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JudulHalaman, Kosong } from "@/components/simpel/dasar";
import { Lencana, LencanaStatus, LencanaTenggat } from "@/components/simpel/lencana";
import { BilahFilter } from "@/components/simpel/bilah-filter";
import { Halaman, NamaPegawai, TabelEntri } from "@/components/simpel/tabel-entri";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { daftarStatusKasus, pengaturan } from "@/lib/pengaturan";
import { muatKalender } from "@/lib/regulasi";
import { hariIni } from "@/lib/hari-kerja";
import { statusTenggat } from "@/lib/tenggat";

export const metadata = { title: "Kasus Hukuman Disiplin" };
const PER = 25;

export default async function DaftarKasus({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await wajibMasuk();
  const sp = await searchParams;
  const hal = Math.max(1, Number(sp.hal ?? 1));
  const pola = sp.q?.trim() ? `%${sp.q.trim()}%` : null;
  const lihat = sp.lihat ?? "berjalan";

  const where = sql`e.kelas = 'hukdis' and e.diarsipkan_pada is null
    ${lihat === "berjalan" ? sql`and s.kelompok = 'berjalan'` : lihat === "selesai" ? sql`and s.kelompok in ('selesai','dihentikan')` : sql``}
    ${sp.status ? sql`and e.status_kasus = ${sp.status}` : sql``}
    ${sp.tingkat ? sql`and th.kode = ${sp.tingkat}` : sql``}
    ${sp.rezim ? sql`and e.rezim_kode = ${sp.rezim}` : sql``}
    ${sp.pic === "saya" ? sql`and e.pic_user_id = ${p.id}` : sql``}
    ${pola ? sql`and (e.judul ilike ${pola} or e.nomor_registrasi ilike ${pola} or pg.nama_lengkap_gelar ilike ${pola} or pg.nip ilike ${pola})` : sql``}`;

  const [rows, [{ total }], status, tingkat, rezim, kal, ambang] = await Promise.all([
    sql`select e.id, e.nomor_registrasi, e.judul, e.status_kasus, s.nama as status_nama, s.kelompok, e.rezim_kode, e.pemotongan_ik,
          pg.nama_lengkap_gelar as nama, pg.nip, th.nama as tingkat, e.snapshot_regulasi->>'nama_singkat' as regulasi, u.nama as pic,
          t.nama as tahap, t.tenggat, t.tenggat_info->>'sifat' as sifat
        from entri e join status_kasus s on s.kode = e.status_kasus left join pegawai pg on pg.id = e.pegawai_id
        left join tingkat_hukuman th on th.id = e.tingkat_hukuman_dugaan_id left join app_users u on u.id = e.pic_user_id
        left join lateral (select nama, tenggat, tenggat_info from tahapan_kasus where entri_id = e.id and status = 'berjalan' order by urutan limit 1) t on true
        where ${where} ${sp.tenggat === "lewat" ? sql`and t.tenggat < current_date` : sql``}
        order by (t.tenggat is null), t.tenggat, e.created_at desc limit ${PER} offset ${(hal - 1) * PER}`,
    sql`select count(*)::int as total from entri e join status_kasus s on s.kode = e.status_kasus left join pegawai pg on pg.id = e.pegawai_id
        left join tingkat_hukuman th on th.id = e.tingkat_hukuman_dugaan_id
        left join lateral (select tenggat from tahapan_kasus where entri_id = e.id and status = 'berjalan' order by urutan limit 1) t on true
        where ${where} ${sp.tenggat === "lewat" ? sql`and t.tenggat < current_date` : sql``}`,
    daftarStatusKasus(),
    sql`select distinct kode, nama, urutan from tingkat_hukuman where aktif order by urutan`,
    sql`select kode, nama from rezim where aktif order by urutan`,
    muatKalender(),
    pengaturan<number>("ambang_peringatan_tenggat_hari", 3),
  ]);
  const hari = hariIni();
  const dasar = (h: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set("hal", String(h));
    return `/kasus?${u}`;
  };
  const tingkatUnik = [...new Map(tingkat.map((t) => [t.kode, t])).values()];

  return (
    <>
      <JudulHalaman
        judul="Kasus Hukuman Disiplin"
        deskripsi="Kasus aktif yang mengikuti tahapan penuh sesuai rezim dan tingkat hukuman."
        aksi={p.hak.boleh_buat ? <Button asChild size="lg"><Link href="/kasus/baru"><Plus /> Kasus baru</Link></Button> : null}
      />
      <BilahFilter
        placeholder="Cari nomor, nama terperiksa, NIP, judul…"
        filter={[
          { nama: "lihat", label: "Tampilkan", opsi: [{ nilai: "berjalan", label: "Sedang berjalan" }, { nilai: "selesai", label: "Selesai/dihentikan" }, { nilai: "semua", label: "Semua" }] },
          { nama: "status", label: "Status", opsi: status.filter((s) => !["informasi", "dinaikkan", "tercatat"].includes(s.kode)).map((s) => ({ nilai: s.kode, label: s.nama })) },
          { nama: "tingkat", label: "Tingkat", opsi: tingkatUnik.map((t) => ({ nilai: t.kode, label: t.nama })) },
          { nama: "rezim", label: "Rezim", opsi: rezim.map((r) => ({ nilai: r.kode, label: r.nama })) },
          { nama: "tenggat", label: "Tenggat", opsi: [{ nilai: "lewat", label: "Lewat tenggat" }] },
          { nama: "pic", label: "Penanggung jawab", opsi: [{ nilai: "saya", label: "Kasus saya" }] },
        ]}
      />
      {rows.length === 0 ? (
        <Kosong ikon={Gavel} judul={pola ? "Tidak ada yang cocok" : "Belum ada kasus"} deskripsi="Kasus dapat dibuat langsung, atau dinaikkan dari Registrasi Informasi."
          aksi={p.hak.boleh_buat && !pola ? <Button asChild><Link href="/kasus/baru"><Plus /> Kasus baru</Link></Button> : null} />
      ) : (
        <TabelEntri
          rows={rows as unknown as never[]}
          href={(r: Record<string, string>) => `/kasus/${r.id}`}
          judulKartu={(r: Record<string, string>) => <NamaPegawai nama={r.nama} />}
          subKartu={(r: Record<string, string>) => <>{r.nomor_registrasi} · {r.judul}</>}
          kolom={[
            { judul: "Kasus", isi: (r: Record<string, string>) => <span><span className="block line-clamp-2">{r.judul}</span><span className="block text-xs font-normal text-muted-foreground">{r.nomor_registrasi} · {r.regulasi}</span></span> },
            { judul: "Terperiksa", isi: (r: Record<string, string>) => <NamaPegawai nama={r.nama} nip={r.nip} />, kelas: "max-w-56" },
            { judul: "Tingkat", isi: (r: Record<string, string>) => <span className="flex flex-wrap gap-1"><Lencana>{r.tingkat ?? "—"}</Lencana>{r.pemotongan_ik ? <Lencana warna="waspada">IK</Lencana> : null}</span>, ponsel: true },
            { judul: "Tahap berjalan", isi: (r: Record<string, string>) => <span className="text-sm">{r.tahap ?? "—"}</span> },
            {
              judul: "Tenggat", ponsel: true,
              isi: (r: Record<string, string>) => {
                const st = statusTenggat(r.tenggat, hari, kal, Number(ambang) || 3);
                return st ? <span className="flex flex-col gap-1"><LencanaTenggat status={st} />{r.sifat === "pengingat_internal" && <span className="text-xs text-muted-foreground">pengingat internal</span>}</span> : <span className="text-muted-foreground">—</span>;
              },
            },
            { judul: "Status", isi: (r: Record<string, string>) => <LencanaStatus nama={r.status_nama} kelompok={r.kelompok} />, ponsel: true },
          ]}
        />
      )}
      <Halaman total={total} halaman={hal} perHalaman={PER} dasar={dasar} />
    </>
  );
}
