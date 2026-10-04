import { selisihHariKerja, type Kalender } from "@/lib/hari-kerja";
import { tanggalPendek } from "@/lib/format";
import type { StatusTenggat } from "@/components/simpel/lencana";

/**
 * Warna tenggat (PRD §6.3): hijau > ambang hari kerja, kuning 1–ambang, merah lewat.
 * `ambang` dibaca dari pengaturan (bawaan 3).
 */
export function statusTenggat(tenggat: string | null, hariIni: string, kal: Kalender, ambang: number, selesai = false): StatusTenggat | null {
  if (!tenggat) return null;
  if (selesai) return { warna: "selesai", sisa: null, label: "Selesai" };
  const sisa = selisihHariKerja(hariIni, tenggat, kal);
  if (sisa < 0) return { warna: "lewat", sisa, label: `Lewat ${Math.abs(sisa)} hari kerja` };
  if (sisa === 0) return { warna: "waspada", sisa, label: "Jatuh tempo hari ini" };
  if (sisa <= ambang) return { warna: "waspada", sisa, label: `${sisa} hari kerja lagi` };
  return { warna: "aman", sisa, label: `${sisa} hari kerja · ${tanggalPendek(tenggat)}` };
}
