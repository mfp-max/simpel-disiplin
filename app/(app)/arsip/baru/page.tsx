import { JudulHalaman } from "@/components/simpel/dasar";
import { FormEntriBaru } from "@/components/simpel/form-entri";
import { wajibHalamanHak } from "@/lib/auth";
import { referensi } from "@/lib/pengaturan";
import { opsiRegulasiUtama } from "@/lib/opsi";
import { buatEntriSederhana } from "@/app/(app)/_aksi/entri";

export const metadata = { title: "Catat arsip" };

export default async function ArsipBaru() {
  await wajibHalamanHak("boleh_buat");
  const [kelengkapan, regulasi] = await Promise.all([referensi("kelengkapan_berkas"), opsiRegulasiUtama()]);
  return (
    <div className="mx-auto max-w-3xl">
      <JudulHalaman
        judul="Catat arsip kasus lampau"
        deskripsi="Wajib hanya: nama pegawai, tahun kejadian, dan satu baris uraian. Pindaian berkas diunggah di langkah berikutnya."
        kembali={{ href: "/arsip", label: "Arsip Kasus Lampau" }}
      />
      <FormEntriBaru kelas="arsip" aksi={buatEntriSederhana} kelengkapan={kelengkapan} regulasi={regulasi} kembaliKe="/arsip" />
    </div>
  );
}
