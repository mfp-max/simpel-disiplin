// Tipe bersama mode sidang (aman diimpor dari komponen klien).

export type KategoriQa = "pembuka" | "substansi" | "penutup";
export type SumberQa = "baku" | "tambahan" | "bank";

export type ButirQa = {
  id: string;
  urutan: number;
  pertanyaan: string;
  jawaban: string | null;
  kategori: KategoriQa;
  sumber: SumberQa;
  terakhir_disimpan: string | null; // ISO
};

export type SesiKlien = {
  id: string;
  entri_id: string;
  urutan: number;
  status: "direncanakan" | "berjalan" | "selesai";
  tanggal: string | null;
  jam_mulai: string | null;
  jam_selesai: string | null;
  mulai_pada: string | null;
  selesai_pada: string | null;
  tempat: string | null;
  moda: string;
  terperiksa_hadir: boolean | null;
  persetujuan_rekam: boolean;
  persetujuan_ditolak: boolean;
  ada_file_persetujuan: boolean;
  berkas_persetujuan_id: string | null;
  rekaman_ada: boolean;
  rekaman_jumlah_potongan: number;
  /** Potongan yang sudah terunggah tetapi belum digabung ke berkas rekaman. */
  potongan_belum_digabung: number;
  rekaman_durasi_detik: number | null;
  rekaman_hapus_pada: string | null;
  rekaman_diperpanjang: boolean;
  rekaman_alasan_perpanjangan: string | null;
  rekaman_dihapus_pada: string | null;
  catatan: string | null;
  bap_dokumen_id: string | null;
};

export type SetBank = { nama_set: string; jenis_pelanggaran: string | null; butir: { id: string; pertanyaan: string }[] };

export function bisaDisunting(b: Pick<ButirQa, "sumber" | "kategori">) {
  return b.kategori === "substansi" && (b.sumber === "tambahan" || b.sumber === "bank");
}

export const ROMAWI = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
export function romawi(n: number) {
  return ROMAWI[n] ?? String(n);
}

/** Cermin klien dari alasanTerkunci() di lib/rekaman.ts (server tetap memeriksa ulang). */
export function alasanRekamTerkunci(s: Pick<SesiKlien, "persetujuan_rekam" | "persetujuan_ditolak" | "ada_file_persetujuan" | "rekaman_dihapus_pada" | "status">): string | null {
  if (s.persetujuan_ditolak) return "Terperiksa menolak perekaman. Pemeriksaan berjalan tanpa rekaman.";
  if (s.rekaman_dihapus_pada) return "Rekaman sesi ini sudah dihapus sesuai masa retensi.";
  if (!s.persetujuan_rekam && !s.ada_file_persetujuan)
    return "Tombol rekam terkunci: centang persetujuan terperiksa dan unggah surat persetujuan perekaman yang sudah ditandatangani.";
  if (!s.persetujuan_rekam) return "Tombol rekam terkunci: centang bahwa terperiksa telah menyetujui perekaman.";
  if (!s.ada_file_persetujuan) return "Tombol rekam terkunci: unggah dulu surat persetujuan perekaman yang sudah ditandatangani terperiksa.";
  if (s.status === "direncanakan") return "Mulai pemeriksaan terlebih dahulu, lalu rekam.";
  if (s.status === "selesai") return "Sesi sudah selesai.";
  return null;
}

/** "01:02:03" */
export function formatDurasi(detik: number) {
  const d = Math.max(0, Math.floor(detik));
  const j = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60), s = d % 60;
  return [j, m, s].map((x) => String(x).padStart(2, "0")).join(":");
}

/** "14:05:33" (waktu perangkat) */
export function jamMenitDetik(t: Date) {
  return [t.getHours(), t.getMinutes(), t.getSeconds()].map((x) => String(x).padStart(2, "0")).join(":");
}
