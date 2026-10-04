import { JudulHalaman } from "@/components/simpel/dasar";
import { FormEntriBaru } from "@/components/simpel/form-entri";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { referensi } from "@/lib/pengaturan";
import { buatEntriSederhana } from "@/app/(app)/_aksi/entri";

export const metadata = { title: "Catat pembinaan" };

export default async function PembinaanBaru({ searchParams }: { searchParams: Promise<{ dari?: string }> }) {
  await wajibHalamanHak("boleh_buat");
  const { dari } = await searchParams;
  const jenis = await referensi("jenis_non_hukdis");
  let awal = undefined;
  if (dari) {
    const [inf] = await sql`select e.id, e.judul, e.ringkasan, e.tanggal_peristiwa, pg.id as pid, pg.nip, pg.nama_lengkap_gelar, pg.unit_kerja,
        pg.status_pegawai, pg.golongan_ruang, pg.jabatan_fungsional as jabatan, pg.rezim_kode
      from entri e left join pegawai pg on pg.id = e.pegawai_id where e.id = ${dari} and e.kelas = 'informasi'`;
    if (inf) {
      awal = {
        judul: inf.judul, ringkasan: inf.ringkasan, tanggalPeristiwa: inf.tanggal_peristiwa, berasalDariId: inf.id,
        pegawai: inf.pid ? { id: inf.pid, nip: inf.nip, nama_lengkap_gelar: inf.nama_lengkap_gelar, unit_kerja: inf.unit_kerja, status_pegawai: inf.status_pegawai, golongan_ruang: inf.golongan_ruang, jabatan: inf.jabatan, rezim_kode: inf.rezim_kode } : null,
      };
    }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <JudulHalaman judul="Catat pembinaan" deskripsi="Untuk pembinaan yang bukan hukuman disiplin." kembali={{ href: "/pembinaan", label: "Pembinaan" }} />
      <FormEntriBaru kelas="non_hukdis" aksi={buatEntriSederhana} jenisNonHukdis={jenis} awal={awal} kembaliKe="/pembinaan" />
    </div>
  );
}
