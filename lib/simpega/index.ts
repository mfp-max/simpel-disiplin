// Lapisan adapter data pegawai Simpega (PRD §8). Sumber data dapat diganti
// (Excel ↔ API) tanpa mengubah aplikasi: keduanya menghasilkan BarisSumber yang
// diproses oleh prosesBatch() yang sama.
//
// Catatan impor modul:
// - Komponen klien: impor langsung dari "@/lib/simpega/normalisasi" dan "@/lib/simpega/excel"
//   (berkas ini menarik impor.ts yang memakai basis data).

export * from "./jenis";
export * from "./normalisasi";
export { bacaWorkbook, kolomTerpetakan, petakanBaris, sumberExcel, type LembarExcel, type PemetaanKolom } from "./excel";
export { statusApi, sumberApi } from "./api";
export {
  BATAS_BATCH, periksaKolom, periksaBaris, prosesBatch, mulaiRiwayat, tambahHasilRiwayat, selesaikanRiwayat, ringkasanAudit,
  terapkanUlangRezim, tebakDelegasi, tebakJenisUnit,
  type HasilBatch, type KolomMasuk, type OpsiImpor, type BarisDilewati, type RincianRiwayat,
} from "./impor";
