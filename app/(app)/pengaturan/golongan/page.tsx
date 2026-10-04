import { JudulHalaman, Catatan } from "@/components/simpel/dasar";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { TabelGolongan } from "./golongan_klien";
import type { BarisGolongan } from "./_aksi";

export const metadata = { title: "Golongan ruang" };

export default async function HalamanGolongan() {
  await wajibHalamanHak("kelola_pengaturan");
  const rows = await sql`select kode, pangkat, urutan from golongan_ruang order by urutan, kode`;
  return (
    <>
      <JudulHalaman
        judul="Golongan ruang"
        deskripsi="Daftar golongan/pangkat beserta urutan jenjangnya. Urutan dipakai untuk memeriksa bahwa pemeriksa tidak berpangkat lebih rendah daripada terperiksa."
        kembali={{ href: "/pengaturan", label: "Pengaturan" }}
      />
      <div className="mb-5">
        <Catatan jenis="info">Angka urutan yang lebih besar berarti jenjang lebih tinggi. Kode golongan tidak dapat diubah karena tersimpan di data pegawai hasil impor.</Catatan>
      </div>
      <TabelGolongan key={rows.map((r) => `${r.kode}:${r.pangkat}:${r.urutan}`).join("|")} baris={rows as unknown as BarisGolongan[]} />
    </>
  );
}
