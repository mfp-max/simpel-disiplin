import { Catatan, JudulHalaman } from "@/components/simpel/dasar";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { DaftarStatus, type BarisStatus } from "./status_klien";

export const metadata = { title: "Status Pegawai" };

export default async function HalamanStatusPegawai() {
  await wajibHalamanHak("kelola_pengaturan");
  const [rows, takDikenal, rezim, [selisih]] = await Promise.all([
    sql`select ps.status_pegawai, ps.rezim_kode, ps.keterangan,
          (select count(*) from pegawai p where lower(p.status_pegawai) = lower(ps.status_pegawai) and p.diarsipkan_pada is null)::int as jumlah,
          (select count(*) from pegawai p where lower(p.status_pegawai) = lower(ps.status_pegawai) and p.diarsipkan_pada is null and p.rezim_manual)::int as manual
        from pemetaan_status_pegawai ps order by ps.rezim_kode nulls last, ps.status_pegawai`,
    sql`select p.status_pegawai, count(*)::int as jumlah from pegawai p
        where p.status_pegawai is not null and p.diarsipkan_pada is null
          and not exists (select 1 from pemetaan_status_pegawai ps where lower(ps.status_pegawai) = lower(p.status_pegawai))
        group by 1 order by 2 desc`,
    sql`select kode, nama from rezim where aktif order by urutan`,
    // pegawai yang rezimnya belum sesuai pemetaan (perlu "terapkan ulang")
    sql`select count(*)::int as n from pegawai pg left join pemetaan_status_pegawai ps on lower(ps.status_pegawai) = lower(pg.status_pegawai)
        where not pg.rezim_manual and pg.rezim_kode is distinct from ps.rezim_kode`,
  ]);

  return (
    <>
      <JudulHalaman
        judul="Status Pegawai"
        kembali={{ href: "/pengaturan", label: "Pengaturan" }}
        deskripsi="Pemetaan nilai kolom “Status Pegawai” Simpega ke rezim disiplin. Rezim menentukan peraturan yang dipakai untuk kasus baru."
      />
      <div className="space-y-6">
        <Catatan jenis="info">
          Status yang dipetakan ke <strong>Perlu verifikasi</strong> membuat pegawai tidak memiliki rezim otomatis; dasar hukum kasusnya harus
          ditetapkan manual. Pegawai yang rezimnya diubah manual di halaman detail pegawai tidak terpengaruh oleh pemetaan ini.
        </Catatan>
        <DaftarStatus
          baris={rows as unknown as BarisStatus[]}
          takDikenal={takDikenal.map((t) => ({ status: t.status_pegawai as string, jumlah: t.jumlah as number }))}
          rezim={rezim.map((r) => ({ kode: r.kode as string, nama: r.nama as string }))}
          perluTerapkan={selisih.n as number}
        />
      </div>
    </>
  );
}
