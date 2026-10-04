"use server";

import { wajibPengguna } from "@/lib/auth";
import { jalankan } from "@/lib/galat";
import { kalkulatorAmbang, kalkulatorBerlaku } from "@/lib/laporan";

/** "Kapan SK mulai berlaku?" — aturan dibaca dari katalog peraturan terpilih. */
export async function hitungBerlakuSk(m: { rezim: string | null; regulasiId: string | null; tanggalDiterima: string }) {
  return jalankan(async () => {
    await wajibPengguna();
    return kalkulatorBerlaku({ rezim: m.rezim || null, regulasiId: m.regulasiId || null, tanggalDiterima: String(m.tanggalDiterima ?? "") });
  });
}

/** Kalkulator ambang kehadiran (peraturan otomatis dari rezim + tanggal peristiwa). */
export async function hitungAmbangKehadiran(m: { rezim: string | null; regulasiId: string | null; tanggalPeristiwa: string; hari: number; berturut: boolean }) {
  return jalankan(async () => {
    await wajibPengguna();
    return kalkulatorAmbang({
      rezim: m.rezim || null, regulasiId: m.regulasiId || null, tanggalPeristiwa: String(m.tanggalPeristiwa ?? ""),
      hari: Number(m.hari), berturut: !!m.berturut,
    });
  });
}
