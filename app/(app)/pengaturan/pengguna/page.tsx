import { JudulHalaman } from "@/components/simpel/dasar";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { DaftarPengguna, type BarisPengguna } from "./pengguna_klien";

export const metadata = { title: "Pengguna" };

export default async function HalamanPengguna() {
  const p = await wajibHalamanHak("kelola_pengaturan");
  const [users, peran] = await Promise.all([
    sql`select u.id, u.email, u.nama, u.jabatan, u.peran_kode, u.aktif, u.terakhir_masuk, u.clerk_user_id is not null as tertaut,
          p.nama as peran_nama, p.kelola_pengaturan
        from app_users u join peran p on p.kode = u.peran_kode
        order by u.aktif desc, p.urutan, u.nama`,
    sql`select kode, nama, keterangan from peran order by urutan, nama`,
  ]);

  return (
    <>
      <JudulHalaman
        judul="Pengguna"
        deskripsi="Hanya orang yang terdaftar di sini yang dapat masuk ke SIMPEL. Tidak ada pendaftaran mandiri."
        kembali={{ href: "/pengaturan", label: "Pengaturan" }}
      />
      <DaftarPengguna
        pengguna={users.map((u) => ({ ...u, terakhir_masuk: u.terakhir_masuk ? new Date(u.terakhir_masuk).toISOString() : null })) as unknown as BarisPengguna[]}
        peran={peran as unknown as { kode: string; nama: string; keterangan: string | null }[]}
        saya={p.id}
      />
    </>
  );
}
