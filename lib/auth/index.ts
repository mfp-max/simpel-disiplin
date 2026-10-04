import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { GalatPengguna } from "@/lib/galat";

export type Hak = {
  boleh_buat: boolean;
  boleh_ubah: boolean;
  boleh_ubah_status: boolean;
  boleh_arsipkan: boolean;
  kelola_pengaturan: boolean;
  boleh_musnahkan: boolean;
  boleh_lihat_audit: boolean;
};

export type Pengguna = {
  id: string;
  email: string;
  nama: string;
  jabatan: string | null;
  peran_kode: string;
  peran_nama: string;
  hak: Hak;
};

async function cariPengguna(where: { clerk?: string; emails?: string[] }) {
  const rows = where.clerk
    ? await sql`select u.id, u.email, u.nama, u.jabatan, u.peran_kode, u.aktif, u.clerk_user_id, p.nama as peran_nama,
          p.boleh_buat, p.boleh_ubah, p.boleh_ubah_status, p.boleh_arsipkan, p.kelola_pengaturan, p.boleh_musnahkan, p.boleh_lihat_audit
        from app_users u join peran p on p.kode = u.peran_kode where u.clerk_user_id = ${where.clerk}`
    : await sql`select u.id, u.email, u.nama, u.jabatan, u.peran_kode, u.aktif, u.clerk_user_id, p.nama as peran_nama,
          p.boleh_buat, p.boleh_ubah, p.boleh_ubah_status, p.boleh_arsipkan, p.kelola_pengaturan, p.boleh_musnahkan, p.boleh_lihat_audit
        from app_users u join peran p on p.kode = u.peran_kode where lower(u.email) in ${sql(where.emails!.map((e) => e.toLowerCase()))}`;
  return rows[0];
}

function keObjek(r: Record<string, unknown>): Pengguna {
  return {
    id: r.id as string, email: r.email as string, nama: r.nama as string, jabatan: r.jabatan as string | null,
    peran_kode: r.peran_kode as string, peran_nama: r.peran_nama as string,
    hak: {
      boleh_buat: !!r.boleh_buat, boleh_ubah: !!r.boleh_ubah, boleh_ubah_status: !!r.boleh_ubah_status, boleh_arsipkan: !!r.boleh_arsipkan,
      kelola_pengaturan: !!r.kelola_pengaturan, boleh_musnahkan: !!r.boleh_musnahkan, boleh_lihat_audit: !!r.boleh_lihat_audit,
    },
  };
}

/**
 * Pengguna yang sedang masuk, ATAU null bila email-nya tidak ada di daftar
 * izin / dinonaktifkan. Saat login pertama, clerk_user_id ditautkan otomatis.
 */
export const penggunaSaatIni = cache(async (): Promise<Pengguna | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  const row = await cariPengguna({ clerk: userId });
  if (row) return row.aktif ? keObjek(row) : null;

  const u = await currentUser();
  const emails = (u?.emailAddresses ?? []).filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress);
  if (!emails.length) return null;
  const calon = await cariPengguna({ emails });
  if (!calon || !calon.aktif) return null;
  if (calon.clerk_user_id && calon.clerk_user_id !== userId) return null;

  await sql`update app_users set clerk_user_id = ${userId}, terakhir_masuk = now() where id = ${calon.id}`;
  const p = keObjek(calon);
  await catatAudit(p, { aksi: "masuk", tabel: "app_users", record_id: p.id, ringkasan: { keterangan: "Login pertama — akun Clerk ditautkan" } });
  return p;
});

/** Untuk halaman: belum login → /masuk; tidak diizinkan → /akses-ditolak. */
export async function wajibMasuk(): Promise<Pengguna> {
  const { userId } = await auth();
  if (!userId) redirect("/masuk");
  const p = await penggunaSaatIni();
  if (!p) redirect("/akses-ditolak");
  return p;
}

/** Untuk aksi server & halaman yang memerlukan hak tertentu. */
export async function wajibHak(hak: keyof Hak): Promise<Pengguna> {
  const p = await penggunaSaatIni();
  if (!p) throw new GalatPengguna("Sesi Anda telah berakhir. Silakan masuk kembali.");
  if (!p.hak[hak]) throw new GalatPengguna("Anda tidak memiliki hak untuk melakukan tindakan ini.");
  return p;
}

export async function wajibPengguna(): Promise<Pengguna> {
  const p = await penggunaSaatIni();
  if (!p) throw new GalatPengguna("Sesi Anda telah berakhir. Silakan masuk kembali.");
  return p;
}

/** Halaman khusus admin (Pengaturan). */
export async function wajibHalamanHak(hak: keyof Hak): Promise<Pengguna> {
  const p = await wajibMasuk();
  if (!p.hak[hak]) redirect("/beranda?galat=hak");
  return p;
}
