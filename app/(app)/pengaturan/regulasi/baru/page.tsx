import { JudulHalaman } from "@/components/simpel/dasar";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { muatLibur, muatOpsiUmum } from "../_data";
import { WizardRegulasi, type RegulasiPilihan } from "../_komponen/wizard-klien";

export const dynamic = "force-dynamic";

export default async function HalamanTambahRegulasi() {
  await wajibHalamanHak("kelola_pengaturan");
  const [daftar, ctx, libur] = await Promise.all([
    sql`select id, kode, nama_singkat, judul, jenis, rezim_kode, utama, status from regulasi
      order by utama desc, status = 'aktif' desc, berlaku_dari desc nulls last`,
    muatOpsiUmum(),
    muatLibur(),
  ]);
  return (
    <div className="mx-auto max-w-6xl">
      <JudulHalaman
        kembali={{ href: "/pengaturan/regulasi", label: "Daftar peraturan" }}
        judul="Tambah peraturan baru"
        deskripsi="Enam langkah: identitas, salin dari peraturan lama, sunting kewajiban & larangan, sunting hukuman dan aturan proses, uji dengan kasus contoh, lalu aktifkan. Isian tersimpan otomatis di peramban ini."
      />
      <WizardRegulasi daftar={daftar as unknown as RegulasiPilihan[]} ctxUmum={ctx} libur={libur} />
    </div>
  );
}
