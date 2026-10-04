import { JudulHalaman } from "@/components/simpel/dasar";
import { FormEntriBaru } from "@/components/simpel/form-entri";
import { wajibHalamanHak } from "@/lib/auth";
import { referensi } from "@/lib/pengaturan";
import { buatEntriSederhana } from "@/app/(app)/_aksi/entri";

export const metadata = { title: "Catat informasi" };

export default async function InformasiBaru() {
  await wajibHalamanHak("boleh_buat");
  const sumber = await referensi("sumber_informasi");
  return (
    <div className="mx-auto max-w-3xl">
      <JudulHalaman
        judul="Catat informasi baru"
        deskripsi="Cukup isi judulnya bila informasi masih minim — yang penting tercatat. Detail lain bisa dilengkapi kemudian."
        kembali={{ href: "/informasi", label: "Registrasi Informasi" }}
      />
      <FormEntriBaru kelas="informasi" aksi={buatEntriSederhana} sumber={sumber.map((s) => ({ kode: s.kode, label: s.label }))} kembaliKe="/informasi" />
    </div>
  );
}
