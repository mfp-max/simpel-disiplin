// Tipe aturan yang dibaca mesin. Semua isi berasal dari tabel katalog
// (atau dari berkas definisi saat diuji di wizard). Tidak ada nilai hukum di sini.

export type Tingkat = { id?: string; kode: string; nama: string; urutan: number };

export type JenisHukuman = {
  id?: string;
  kode: string;
  nama: string;
  tingkat_kode: string;
  urutan: number;
  durasi_bulan: number | null;
  pengganti_kode: string | null;
  peringatan: string | null;
  catatan: string | null;
  pasal_rujukan: string | null;
  blokir_kgb: boolean;
  blokir_kenaikan_pangkat: boolean;
};

export type Ambang = {
  id?: string;
  hari_min: number;
  hari_max: number | null;
  berturut_turut: boolean;
  tingkat_kode: string | null;
  jenis_kode: string | null;
  pasal_rujukan: string | null;
  akibat_tambahan: string | null;
  alur_khusus: string | null;
  perlu_verifikasi: boolean;
};

export type Tenggat = {
  id?: string;
  kode: string;
  nama_tenggat: string;
  kode_tahap: string;
  dihitung_dari: string;
  acuan_tanggal: "realisasi" | "rencana";
  arah: "sebelum" | "sesudah";
  jumlah: number;
  satuan: "hari_kerja" | "hari_kalender" | "bulan";
  hitung_hari_dasar: boolean;
  sifat: "wajib_hukum" | "pengingat_internal";
  pasal_rujukan: string | null;
  catatan: string | null;
};

export type Kewenangan = {
  id?: string;
  tingkat_kode: string | null;
  jenis: "pemeriksa" | "pembentuk_tim" | "penjatuh";
  peran_kode: string;
  nama_peran: string;
  lingkup: string | null;
  syarat_tambahan: Record<string, unknown>;
  hasil: Record<string, unknown>;
  prioritas: number;
  pasal_rujukan: string | null;
  catatan: string | null;
  perlu_verifikasi: boolean;
};

export type Tahapan = {
  id?: string;
  tingkat_kode: string | null;
  kode_tahap: string;
  nama: string;
  urutan: number;
  opsional: boolean;
  kondisi: Record<string, unknown>;
  status_kasus: string | null;
  pasal_rujukan: string | null;
  bantuan: string | null;
  jenis_dokumen: string[];
};

export type Pemetaan = {
  id?: string;
  pasal_regulasi_id: string | null;
  pasal_kunci: string | null;
  dampak: string;
  tingkat_kode: string;
  pasal_rujukan_pemetaan: string | null;
};

export type RingkasRegulasi = {
  id?: string;
  kode: string;
  nama_singkat: string;
  nama_lengkap: string | null;
  rezim_kode: string | null;
  berlaku_dari: string | null;
  berlaku_sampai: string | null;
};

export type AturanLengkap = {
  regulasi: RingkasRegulasi;
  tingkat: Tingkat[];
  jenis: JenisHukuman[];
  ambang: Ambang[];
  tenggat: Tenggat[];
  kewenangan: Kewenangan[];
  tahapan: Tahapan[];
  pemetaan: Pemetaan[];
  kaidah: Record<string, unknown>;
  kaidahRujukan: Record<string, string | null>;
};
