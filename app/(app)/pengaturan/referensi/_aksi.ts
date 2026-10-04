"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { sql, transaksi } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";

export type IsianReferensi = { label: string; urutan: number; aktif: boolean; keterangan: string };

function rapikan(x: IsianReferensi) {
  const label = x.label.trim();
  if (label.length < 2) throw new GalatPengguna("Label minimal 2 huruf.");
  return { label, urutan: Math.max(0, Math.round(Number(x.urutan) || 0)), aktif: !!x.aktif, keterangan: x.keterangan.trim() || null };
}

function cekKategori(k: string) {
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(k)) throw new GalatPengguna("Kategori tidak valid.");
}

export async function tambahReferensi(kategori: string, kode: string, isian: IsianReferensi) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    cekKategori(kategori);
    const k = kode.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!/^[a-z0-9][a-z0-9_]{0,40}$/.test(k)) throw new GalatPengguna("Kode hanya boleh huruf kecil, angka, dan garis bawah (mis. surat_elektronik).");
    const d = rapikan(isian);
    const [ada] = await sql`select label from kode_referensi where kategori = ${kategori} and kode = ${k}`;
    if (ada) throw new GalatPengguna(`Kode "${k}" sudah dipakai untuk "${ada.label}".`);
    await transaksi(async (tx) => {
      await tx`insert into kode_referensi ${tx({ kategori, kode: k, ...d })}`;
      await catatAudit(p, { aksi: "buat", tabel: "kode_referensi", record_id: `${kategori}/${k}`, ringkasan: { kategori, kode: k, ...d } }, tx);
    });
    revalidatePath("/pengaturan/referensi");
  }, "Kode referensi ditambahkan");
}

export async function ubahReferensi(kategori: string, kode: string, isian: IsianReferensi) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const d = rapikan(isian);
    await transaksi(async (tx) => {
      const [lama] = await tx`select label, urutan, aktif, keterangan from kode_referensi where kategori = ${kategori} and kode = ${kode}`;
      if (!lama) throw new GalatPengguna("Kode referensi tidak ditemukan.");
      await tx`update kode_referensi set ${tx(d)} where kategori = ${kategori} and kode = ${kode}`;
      await catatAudit(p, { aksi: "ubah", tabel: "kode_referensi", record_id: `${kategori}/${kode}`, ringkasan: selisih(lama, d) }, tx);
    });
    revalidatePath("/pengaturan/referensi");
  }, "Kode referensi diperbarui");
}
