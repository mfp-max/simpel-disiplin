// Adapter sumber Excel (tarikan "laporan rekap" Simpega).
// Dipakai di PERAMBAN (wizard impor — berkas tidak dikirim ke server; hanya kolom
// yang dipetakan & diizinkan yang dikirim) dan di skrip impor.
// Pemetaan SELALU berdasarkan indeks kolom, bukan nama header (nama header Simpega berulang).

import * as XLSX from "xlsx";
import { adalahField, kolomTerlarang, type BarisSumber, type FieldPegawai } from "./normalisasi";
import type { SumberSimpega } from "./jenis";

export type LembarExcel = {
  /** Nama header per indeks kolom (bisa kosong / berulang). */
  header: string[];
  /** Isi sel sebagai teks, per baris data (tanpa baris header). Baris kosong dibuang. */
  baris: string[][];
  namaLembar: string;
};

/** Pemetaan indeks kolom → field tujuan (sama dengan isi profil_impor.pemetaan). */
export type PemetaanKolom = Record<number, FieldPegawai | null | undefined>;

/** Membaca lembar pertama workbook. Header di baris 1. Semua sel dibaca sebagai teks tampilan. */
export function bacaWorkbook(data: ArrayBuffer | Uint8Array): LembarExcel {
  const wb = XLSX.read(data, { type: "array", cellDates: false, dense: true });
  const namaLembar = wb.SheetNames[0];
  if (!namaLembar) throw new Error("Berkas tidak memiliki lembar kerja.");
  const ws = wb.Sheets[namaLembar];
  const semua = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: false });
  const [kepala = [], ...isi] = semua;
  const lebar = Math.max(kepala.length, ...isi.slice(0, 50).map((r) => r.length));
  const header = Array.from({ length: lebar }, (_, i) => String(kepala[i] ?? "").trim());
  const baris = isi
    .map((r) => Array.from({ length: lebar }, (_, i) => String(r[i] ?? "").trim()))
    .filter((r) => r.some((v) => v !== ""));
  return { header, baris, namaLembar };
}

/** Kolom yang dipetakan dan sah (bukan kolom terlarang, field ada di daftar putih, tidak ganda). */
export function kolomTerpetakan(header: string[], pemetaan: PemetaanKolom) {
  const hasil: { indeks: number; header: string; field: FieldPegawai }[] = [];
  const terpakai = new Set<string>();
  for (const [k, f] of Object.entries(pemetaan)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= header.length || !f || !adalahField(f)) continue;
    if (kolomTerlarang(header[i])) continue; // ditolak keras
    if (terpakai.has(f)) continue;
    terpakai.add(f);
    hasil.push({ indeks: i, header: header[i], field: f });
  }
  return hasil.sort((a, b) => a.indeks - b.indeks);
}

/** Mengubah baris mentah menjadi BarisSumber (hanya field yang dipetakan & diizinkan). */
export function petakanBaris(lembar: LembarExcel, pemetaan: PemetaanKolom): (BarisSumber & { nomor: number })[] {
  const kolom = kolomTerpetakan(lembar.header, pemetaan);
  return lembar.baris.map((r, idx) => {
    const o: BarisSumber & { nomor: number } = { nomor: idx + 2 }; // nomor baris di Excel (header = baris 1)
    for (const k of kolom) o[k.field] = r[k.indeks] ?? "";
    return o;
  });
}

/** Sumber Excel dengan antarmuka yang sama seperti sumber API. */
export function sumberExcel(lembar: LembarExcel, pemetaan: PemetaanKolom): SumberSimpega {
  return {
    kode: "impor_excel",
    nama: "Berkas Excel Simpega",
    async status() {
      return { aktif: true, pesan: `${lembar.baris.length} baris siap diimpor` };
    },
    async ambil() {
      return petakanBaris(lembar, pemetaan);
    },
  };
}
