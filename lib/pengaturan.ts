import "server-only";
import { cache } from "react";
import { sql } from "@/lib/db";

export const semuaPengaturan = cache(async () => {
  const rows = await sql`select kunci, nilai from pengaturan`;
  return Object.fromEntries(rows.map((r) => [r.kunci, r.nilai])) as Record<string, unknown>;
});

export async function pengaturan<T = unknown>(kunci: string, bawaan: T): Promise<T> {
  const s = await semuaPengaturan();
  const v = s[kunci];
  return (v === undefined || v === null || v === "" ? bawaan : v) as T;
}

export type Referensi = { kode: string; label: string; keterangan: string | null };

export const referensi = cache(async (kategori: string): Promise<Referensi[]> => {
  return (await sql`select kode, label, keterangan from kode_referensi where kategori = ${kategori} and aktif order by urutan, label`) as unknown as Referensi[];
});

export const semuaReferensi = cache(async () => {
  const rows = await sql`select kategori, kode, label from kode_referensi where aktif order by urutan`;
  const m: Record<string, Record<string, string>> = {};
  for (const r of rows) (m[r.kategori] ??= {})[r.kode] = r.label;
  return m;
});

export const daftarStatusKasus = cache(async () => {
  return (await sql`select kode, nama, urutan, kelompok, warna from status_kasus order by urutan`) as unknown as {
    kode: string; nama: string; urutan: number; kelompok: string; warna: string | null;
  }[];
});
