import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Catatan, JudulHalaman, Kosong } from "@/components/simpel/dasar";
import { Lencana, LencanaStatus } from "@/components/simpel/lencana";
import { BilahFilter } from "@/components/simpel/bilah-filter";
import { Halaman, NamaPegawai, TabelEntri } from "@/components/simpel/tabel-entri";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { referensi } from "@/lib/pengaturan";
import { tanggalPendek } from "@/lib/format";

export const metadata = { title: "Registrasi Informasi" };
const PER = 25;

export default async function DaftarInformasi({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await wajibMasuk();
  const sp = await searchParams;
  const hal = Math.max(1, Number(sp.hal ?? 1));
  const q = sp.q?.trim();
  const status = sp.status ?? "baru";
  const sumber = sp.sumber;
  const pola = q ? `%${q}%` : null;

  const where = sql`e.kelas = 'informasi'
    ${status === "arsip" ? sql`and e.diarsipkan_pada is not null` : sql`and e.diarsipkan_pada is null`}
    ${status === "baru" ? sql`and e.status_kasus = 'informasi'` : status === "dinaikkan" ? sql`and e.status_kasus = 'dinaikkan'` : status === "ditutup" ? sql`and e.status_kasus = 'tercatat'` : sql``}
    ${sumber ? sql`and e.sumber_informasi = ${sumber}` : sql``}
    ${pola ? sql`and (e.judul ilike ${pola} or e.nomor_registrasi ilike ${pola} or e.ringkasan ilike ${pola} or pg.nama_lengkap_gelar ilike ${pola} or pg.nip ilike ${pola} or e.nama_pegawai_bebas ilike ${pola} or e.pelapor_nama ilike ${pola})` : sql``}`;

  const [rows, [{ total }], sumberRef] = await Promise.all([
    sql`select e.id, e.nomor_registrasi, e.judul, e.created_at, e.tanggal_peristiwa, e.sumber_informasi, e.pelapor_nama, e.status_kasus,
          s.nama as status_nama, s.kelompok, coalesce(pg.nama_lengkap_gelar, e.nama_pegawai_bebas) as nama, coalesce(pg.nip, e.nip_bebas) as nip,
          (select count(*) from berkas b where b.entri_id = e.id and b.diarsipkan_pada is null)::int as jml_berkas
        from entri e join status_kasus s on s.kode = e.status_kasus left join pegawai pg on pg.id = e.pegawai_id
        where ${where} order by e.created_at desc limit ${PER} offset ${(hal - 1) * PER}`,
    sql`select count(*)::int as total from entri e left join pegawai pg on pg.id = e.pegawai_id where ${where}`,
    referensi("sumber_informasi"),
  ]);
  const labelSumber = Object.fromEntries(sumberRef.map((s) => [s.kode, s.label]));
  const dasar = (h: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set("hal", String(h));
    return `/informasi?${u}`;
  };

  return (
    <>
      <JudulHalaman
        judul="Registrasi Informasi"
        deskripsi="Surat masuk, laporan lisan, disposisi, atau temuan yang menyebut dugaan pelanggaran tetapi belum menjadi perkara."
        aksi={p.hak.boleh_buat ? <Button asChild size="lg"><Link href="/informasi/baru"><Plus /> Catat informasi</Link></Button> : null}
      />
      <div className="mb-4">
        <Catatan jenis="info">
          Informasi <strong>tidak dihitung</strong> dalam angka kasus, tenggat, maupun statistik. Setelah terlapor teridentifikasi dan ada pelapor bernama atau bukti,
          gunakan tombol <strong>Naikkan jadi kasus</strong> di halaman detailnya.
        </Catatan>
      </div>
      <BilahFilter
        placeholder="Cari judul, nomor registrasi, nama terlapor, pelapor…"
        filter={[
          { nama: "status", label: "Status", opsi: [{ nilai: "baru", label: "Belum berproses" }, { nilai: "dinaikkan", label: "Sudah jadi kasus" }, { nilai: "ditutup", label: "Ditutup" }, { nilai: "semua", label: "Semua" }, { nilai: "arsip", label: "Diarsipkan" }] },
          { nama: "sumber", label: "Sumber", opsi: sumberRef.map((s) => ({ nilai: s.kode, label: s.label })) },
        ]}
      />
      {rows.length === 0 ? (
        <Kosong ikon={Inbox} judul={q ? "Tidak ada yang cocok" : "Belum ada informasi"} deskripsi={q ? "Coba kata kunci lain atau hapus filter." : "Catat setiap surat atau laporan dugaan pelanggaran agar tidak hilang, walaupun belum lengkap."}
          aksi={p.hak.boleh_buat && !q ? <Button asChild><Link href="/informasi/baru"><Plus /> Catat informasi</Link></Button> : null} />
      ) : (
        <TabelEntri
          rows={rows as unknown as never[]}
          href={(r: Record<string, string>) => `/informasi/${r.id}`}
          judulKartu={(r: Record<string, string>) => r.judul}
          subKartu={(r: Record<string, string>) => <>{r.nomor_registrasi} · <NamaPegawai nama={r.nama} /></>}
          kolom={[
            { judul: "Informasi", isi: (r: Record<string, string>) => <span><span className="block">{r.judul}</span><span className="block text-xs font-normal text-muted-foreground">{r.nomor_registrasi}</span></span> },
            { judul: "Terlapor", isi: (r: Record<string, string>) => <NamaPegawai nama={r.nama} nip={r.nip} />, kelas: "max-w-56" },
            { judul: "Sumber", isi: (r: Record<string, string>) => <Lencana>{labelSumber[r.sumber_informasi] ?? "—"}</Lencana>, ponsel: true },
            { judul: "Dicatat", isi: (r: Record<string, string>) => <span className="whitespace-nowrap">{tanggalPendek(r.created_at as unknown as Date)}</span> },
            { judul: "Status", isi: (r: Record<string, string>) => <LencanaStatus nama={r.status_nama} kelompok={r.kelompok} />, ponsel: true },
          ]}
        />
      )}
      <Halaman total={total} halaman={hal} perHalaman={PER} dasar={dasar} />
    </>
  );
}
