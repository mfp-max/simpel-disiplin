import Link from "next/link";
import { HandHeart, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Catatan, JudulHalaman, Kosong } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { BilahFilter } from "@/components/simpel/bilah-filter";
import { Halaman, NamaPegawai, TabelEntri } from "@/components/simpel/tabel-entri";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { referensi } from "@/lib/pengaturan";
import { tanggalPendek } from "@/lib/format";

export const metadata = { title: "Pembinaan" };
const PER = 25;

export default async function DaftarPembinaan({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await wajibMasuk();
  const sp = await searchParams;
  const hal = Math.max(1, Number(sp.hal ?? 1));
  const pola = sp.q?.trim() ? `%${sp.q.trim()}%` : null;
  const where = sql`e.kelas = 'non_hukdis' and e.diarsipkan_pada is null
    ${sp.jenis ? sql`and e.jenis_non_hukdis = ${sp.jenis}` : sql``}
    ${pola ? sql`and (e.judul ilike ${pola} or e.nomor_registrasi ilike ${pola} or pg.nama_lengkap_gelar ilike ${pola} or pg.nip ilike ${pola} or e.nama_pegawai_bebas ilike ${pola})` : sql``}`;
  const [rows, [{ total }], jenis] = await Promise.all([
    sql`select e.id, e.nomor_registrasi, e.judul, e.tanggal_peristiwa, e.created_at, e.jenis_non_hukdis,
          coalesce(pg.nama_lengkap_gelar, e.nama_pegawai_bebas) as nama, coalesce(pg.nip, e.nip_bebas) as nip, pg.unit_kerja
        from entri e left join pegawai pg on pg.id = e.pegawai_id where ${where}
        order by coalesce(e.tanggal_peristiwa, e.created_at::date) desc limit ${PER} offset ${(hal - 1) * PER}`,
    sql`select count(*)::int as total from entri e left join pegawai pg on pg.id = e.pegawai_id where ${where}`,
    referensi("jenis_non_hukdis"),
  ]);
  const labelJenis = Object.fromEntries(jenis.map((j) => [j.kode, j.label]));
  const dasar = (h: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set("hal", String(h));
    return `/pembinaan?${u}`;
  };
  return (
    <>
      <JudulHalaman
        judul="Pembinaan"
        deskripsi="Teguran pembinaan, pelanggaran kode etik, konseling, dan peringatan lisan atasan — bukan hukuman disiplin."
        aksi={p.hak.boleh_buat ? <Button asChild size="lg"><Link href="/pembinaan/baru"><Plus /> Catat pembinaan</Link></Button> : null}
      />
      <div className="mb-4"><Catatan>Catatan pembinaan tidak menjalani tahapan pemeriksaan formal dan tidak menghasilkan keputusan hukuman disiplin, tetapi tampil sebagai riwayat bila kelak ada kasus.</Catatan></div>
      <BilahFilter placeholder="Cari nama, NIP, judul…" filter={[{ nama: "jenis", label: "Jenis", opsi: jenis.map((j) => ({ nilai: j.kode, label: j.label })) }]} />
      {rows.length === 0 ? (
        <Kosong ikon={HandHeart} judul={pola ? "Tidak ada yang cocok" : "Belum ada catatan pembinaan"} aksi={p.hak.boleh_buat && !pola ? <Button asChild><Link href="/pembinaan/baru"><Plus /> Catat pembinaan</Link></Button> : null} />
      ) : (
        <TabelEntri
          rows={rows as unknown as never[]}
          href={(r: Record<string, string>) => `/pembinaan/${r.id}`}
          judulKartu={(r: Record<string, string>) => <NamaPegawai nama={r.nama} />}
          subKartu={(r: Record<string, string>) => r.judul}
          kolom={[
            { judul: "Pegawai", isi: (r: Record<string, string>) => <NamaPegawai nama={r.nama} nip={r.nip} />, kelas: "max-w-60" },
            { judul: "Judul", isi: (r: Record<string, string>) => <span className="line-clamp-2">{r.judul}</span> },
            { judul: "Jenis", isi: (r: Record<string, string>) => <Lencana>{labelJenis[r.jenis_non_hukdis] ?? "—"}</Lencana>, ponsel: true },
            { judul: "Tanggal", isi: (r: Record<string, string>) => <span className="whitespace-nowrap">{tanggalPendek(r.tanggal_peristiwa ?? (r.created_at as unknown as Date))}</span> },
          ]}
        />
      )}
      <Halaman total={total} halaman={hal} perHalaman={PER} dasar={dasar} />
    </>
  );
}
