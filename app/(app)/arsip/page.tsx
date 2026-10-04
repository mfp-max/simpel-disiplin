import Link from "next/link";
import { Archive, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Catatan, JudulHalaman, Kosong } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { BilahFilter } from "@/components/simpel/bilah-filter";
import { Halaman, NamaPegawai, TabelEntri } from "@/components/simpel/tabel-entri";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { referensi } from "@/lib/pengaturan";

export const metadata = { title: "Arsip Kasus Lampau" };
const PER = 25;

export default async function DaftarArsip({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await wajibMasuk();
  const sp = await searchParams;
  const hal = Math.max(1, Number(sp.hal ?? 1));
  const pola = sp.q?.trim() ? `%${sp.q.trim()}%` : null;
  const ts = sp.q?.trim() ? sp.q.trim().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).map((w) => `${w}:*`).join(" & ") : "";

  const where = sql`e.kelas = 'arsip' and ${sp.lihat === "diarsipkan" ? sql`e.diarsipkan_pada is not null` : sql`e.diarsipkan_pada is null`}
    ${sp.kelengkapan ? sql`and e.kelengkapan_berkas = ${sp.kelengkapan}` : sql``}
    ${sp.regulasi ? sql`and e.regulasi_id = ${sp.regulasi}` : sql``}
    ${sp.dekade ? sql`and e.tahun_peristiwa between ${Number(sp.dekade)} and ${Number(sp.dekade) + 9}` : sql``}
    ${pola ? sql`and (e.judul ilike ${pola} or e.ringkasan ilike ${pola} or e.nomor_registrasi ilike ${pola} or pg.nama_lengkap_gelar ilike ${pola}
      or pg.nip ilike ${pola} or e.nama_pegawai_bebas ilike ${pola} or e.nip_bebas ilike ${pola} or cast(e.tahun_peristiwa as text) = ${sp.q!.trim()}
      ${ts ? sql`or exists (select 1 from berkas b where b.entri_id = e.id and b.cari @@ to_tsquery('simple', ${ts}))` : sql``})` : sql``}`;

  const [rows, [{ total }], kelengkapan, regulasi, dekade] = await Promise.all([
    sql`select e.id, e.nomor_registrasi, e.judul, e.tahun_peristiwa, e.kelengkapan_berkas, r.nama_singkat as regulasi,
          coalesce(pg.nama_lengkap_gelar, e.nama_pegawai_bebas) as nama, coalesce(pg.nip, e.nip_bebas) as nip,
          coalesce(h.snapshot_jenis_hukuman->>'nama', '') as hukuman,
          (select count(*) from berkas b where b.entri_id = e.id and b.diarsipkan_pada is null)::int as jml_berkas
        from entri e left join pegawai pg on pg.id = e.pegawai_id left join regulasi r on r.id = e.regulasi_id
        left join lateral (select snapshot_jenis_hukuman from hukuman where entri_id = e.id limit 1) h on true
        where ${where} order by e.tahun_peristiwa desc nulls last, e.created_at desc limit ${PER} offset ${(hal - 1) * PER}`,
    sql`select count(*)::int as total from entri e left join pegawai pg on pg.id = e.pegawai_id where ${where}`,
    referensi("kelengkapan_berkas"),
    sql`select id, nama_singkat from regulasi where utama order by berlaku_dari`,
    sql`select distinct (tahun_peristiwa / 10) * 10 as d from entri where kelas = 'arsip' and tahun_peristiwa is not null order by d desc`,
  ]);
  const labelLengkap = Object.fromEntries(kelengkapan.map((k) => [k.kode, k.label]));
  const warnaLengkap: Record<string, "aman" | "waspada" | "lewat"> = { lengkap: "aman", sebagian: "waspada", minim: "lewat" };
  const dasar = (h: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set("hal", String(h));
    return `/arsip?${u}`;
  };

  return (
    <>
      <JudulHalaman
        judul="Arsip Kasus Lampau"
        deskripsi="Kasus yang selesai sebelum SIMPEL ada. Berkas boleh tidak lengkap — satu lembar kronologi pun diterima."
        aksi={p.hak.boleh_buat ? <Button asChild size="lg"><Link href="/arsip/baru"><Plus /> Catat arsip</Link></Button> : null}
      />
      <div className="mb-4"><Catatan>Arsip tidak dihitung dalam tenggat maupun dashboard berjalan; hanya muncul di pencarian dan statistik historis. Isi pindaian yang sudah diberi teks (OCR) ikut tercari.</Catatan></div>
      <BilahFilter
        placeholder="Cari nama, NIP, tahun, uraian, atau isi pindaian…"
        filter={[
          { nama: "dekade", label: "Dekade", opsi: dekade.map((d) => ({ nilai: String(d.d), label: `${d.d}-an` })) },
          { nama: "kelengkapan", label: "Kelengkapan", opsi: kelengkapan.map((k) => ({ nilai: k.kode, label: k.label })) },
          { nama: "regulasi", label: "Peraturan", opsi: regulasi.map((r) => ({ nilai: r.id, label: r.nama_singkat })) },
        ]}
      />
      {rows.length === 0 ? (
        <Kosong ikon={Archive} judul={pola ? "Tidak ada yang cocok" : "Belum ada arsip"} deskripsi="Masukkan berkas lama satu per satu: cukup nama, tahun, dan satu baris uraian, lalu unggah pindaiannya."
          aksi={p.hak.boleh_buat && !pola ? <Button asChild><Link href="/arsip/baru"><Plus /> Catat arsip</Link></Button> : null} />
      ) : (
        <TabelEntri
          rows={rows as unknown as never[]}
          href={(r: Record<string, string>) => `/arsip/${r.id}`}
          judulKartu={(r: Record<string, string>) => <NamaPegawai nama={r.nama} />}
          subKartu={(r: Record<string, string>) => <>{r.tahun_peristiwa ?? "—"} · {r.judul}</>}
          kolom={[
            { judul: "Pegawai", isi: (r: Record<string, string>) => <NamaPegawai nama={r.nama} nip={r.nip} />, kelas: "max-w-60" },
            { judul: "Tahun", isi: (r: Record<string, string>) => r.tahun_peristiwa ?? "—" },
            { judul: "Uraian", isi: (r: Record<string, string>) => <span className="line-clamp-2">{r.judul}</span> },
            { judul: "Hukuman", isi: (r: Record<string, string>) => <span className="line-clamp-2 text-muted-foreground">{r.hukuman || "—"}{r.regulasi ? ` · ${r.regulasi}` : ""}</span> },
            { judul: "Berkas", isi: (r: Record<string, string>) => <span className="flex flex-wrap gap-1">{r.kelengkapan_berkas ? <Lencana warna={warnaLengkap[r.kelengkapan_berkas] ?? "netral"}>{labelLengkap[r.kelengkapan_berkas]}</Lencana> : null}<Lencana>{r.jml_berkas} berkas</Lencana></span>, ponsel: true },
          ]}
        />
      )}
      <Halaman total={total} halaman={hal} perHalaman={PER} dasar={dasar} />
    </>
  );
}
