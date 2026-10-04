// Format "definisi peraturan" — satu berkas JSON berisi seluruh isi katalog
// sebuah peraturan. Dipakai bersama oleh: seed awal, wizard "Tambah Peraturan
// Baru" (salin dari peraturan lama), serta ekspor/impor definisi (PRD §18.6).
// Antar-baris dirujuk dengan KODE (bukan id) sehingga berkas bisa ditinjau dan
// disunting manusia, lalu diimpor ke sistem mana pun.

export const FORMAT_DEFINISI = "simpel-regulasi/1";

export type DefRegulasi = {
  kode: string;
  jenis: string;
  nomor?: string | null;
  tahun?: number | null;
  judul: string;
  nama_singkat: string;
  nama_lengkap?: string | null;
  rezim_kode?: string | null;
  utama?: boolean;
  status?: "draf" | "aktif" | "nonaktif";
  berlaku_dari?: string | null;
  berlaku_sampai?: string | null;
  ditetapkan_pada?: string | null;
  menggantikan_kode?: string | null;
  katalog_pasal_lengkap?: boolean;
  catatan?: string | null;
  peringatan?: string | null;
  perlu_verifikasi?: boolean;
};

export type DefTingkat = { kode: string; nama: string; urutan: number; keterangan?: string | null };

export type DefJenis = {
  kode: string;
  tingkat: string;
  nama: string;
  urutan?: number;
  durasi_bulan?: number | null;
  pengganti_sementara?: string | null;
  peringatan?: string | null;
  catatan?: string | null;
  pasal_rujukan?: string | null;
  blokir_kgb?: boolean;
  blokir_kenaikan_pangkat?: boolean;
  aktif?: boolean;
  perlu_verifikasi?: boolean;
};

export type DefPasal = {
  jenis: string;
  pasal: string;
  ayat?: string | null;
  huruf?: string | null;
  angka?: string | null;
  teks: string;
  tingkat?: string | null;
  perlu_verifikasi?: boolean;
  catatan?: string | null;
};

export type DefAmbang = {
  hari_min: number;
  hari_max?: number | null;
  berturut_turut?: boolean;
  tingkat?: string | null;
  jenis?: string | null;
  pasal_rujukan?: string | null;
  akibat_tambahan?: string | null;
  alur_khusus?: string | null;
  perlu_verifikasi?: boolean;
  catatan?: string | null;
};

export type DefTenggat = {
  kode: string;
  nama_tenggat: string;
  kode_tahap: string;
  dihitung_dari: string;
  acuan_tanggal?: "realisasi" | "rencana";
  arah: "sebelum" | "sesudah";
  jumlah: number;
  satuan: "hari_kerja" | "hari_kalender" | "bulan";
  hitung_hari_dasar?: boolean;
  sifat?: "wajib_hukum" | "pengingat_internal";
  pasal_rujukan?: string | null;
  catatan?: string | null;
  perlu_verifikasi?: boolean;
};

export type DefKewenangan = {
  tingkat?: string | null;
  jenis: "pemeriksa" | "pembentuk_tim" | "penjatuh";
  peran_kode: string;
  nama_peran: string;
  lingkup?: string | null;
  syarat_tambahan?: Record<string, unknown>;
  hasil?: Record<string, unknown>;
  prioritas?: number;
  pasal_rujukan?: string | null;
  catatan?: string | null;
  perlu_verifikasi?: boolean;
};

export type DefTahapan = {
  tingkat?: string | null;
  kode_tahap: string;
  nama: string;
  urutan: number;
  opsional?: boolean;
  kondisi?: Record<string, unknown>;
  status_kasus?: string | null;
  pasal_rujukan?: string | null;
  bantuan?: string | null;
  jenis_dokumen?: string[];
  perlu_verifikasi?: boolean;
};

export type DefPemetaan = {
  pasal?: string | null; // kunci pasal (lihat kunciPasal), null = semua pasal kewajiban/larangan
  dampak: string;
  tingkat: string;
  pasal_rujukan_pemetaan?: string | null;
  catatan?: string | null;
  perlu_verifikasi?: boolean;
};

export type DefKaidah = {
  kunci: string;
  nilai: unknown;
  pasal_rujukan?: string | null;
  catatan?: string | null;
  perlu_verifikasi?: boolean;
};

export type DefFixture = { nama: string; masukan: Record<string, unknown>; harapan: Record<string, unknown>; catatan?: string | null };

export type DefinisiRegulasi = {
  format: typeof FORMAT_DEFINISI;
  regulasi: DefRegulasi;
  terkait?: { kode: string; peran: string; keterangan?: string | null }[];
  tingkat?: DefTingkat[];
  jenis_hukuman?: DefJenis[];
  pasal?: DefPasal[];
  ambang?: DefAmbang[];
  tenggat?: DefTenggat[];
  kewenangan?: DefKewenangan[];
  tahapan?: DefTahapan[];
  pemetaan?: DefPemetaan[];
  kaidah?: DefKaidah[];
  fixture?: DefFixture[];
};

/** Kunci baca-manusia sebuah pasal: "Pasal 5 ayat (1) huruf f angka 2". */
export function kunciPasal(p: { pasal: string; ayat?: string | null; huruf?: string | null; angka?: string | null }) {
  let s = `Pasal ${p.pasal}`;
  if (p.ayat) s += ` ayat (${p.ayat})`;
  if (p.huruf) s += ` huruf ${p.huruf}`;
  if (p.angka) s += ` angka ${p.angka}`;
  return s;
}

/** Prioritas bawaan baris kewenangan bila tidak diisi (makin kecil makin didahulukan). */
export const PRIORITAS_BAWAAN = 100;
