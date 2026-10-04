// Antarmuka bersama semua sumber data pegawai (PRD §8.2): Excel dan API Simpega
// sama-sama menghasilkan BarisSumber, lalu diproses oleh impor.ts yang sama.

import type { BarisSumber } from "./normalisasi";

export type KodeSumber = "impor_excel" | "api_simpega";

export type StatusSumber = { aktif: boolean; pesan: string };

export interface SumberSimpega {
  kode: KodeSumber;
  nama: string;
  status(): Promise<StatusSumber>;
  /** Baris dengan nilai mentah per field tujuan. Field yang tidak ada di sumber tidak disertakan (= tidak diubah). */
  ambil(): Promise<(BarisSumber & { nomor: number })[]>;
}
