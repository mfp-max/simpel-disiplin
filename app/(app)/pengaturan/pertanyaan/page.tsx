import { JudulHalaman, Catatan } from "@/components/simpel/dasar";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { KelolaPertanyaan, type ButirBaku, type ButirBank } from "./pertanyaan_klien";

export const metadata = { title: "Pertanyaan pemeriksaan" };

export default async function HalamanPertanyaan() {
  await wajibHalamanHak("kelola_pengaturan");
  const [baku, bank] = await Promise.all([
    sql`select id, bagian, urutan, pertanyaan, aktif from pertanyaan_baku
        order by array_position(array['pembuka','substansi','penutup']::text[], bagian), urutan, created_at`,
    sql`select id, nama_set, jenis_pelanggaran, urutan, pertanyaan, aktif from bank_pertanyaan order by nama_set, urutan, created_at`,
  ]);
  return (
    <>
      <JudulHalaman
        judul="Pertanyaan pemeriksaan"
        deskripsi="Pertanyaan yang otomatis muncul di mode sidang dan Berita Acara Pemeriksaan, serta bank pertanyaan substansi yang bisa disisipkan notulis."
        kembali={{ href: "/pengaturan", label: "Pengaturan" }}
      />
      <div className="mb-5">
        <Catatan jenis="info">
          Perubahan hanya berlaku untuk sesi pemeriksaan yang <strong>dibuka setelah ini</strong>. Sesi dan BAP yang sudah ada menyimpan salinan pertanyaannya sendiri, sehingga tidak ikut berubah.
        </Catatan>
      </div>
      <KelolaPertanyaan baku={baku as unknown as ButirBaku[]} bank={bank as unknown as ButirBank[]} />
    </>
  );
}
