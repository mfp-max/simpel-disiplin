"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { sql, transaksi } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";

const HAK = ["boleh_buat", "boleh_ubah", "boleh_ubah_status", "boleh_arsipkan", "kelola_pengaturan", "boleh_musnahkan", "boleh_lihat_audit"] as const;
type KunciHak = (typeof HAK)[number];
export type IsianPeran = { nama: string; keterangan: string; urutan: number } & Record<KunciHak, boolean>;

function rapikan(x: IsianPeran) {
  const nama = x.nama.trim();
  if (nama.length < 2) throw new GalatPengguna("Nama peran minimal 2 huruf.");
  const out: Record<string, unknown> = { nama, keterangan: x.keterangan.trim() || null, urutan: Math.max(0, Math.round(Number(x.urutan) || 0)) };
  for (const k of HAK) out[k] = !!x[k];
  return out as { nama: string; keterangan: string | null; urutan: number } & Record<KunciHak, boolean>;
}

export async function simpanPeran(kode: string, isian: IsianPeran, alasan: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    if (!alasan || alasan.trim().length < 5) throw new GalatPengguna("Tuliskan alasan perubahan hak akses (minimal 5 huruf).");
    const d = rapikan(isian);
    await transaksi(async (tx) => {
      const [lama] = await tx`select * from peran where kode = ${kode} for update`;
      if (!lama) throw new GalatPengguna("Peran tidak ditemukan.");
      if (lama.kelola_pengaturan && !d.kelola_pengaturan) {
        if (p.peran_kode === kode) throw new GalatPengguna("Anda tidak dapat mencabut hak kelola pengaturan dari peran Anda sendiri. Mintalah admin dengan peran lain melakukannya.");
        const [{ n }] = await tx`select count(*)::int as n from app_users u join peran r on r.kode = u.peran_kode
          where u.aktif and r.kelola_pengaturan and r.kode <> ${kode}`;
        if (n === 0) throw new GalatPengguna("Perubahan ditolak: tidak akan ada lagi pengguna aktif yang dapat mengelola pengaturan.");
      }
      await tx`update peran set ${tx(d)} where kode = ${kode}`;
      const sebelum: Record<string, unknown> = { nama: lama.nama, keterangan: lama.keterangan, urutan: lama.urutan };
      for (const k of HAK) sebelum[k] = lama[k];
      await catatAudit(p, { aksi: "ubah", tabel: "peran", record_id: kode, alasan: alasan.trim(), ringkasan: selisih(sebelum, d) }, tx);
    });
    revalidatePath("/pengaturan/peran");
    revalidatePath("/", "layout");
  }, "Hak akses peran disimpan");
}

export async function tambahPeran(kode: string, isian: IsianPeran) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const k = kode.trim().toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(k)) throw new GalatPengguna("Kode peran hanya boleh huruf kecil, angka, dan garis bawah (mis. sekretaris_tim).");
    const d = rapikan(isian);
    const [ada] = await sql`select 1 from peran where kode = ${k}`;
    if (ada) throw new GalatPengguna("Kode peran sudah dipakai.");
    await transaksi(async (tx) => {
      await tx`insert into peran ${tx({ kode: k, ...d })}`;
      await catatAudit(p, { aksi: "buat", tabel: "peran", record_id: k, ringkasan: { kode: k, ...d } }, tx);
    });
    revalidatePath("/pengaturan/peran");
  }, "Peran baru ditambahkan");
}
