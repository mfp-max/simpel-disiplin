import { JudulHalaman, Catatan } from "@/components/simpel/dasar";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { DaftarPeran, type BarisPeran } from "./peran_klien";

export const metadata = { title: "Peran & hak akses" };

export default async function HalamanPeran() {
  const p = await wajibHalamanHak("kelola_pengaturan");
  const rows = await sql`select r.kode, r.nama, r.urutan, r.keterangan, r.boleh_buat, r.boleh_ubah, r.boleh_ubah_status, r.boleh_arsipkan,
      r.kelola_pengaturan, r.boleh_musnahkan, r.boleh_lihat_audit,
      (select count(*)::int from app_users u where u.peran_kode = r.kode and u.aktif) as jumlah
    from peran r order by r.urutan, r.nama`;
  return (
    <>
      <JudulHalaman
        judul="Peran & hak akses"
        deskripsi="Semua pengguna dapat melihat semua kasus. Peran hanya membedakan siapa yang boleh membuat, mengubah, mengarsipkan, dan mengelola pengaturan."
        kembali={{ href: "/pengaturan", label: "Pengaturan" }}
      />
      <div className="mb-5">
        <Catatan jenis="info">
          Perubahan hak berlaku pada halaman berikutnya yang dibuka pengguna. Setiap perubahan wajib disertai alasan dan tercatat di log audit.
          SIMPEL selalu menyisakan sedikitnya satu pengguna aktif yang dapat mengelola pengaturan.
        </Catatan>
      </div>
      <DaftarPeran peran={rows as unknown as BarisPeran[]} peranSaya={p.peran_kode} />
    </>
  );
}
