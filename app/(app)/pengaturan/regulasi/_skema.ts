// Skema antarmuka katalog aturan — dipakai bersama oleh editor (baris basis data)
// dan wizard (baris definisi di memori). Berkas ini murni (tanpa akses data)
// sehingga bisa diimpor komponen klien maupun server. Tidak memuat nilai hukum:
// hanya label, penjelasan, dan bentuk isian.

import { kunciPasal, type DefinisiRegulasi } from "@/lib/regulasi/definisi";
import { labelKode } from "@/lib/format";

export type JenisKolom = "teks" | "teks_panjang" | "angka" | "bool" | "pilihan" | "ref" | "json" | "kondisi" | "daftar" | "tanggal";
export type JenisRef = "tingkat" | "jenis" | "pasal" | "regulasi" | "rezim" | "dampak" | "tahap" | "status_kasus" | "jenis_dokumen" | "kaidah" | "kode_tingkat" | "kode_peran";

export type Kolom = {
  kunci: string; // nama kolom di tabel
  def?: string | null; // nama field di DefinisiRegulasi (bawaan = kunci; null = tidak ada di definisi)
  label: string;
  jenis: JenisKolom;
  ref?: JenisRef;
  pilihan?: { nilai: string; label: string }[];
  kosong?: string; // label untuk pilihan kosong (ref/pilihan)
  saran?: JenisRef; // daftar saran (datalist) untuk isian teks
  wajib?: boolean;
  bantuan?: string;
  hanyaDb?: boolean;
};

export type Opsi = { nilai: string; label: string };

export type KonteksSkema = {
  opsi: Partial<Record<JenisRef, Opsi[]>>;
};

export function labelOpsi(ctx: KonteksSkema, ref: JenisRef, nilai: unknown): string {
  if (nilai === null || nilai === undefined || nilai === "") return "";
  return ctx.opsi[ref]?.find((o) => o.nilai === String(nilai))?.label ?? String(nilai);
}

export type Ringkas = { judul: string; sub?: string; rincian?: [string, string][] };

export type TabelUi =
  | "tingkat_hukuman" | "jenis_hukuman" | "pasal_regulasi" | "ambang_kehadiran" | "aturan_tenggat" | "aturan_kewenangan"
  | "aturan_tahapan" | "aturan_pemetaan_pelanggaran" | "aturan_kaidah" | "regulasi" | "regulasi_terkait";

export type SkemaTabel = {
  tabel: TabelUi;
  def: keyof DefinisiRegulasi | null;
  judul: string;
  penjelasan: string;
  contoh: string;
  kolom: Kolom[];
  kekal: boolean; // dijaga trigger
  versi: boolean; // dapat dibuat versi baru per baris
  punyaAktif: boolean;
  ringkas: (b: Baris, ctx: KonteksSkema) => Ringkas;
  kelompok?: (b: Baris, ctx: KonteksSkema) => string;
};

export type Baris = Record<string, unknown> & { id?: string };

/** Cermin kolom bebas trigger `katalog_kekal`. */
export const KOLOM_BEBAS = new Set(["aktif", "status", "berlaku_sampai", "digantikan_oleh_id", "catatan", "perlu_verifikasi", "peringatan", "pengganti_sementara_id", "urutan"]);

const t = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

const PILIHAN_JENIS_PASAL: Opsi[] = [
  { nilai: "kewajiban", label: "Kewajiban" }, { nilai: "larangan", label: "Larangan" }, { nilai: "hukuman", label: "Ketentuan hukuman" },
  { nilai: "prosedur", label: "Prosedur" }, { nilai: "lainnya", label: "Lainnya" },
];
export const LABEL_JENIS_KEWENANGAN: Record<string, string> = { pemeriksa: "Pemeriksa", pembentuk_tim: "Pembentuk Tim Pemeriksa", penjatuh: "Pejabat yang berwenang menghukum" };
export const LABEL_SATUAN: Record<string, string> = { hari_kerja: "hari kerja", hari_kalender: "hari kalender", bulan: "bulan" };
export const LABEL_SIFAT: Record<string, string> = { wajib_hukum: "wajib hukum", pengingat_internal: "pengingat internal" };
export const LABEL_LINGKUP: Record<string, string> = {
  satu_tingkat_di_bawah: "Pegawai satu tingkat di bawahnya", dua_tingkat_di_bawah: "Pegawai dua tingkat di bawahnya",
  seluruh_unit: "Seluruh pegawai di unitnya", tertentu: "Ketentuan tertentu (lihat catatan)",
};

export const SKEMA: Record<Exclude<TabelUi, "regulasi" | "regulasi_terkait">, SkemaTabel> = {
  tingkat_hukuman: {
    tabel: "tingkat_hukuman", def: "tingkat", judul: "Tingkat hukuman", kekal: true, versi: false, punyaAktif: true,
    penjelasan: "Daftar tingkat hukuman disiplin menurut peraturan ini, diurutkan dari yang paling ringan. Jumlahnya bebas — peraturan dengan 4 tingkat cukup menambah satu baris.",
    contoh: "Contoh: kode \"ringan\", nama \"ringan\", urutan 1; kode \"sedang\", urutan 2; dan seterusnya. Kode dipakai oleh tabel lain, jadi jangan diubah setelah dipakai.",
    kolom: [
      { kunci: "kode", label: "Kode", jenis: "teks", wajib: true, bantuan: "Huruf kecil tanpa spasi, mis. ringan" },
      { kunci: "nama", label: "Nama tingkat", jenis: "teks", wajib: true },
      { kunci: "urutan", label: "Urutan (1 = paling ringan)", jenis: "angka", wajib: true },
      { kunci: "keterangan", label: "Keterangan", jenis: "teks_panjang" },
      { kunci: "catatan", def: null, label: "Catatan internal", jenis: "teks_panjang", hanyaDb: true },
    ],
    ringkas: (b) => ({ judul: `${t(b.urutan)}. ${t(b.nama)}`, sub: `Kode: ${t(b.kode)}${b.keterangan ? ` · ${b.keterangan}` : ""}` }),
  },
  jenis_hukuman: {
    tabel: "jenis_hukuman", def: "jenis_hukuman", judul: "Jenis hukuman", kekal: true, versi: true, punyaAktif: true,
    penjelasan: "Seluruh jenis hukuman disiplin per tingkat, lengkap dengan durasi dan akibatnya pada kenaikan gaji berkala/pangkat. \"Pengganti sementara\" dipakai bila suatu jenis belum dapat dijatuhkan (masa transisi): yang dijatuhkan adalah jenis penggantinya. Kosongkan pengganti sementara untuk mengakhiri masa transisi — tanpa programmer.",
    contoh: "Contoh: \"pemotongan tunjangan kinerja 25% selama 6 bulan\" (tingkat sedang, 6 bulan) dengan pengganti sementara \"penundaan kenaikan gaji berkala 1 tahun\".",
    kolom: [
      { kunci: "tingkat_hukuman_id", def: "tingkat", label: "Tingkat", jenis: "ref", ref: "tingkat", wajib: true },
      { kunci: "kode", label: "Kode", jenis: "teks", wajib: true, bantuan: "Unik dalam peraturan ini, huruf kecil tanpa spasi" },
      { kunci: "nama", label: "Nama jenis hukuman (bunyi peraturan)", jenis: "teks_panjang", wajib: true },
      { kunci: "urutan", label: "Urutan berat (makin besar makin berat)", jenis: "angka" },
      { kunci: "durasi_bulan", label: "Durasi (bulan)", jenis: "angka", bantuan: "Kosongkan bila tidak berdurasi" },
      { kunci: "pengganti_sementara_id", def: "pengganti_sementara", label: "Pengganti sementara (masa transisi)", jenis: "ref", ref: "jenis", kosong: "— Tidak ada (jenis ini langsung dijatuhkan) —" },
      { kunci: "peringatan", label: "Peringatan yang ditampilkan saat jenis ini dipilih", jenis: "teks_panjang" },
      { kunci: "pasal_rujukan", label: "Pasal rujukan", jenis: "teks" },
      { kunci: "blokir_kgb", label: "Menunda kenaikan gaji berkala selama menjalani", jenis: "bool" },
      { kunci: "blokir_kenaikan_pangkat", label: "Menunda kenaikan pangkat selama menjalani", jenis: "bool" },
      { kunci: "catatan", label: "Catatan", jenis: "teks_panjang" },
    ],
    ringkas: (b, ctx) => ({
      judul: t(b.nama),
      sub: [`Kode ${t(b.kode)}`, b.durasi_bulan ? `${b.durasi_bulan} bulan` : null, b.pasal_rujukan as string | null].filter(Boolean).join(" · "),
      rincian: [
        ...(b.pengganti_sementara_id ? ([["Pengganti sementara", labelOpsi(ctx, "jenis", b.pengganti_sementara_id)]] as [string, string][]) : []),
        ...(b.peringatan ? ([["Peringatan", String(b.peringatan)]] as [string, string][]) : []),
        ...(b.blokir_kgb || b.blokir_kenaikan_pangkat ? ([["Selama menjalani", [b.blokir_kgb && "KGB ditunda", b.blokir_kenaikan_pangkat && "kenaikan pangkat ditunda"].filter(Boolean).join(", ")]] as [string, string][]) : []),
      ],
    }),
    kelompok: (b, ctx) => `Tingkat ${labelOpsi(ctx, "tingkat", b.tingkat_hukuman_id) || "—"}`,
  },
  pasal_regulasi: {
    tabel: "pasal_regulasi", def: "pasal", judul: "Pasal kewajiban & larangan", kekal: true, versi: true, punyaAktif: true,
    penjelasan: "Bunyi pasal kewajiban dan larangan yang dapat dipilih saat mencatat pelanggaran. Kasus menyimpan salinan teks pasal, jadi menyunting di sini tidak mengubah kasus lama.",
    contoh: "Contoh: jenis Kewajiban, Pasal 4, huruf f, teks \"masuk Kerja dan menaati ketentuan jam Kerja\".",
    kolom: [
      { kunci: "jenis", label: "Jenis", jenis: "pilihan", pilihan: PILIHAN_JENIS_PASAL, wajib: true },
      { kunci: "pasal", label: "Pasal", jenis: "teks", wajib: true },
      { kunci: "ayat", label: "Ayat", jenis: "teks" },
      { kunci: "huruf", label: "Huruf", jenis: "teks" },
      { kunci: "angka", label: "Angka", jenis: "teks" },
      { kunci: "teks", label: "Bunyi pasal", jenis: "teks_panjang", wajib: true },
      { kunci: "tingkat_hukuman_terkait_id", def: "tingkat", label: "Tingkat hukuman terkait (bila pasal menyebutnya)", jenis: "ref", ref: "tingkat", kosong: "— Tidak ada —" },
      { kunci: "catatan", label: "Catatan", jenis: "teks_panjang" },
    ],
    ringkas: (b) => ({ judul: kunciPasal(b as never), sub: t(b.teks) }),
    kelompok: (b) => labelKode(String(b.jenis ?? "lainnya")),
  },
  ambang_kehadiran: {
    tabel: "ambang_kehadiran", def: "ambang", judul: "Ambang kehadiran", kekal: true, versi: true, punyaAktif: true,
    penjelasan: "Tabel yang mengubah jumlah hari tidak masuk kerja tanpa alasan sah (kumulatif setahun) menjadi usulan tingkat dan jenis hukuman. Kosongkan \"hari tertinggi\" untuk \"dan seterusnya\". Baris \"berturut-turut\" dinilai terpisah dari hitungan kumulatif.",
    contoh: "Contoh: 11 s.d. 13 hari → tingkat sedang, jenis sedang ke-1. Atau: 10 hari berturut-turut ke atas → berat, dengan alur khusus penghentian gaji.",
    kolom: [
      { kunci: "hari_min", label: "Hari terendah", jenis: "angka", wajib: true },
      { kunci: "hari_max", label: "Hari tertinggi (kosong = dan seterusnya)", jenis: "angka" },
      { kunci: "berturut_turut", label: "Dihitung berturut-turut (bukan kumulatif)", jenis: "bool" },
      { kunci: "tingkat_hukuman_id", def: "tingkat", label: "Tingkat", jenis: "ref", ref: "tingkat", kosong: "— Ikut jenis hukuman —" },
      { kunci: "jenis_hukuman_id", def: "jenis", label: "Jenis hukuman", jenis: "ref", ref: "jenis", kosong: "— Tidak ditentukan —" },
      { kunci: "pasal_rujukan", label: "Pasal rujukan", jenis: "teks" },
      { kunci: "akibat_tambahan", label: "Akibat tambahan", jenis: "teks_panjang" },
      { kunci: "alur_khusus", label: "Alur khusus", jenis: "pilihan", pilihan: [{ nilai: "penghentian_gaji", label: "Penghentian pembayaran gaji" }], kosong: "— Tidak ada —" },
      { kunci: "catatan", label: "Catatan", jenis: "teks_panjang" },
    ],
    ringkas: (b, ctx) => ({
      judul: `${rentangHari(b)} hari${b.berturut_turut ? " berturut-turut" : ""} → ${labelOpsi(ctx, "tingkat", b.tingkat_hukuman_id) || "—"}`,
      sub: labelOpsi(ctx, "jenis", b.jenis_hukuman_id) || "Jenis tidak ditentukan",
      rincian: [
        ...(b.akibat_tambahan ? ([["Akibat tambahan", String(b.akibat_tambahan)]] as [string, string][]) : []),
        ...(b.alur_khusus ? ([["Alur khusus", labelKode(String(b.alur_khusus))]] as [string, string][]) : []),
        ...(b.pasal_rujukan ? ([["Rujukan", String(b.pasal_rujukan)]] as [string, string][]) : []),
      ],
    }),
  },
  aturan_tenggat: {
    tabel: "aturan_tenggat", def: "tenggat", judul: "Tenggat", kekal: false, versi: false, punyaAktif: true,
    penjelasan: "Batas waktu setiap tahap, dihitung dari tanggal tahap acuan. \"Sebelum\" berarti paling lambat sekian hari SEBELUM tahap acuan; \"sesudah\" berarti paling lambat sekian hari SESUDAHNYA. Tenggat yang tidak diatur peraturan diberi sifat \"pengingat internal\".",
    contoh: "Contoh: tahap Surat Panggilan I, dihitung dari tahap Pemeriksaan (tanggal rencana), arah sebelum, 7 hari kerja, wajib hukum.",
    kolom: [
      { kunci: "kode", label: "Kode", jenis: "teks", wajib: true },
      { kunci: "nama_tenggat", label: "Nama tenggat", jenis: "teks", wajib: true },
      { kunci: "kode_tahap", label: "Tahap yang dikenai tenggat (kode)", jenis: "teks", saran: "tahap", wajib: true },
      { kunci: "dihitung_dari", label: "Dihitung dari tahap (kode)", jenis: "teks", saran: "tahap", wajib: true },
      { kunci: "acuan_tanggal", label: "Tanggal acuan", jenis: "pilihan", pilihan: [{ nilai: "realisasi", label: "Tanggal terlaksana" }, { nilai: "rencana", label: "Tanggal rencana" }], wajib: true },
      { kunci: "arah", label: "Arah", jenis: "pilihan", pilihan: [{ nilai: "sebelum", label: "Sebelum" }, { nilai: "sesudah", label: "Sesudah" }], wajib: true },
      { kunci: "jumlah", label: "Jumlah", jenis: "angka", wajib: true },
      { kunci: "satuan", label: "Satuan", jenis: "pilihan", pilihan: [{ nilai: "hari_kerja", label: "Hari kerja" }, { nilai: "hari_kalender", label: "Hari kalender" }, { nilai: "bulan", label: "Bulan" }], wajib: true },
      { kunci: "hitung_hari_dasar", label: "Hari acuan dihitung sebagai hari ke-1", jenis: "bool" },
      { kunci: "sifat", label: "Sifat", jenis: "pilihan", pilihan: [{ nilai: "wajib_hukum", label: "Wajib hukum" }, { nilai: "pengingat_internal", label: "Pengingat internal" }], wajib: true },
      { kunci: "pasal_rujukan", label: "Pasal rujukan", jenis: "teks" },
      { kunci: "catatan", label: "Catatan", jenis: "teks_panjang" },
    ],
    ringkas: (b, ctx) => ({ judul: t(b.nama_tenggat), sub: uraikanTenggat(b, (k) => labelOpsi(ctx, "tahap", k)) }),
  },
  aturan_kewenangan: {
    tabel: "aturan_kewenangan", def: "kewenangan", judul: "Kewenangan", kekal: false, versi: false, punyaAktif: true,
    penjelasan: "Siapa yang memeriksa, siapa yang membentuk Tim Pemeriksa, dan siapa yang berwenang menjatuhkan hukuman, per tingkat. Bila ada beberapa baris untuk tingkat dan jenis yang sama, sistem memakai baris berprioritas terkecil yang syaratnya terpenuhi.",
    contoh: "Contoh: tingkat ringan, penjatuh = Rektor, syarat \"terperiksa pimpinan unit: ya\", prioritas 10; baris kedua tanpa syarat, prioritas 20, penjatuh = pimpinan unit kerja.",
    kolom: [
      { kunci: "tingkat_hukuman_id", def: "tingkat", label: "Tingkat", jenis: "ref", ref: "tingkat", kosong: "— Semua tingkat —" },
      { kunci: "jenis", label: "Kewenangan", jenis: "pilihan", pilihan: Object.entries(LABEL_JENIS_KEWENANGAN).map(([nilai, label]) => ({ nilai, label })), wajib: true },
      { kunci: "peran_kode", label: "Kode peran/jabatan", jenis: "teks", wajib: true, bantuan: "Mis. rektor, atasan_langsung, menteri" },
      { kunci: "nama_peran", label: "Nama pejabat (tampil di layar & dokumen)", jenis: "teks", wajib: true },
      { kunci: "lingkup", label: "Lingkup", jenis: "pilihan", pilihan: Object.entries(LABEL_LINGKUP).map(([nilai, label]) => ({ nilai, label })), kosong: "— Tidak ditentukan —" },
      { kunci: "syarat_tambahan", label: "Syarat tambahan", jenis: "kondisi" },
      { kunci: "hasil", label: "Akibat (data tambahan)", jenis: "json", bantuan: "Kunci yang dikenal: bentuk_tim (\"tidak\"/\"boleh\"/\"wajib\"), lapor_sekjen (true), usul_menteri (true), peringatan (teks)" },
      { kunci: "prioritas", label: "Prioritas (kecil didahulukan)", jenis: "angka" },
      { kunci: "pasal_rujukan", label: "Pasal rujukan", jenis: "teks" },
      { kunci: "catatan", label: "Catatan", jenis: "teks_panjang" },
    ],
    ringkas: (b, ctx) => ({
      judul: `${t(b.nama_peran)} — ${labelOpsi(ctx, "tingkat", b.tingkat_hukuman_id) || "semua tingkat"}`,
      sub: [`Syarat: ${uraikanSyarat(b.syarat_tambahan)}`, `prioritas ${t(b.prioritas)}`, b.pasal_rujukan as string | null].filter(Boolean).join(" · "),
      rincian: [
        ...(b.lingkup ? ([["Lingkup", LABEL_LINGKUP[String(b.lingkup)] ?? String(b.lingkup)]] as [string, string][]) : []),
        ...(b.hasil && Object.keys(b.hasil as object).length ? ([["Akibat", JSON.stringify(b.hasil)]] as [string, string][]) : []),
      ],
    }),
    kelompok: (b) => LABEL_JENIS_KEWENANGAN[String(b.jenis)] ?? String(b.jenis),
  },
  aturan_tahapan: {
    tabel: "aturan_tahapan", def: "tahapan", judul: "Tahapan", kekal: false, versi: false, punyaAktif: true,
    penjelasan: "Urutan tahap kasus menurut peraturan ini. Satu kode tahap boleh punya beberapa baris dengan syarat berbeda — sistem memakai baris yang syaratnya paling spesifik. Pakai ulang kode tahap baku (telaah, panggilan_1, pemeriksaan, bap, lhp, penetapan_sk, …) agar dokumen dan tenggat terhubung.",
    contoh: "Contoh: kode pembentukan_tim, \"Pembentukan Tim Pemeriksa oleh Rektor\", urutan 20, syarat \"tingkat: sedang / berat\".",
    kolom: [
      { kunci: "tingkat_hukuman_id", def: "tingkat", label: "Hanya untuk tingkat", jenis: "ref", ref: "tingkat", kosong: "— Semua tingkat —" },
      { kunci: "kode_tahap", label: "Kode tahap", jenis: "teks", saran: "tahap", wajib: true },
      { kunci: "nama", label: "Nama tahap", jenis: "teks", wajib: true },
      { kunci: "urutan", label: "Urutan", jenis: "angka", wajib: true },
      { kunci: "opsional", label: "Opsional (hanya bila diperlukan)", jenis: "bool" },
      { kunci: "kondisi", label: "Syarat tahap ini muncul", jenis: "kondisi" },
      { kunci: "status_kasus", label: "Status kasus selama tahap ini", jenis: "pilihan", ref: "status_kasus", kosong: "— Tidak mengubah status —" },
      { kunci: "pasal_rujukan", label: "Pasal rujukan", jenis: "teks" },
      { kunci: "bantuan", label: "Penjelasan untuk pengguna", jenis: "teks_panjang" },
      { kunci: "jenis_dokumen", label: "Jenis dokumen pada tahap ini (pisahkan dengan koma)", jenis: "daftar", saran: "jenis_dokumen" },
    ],
    ringkas: (b, ctx) => ({
      judul: `${t(b.urutan)}. ${t(b.nama)}${b.opsional ? " (opsional)" : ""}`,
      sub: [`Kode ${t(b.kode_tahap)}`, `Tingkat: ${labelOpsi(ctx, "tingkat", b.tingkat_hukuman_id) || "semua"}`, `Syarat: ${uraikanSyarat(b.kondisi)}`].join(" · "),
      rincian: [
        ...(b.pasal_rujukan ? ([["Rujukan", String(b.pasal_rujukan)]] as [string, string][]) : []),
        ...(Array.isArray(b.jenis_dokumen) && b.jenis_dokumen.length ? ([["Dokumen", (b.jenis_dokumen as string[]).map((d) => labelOpsi(ctx, "jenis_dokumen", d)).join(", ")]] as [string, string][]) : []),
      ],
    }),
  },
  aturan_pemetaan_pelanggaran: {
    tabel: "aturan_pemetaan_pelanggaran", def: "pemetaan", judul: "Pemetaan pelanggaran", kekal: false, versi: false, punyaAktif: true,
    penjelasan: "Memetakan pelanggaran pasal tertentu dengan dampaknya menjadi usulan tingkat hukuman. Baris tanpa pasal berlaku untuk semua pasal kewajiban/larangan; baris dengan pasal tertentu didahulukan.",
    contoh: "Contoh: semua pasal, dampak pada instansi → tingkat sedang.",
    kolom: [
      { kunci: "pasal_regulasi_id", def: "pasal", label: "Pasal", jenis: "ref", ref: "pasal", kosong: "— Semua pasal kewajiban/larangan —" },
      { kunci: "dampak", label: "Dampak", jenis: "pilihan", ref: "dampak", wajib: true },
      { kunci: "tingkat_hukuman_id", def: "tingkat", label: "Tingkat hukuman", jenis: "ref", ref: "tingkat", wajib: true },
      { kunci: "pasal_rujukan_pemetaan", label: "Pasal rujukan pemetaan", jenis: "teks" },
      { kunci: "catatan", label: "Catatan", jenis: "teks_panjang" },
    ],
    ringkas: (b, ctx) => ({
      judul: `${labelOpsi(ctx, "pasal", b.pasal_regulasi_id) || "Semua pasal"} · dampak ${labelOpsi(ctx, "dampak", b.dampak)} → ${labelOpsi(ctx, "tingkat", b.tingkat_hukuman_id)}`,
      sub: [b.pasal_rujukan_pemetaan, b.catatan].filter(Boolean).join(" · "),
    }),
  },
  aturan_kaidah: {
    tabel: "aturan_kaidah", def: "kaidah", judul: "Kaidah", kekal: false, versi: false, punyaAktif: false,
    penjelasan: "Kaidah umum yang berbeda antar generasi peraturan, disimpan sebagai pasangan kunci–nilai. Nilai ditulis dalam JSON: true/false, angka, \"teks\", [\"daftar\"], atau {\"objek\": …}. Daftar kunci yang dikenal sistem ada di bawah.",
    contoh: "Contoh: kunci tim_wajib_untuk, nilai [\"berat\"]; kunci pemotongan_insentif_otomatis, nilai {\"tingkat\": [\"sedang\", \"berat\"]}.",
    kolom: [
      { kunci: "kunci", label: "Kunci", jenis: "teks", saran: "kaidah", wajib: true },
      { kunci: "nilai", label: "Nilai (JSON)", jenis: "json" },
      { kunci: "pasal_rujukan", label: "Pasal rujukan", jenis: "teks" },
      { kunci: "catatan", label: "Catatan", jenis: "teks_panjang" },
    ],
    ringkas: (b) => ({ judul: t(b.kunci), sub: KAIDAH_DIKENAL[String(b.kunci)] ?? "Kaidah tambahan", rincian: [["Nilai", JSON.stringify(b.nilai ?? null)], ...(b.pasal_rujukan ? ([["Rujukan", String(b.pasal_rujukan)]] as [string, string][]) : [])] }),
  },
};

export const SKEMA_REGULASI: Kolom[] = [
  { kunci: "kode", label: "Kode", jenis: "teks", wajib: true, bantuan: "Unik, tanpa spasi. Mis. PP_94_2021" },
  { kunci: "jenis", label: "Jenis peraturan", jenis: "teks", wajib: true, bantuan: "Mis. Peraturan Pemerintah, Peraturan Rektor" },
  { kunci: "nomor", label: "Nomor", jenis: "teks" },
  { kunci: "tahun", label: "Tahun", jenis: "angka" },
  { kunci: "judul", label: "Judul (tentang …)", jenis: "teks_panjang", wajib: true },
  { kunci: "nama_singkat", label: "Nama singkat", jenis: "teks", wajib: true, bantuan: "Mis. PP 94/2021" },
  { kunci: "nama_lengkap", label: "Nama lengkap (dipakai di dokumen)", jenis: "teks_panjang" },
  { kunci: "rezim_kode", label: "Rezim pegawai", jenis: "pilihan", ref: "rezim", kosong: "— Tanpa rezim (peraturan pelengkap) —" },
  { kunci: "utama", label: "Peraturan utama: dapat menjadi dasar kasus (dipilih otomatis menurut tanggal peristiwa)", jenis: "bool" },
  { kunci: "status", label: "Status", jenis: "pilihan", pilihan: [{ nilai: "draf", label: "Draf" }, { nilai: "aktif", label: "Aktif" }, { nilai: "nonaktif", label: "Nonaktif (arsip)" }], wajib: true },
  { kunci: "berlaku_dari", label: "Berlaku dari", jenis: "tanggal" },
  { kunci: "berlaku_sampai", label: "Berlaku sampai (kosong = masih berlaku)", jenis: "tanggal" },
  { kunci: "ditetapkan_pada", label: "Ditetapkan pada", jenis: "tanggal" },
  { kunci: "menggantikan_id", label: "Menggantikan peraturan", jenis: "ref", ref: "regulasi", kosong: "— Tidak menggantikan —" },
  { kunci: "katalog_pasal_lengkap", label: "Katalog pasal lengkap (tidak dicentang: pasal diisi teks bebas, untuk arsip lama)", jenis: "bool" },
  { kunci: "peringatan", label: "Peringatan saat peraturan ini dipakai", jenis: "teks_panjang" },
  { kunci: "catatan", label: "Catatan", jenis: "teks_panjang" },
];

/** Kunci kaidah yang dibaca aplikasi beserta artinya (penjelasan, bukan nilai hukum). */
export const KAIDAH_DIKENAL: Record<string, string> = {
  pemotongan_insentif_otomatis: "Hukuman otomatis disertai pemotongan insentif kinerja. Nilai: true (semua tingkat), false, atau {\"tingkat\": [kode tingkat]}.",
  tim_wajib_untuk: "Daftar kode tingkat yang wajib diperiksa Tim Pemeriksa. Nilai: [\"berat\"].",
  syarat_jabatan_anggota_tim: "Syarat jabatan anggota Tim Pemeriksa. Nilai: {\"pembanding\": \"golongan_ruang\", \"tidak_boleh_lebih_rendah\": true}.",
  komposisi_tim: "Unsur dan jabatan wajib dalam Tim Pemeriksa. Nilai: {\"unsur_wajib\": […], \"jabatan_wajib\": […]}.",
  larangan_pindah_unit_saat_status: "Status kasus yang membuat pegawai tidak boleh disetujui pindah unit. Nilai: daftar kode status.",
  konsideran_mengingat: "Daftar konsideran \"Mengingat\" untuk dokumen keputusan. Nilai: daftar teks.",
  hd_ringan_boleh_keberatan: "Apakah hukuman ringan dapat diajukan keberatan. Nilai: true/false atau teks keterangan.",
  pemberat_pengulangan_berlaku_untuk_kehadiran: "Apakah pemberat karena pengulangan berlaku untuk pelanggaran kehadiran. Nilai: true/false.",
  pemberat_pengulangan: "Pengulangan pelanggaran sejenis memperberat hukuman. Nilai: {\"berlaku\": true}.",
  satu_pelanggaran_satu_hukuman: "Beberapa pelanggaran dalam satu pemeriksaan hanya menghasilkan satu hukuman terberat. Nilai: true/false.",
  larangan_hukum_dua_kali_satu_pelanggaran: "Satu pelanggaran tidak boleh dihukum dua kali. Nilai: true/false.",
  pemeriksa_ringan: "Pemeriksa kasus ringan. Nilai: kode peran, mis. \"atasan_langsung\".",
  hari_berlaku_sk: "Informasi hari mulai berlaku keputusan. Nilai: {\"jumlah\": n, \"satuan\": \"hari_kerja\"}. Perhitungan memakai tenggat berkode berlaku.",
  keberatan_ditujukan_kepada: "Pejabat tujuan keberatan. Nilai: kode peran.",
  banding_ditujukan_kepada: "Pejabat tujuan banding administratif. Nilai: kode peran.",
  atasan_terlibat: "Penanganan bila atasan langsung diduga terlibat. Nilai: teks kode.",
  dugaan_pidana: "Penanganan bila ada dugaan pidana. Nilai: teks kode.",
};

export const HASIL_KEWENANGAN_DIKENAL: Record<string, string> = {
  bentuk_tim: "\"tidak\" / \"boleh\" / \"wajib\" membentuk Tim Pemeriksa (pada baris pemeriksa)",
  lapor_sekjen: "true: salinan SK Tim Pemeriksa wajib dilaporkan ke Sekjen",
  usul_menteri: "true: penjatuhan melalui usul kepada Menteri",
  peringatan: "Teks peringatan yang ditampilkan kepada pengguna",
};

/** Jenis uji regresi yang dikenal mesin aturan (jalankanFixture) + templat isian. */
export const JENIS_UJI: { kode: string; label: string; masukan: Record<string, unknown>; harapan: Record<string, unknown>; penjelasan: string }[] = [
  { kode: "kehadiran", label: "Ambang kehadiran", masukan: { jenis: "kehadiran", hari: 0 }, harapan: { tingkat: "", jenis_kode: "" }, penjelasan: "Masukan: hari (dan berturut_turut: true bila berturut-turut). Harapan: tingkat, jenis_kode, alur_khusus, atau tidak_ada_ambang: true." },
  { kode: "tahapan", label: "Tahapan kasus", masukan: { jenis: "tahapan", tingkat: "", konteks: {} }, harapan: { berisi: [], tidak_berisi: [] }, penjelasan: "Masukan: tingkat (+ konteks). Harapan: berisi/tidak_berisi = daftar kode tahap." },
  { kode: "tenggat", label: "Tanggal tenggat", masukan: { jenis: "tenggat", kode: "", tanggal: "" }, harapan: { tanggal: "" }, penjelasan: "Masukan: kode tahap dan tanggal dasar. Harapan: tanggal hasil (YYYY-MM-DD)." },
  { kode: "kewenangan", label: "Kewenangan", masukan: { jenis: "kewenangan", tingkat: "", konteks: {} }, harapan: { penjatuh: "" }, penjelasan: "Masukan: tingkat (+ konteks). Harapan: penjatuh dan/atau pembentuk_tim (kode peran)." },
  { kode: "pemotongan_ik", label: "Pemotongan insentif kinerja", masukan: { jenis: "pemotongan_ik", tingkat: "" }, harapan: { pemotongan_ik: true }, penjelasan: "Masukan: tingkat. Harapan: pemotongan_ik true/false." },
  { kode: "jumlah_jenis", label: "Jumlah jenis hukuman", masukan: { jenis: "jumlah_jenis" }, harapan: { jumlah: 0 }, penjelasan: "Harapan: jumlah jenis hukuman (tidak termasuk pengganti sementara)." },
  { kode: "jumlah_tingkat", label: "Jumlah tingkat", masukan: { jenis: "jumlah_tingkat" }, harapan: { jumlah: 0 }, penjelasan: "Harapan: jumlah tingkat hukuman." },
];

// ---------------------------------------------------------------------------
// Uraian terbaca manusia
// ---------------------------------------------------------------------------
export function rentangHari(b: Record<string, unknown>) {
  const min = b.hari_min as number | null;
  const max = b.hari_max as number | null;
  if (max === null || max === undefined) return `${min} ke atas`;
  if (max === min) return `${min}`;
  return `${min} s.d. ${max}`;
}

export function uraikanSyarat(k: unknown): string {
  if (!k || typeof k !== "object" || !Object.keys(k).length) return "selalu";
  return Object.entries(k as Record<string, unknown>)
    .map(([kunci, v]) => {
      const nama = labelKode(kunci.endsWith("_in") ? kunci.slice(0, -3) : kunci);
      if (Array.isArray(v)) return `${nama}: ${v.join(" / ")}`;
      if (typeof v === "boolean") return `${nama}: ${v ? "ya" : "tidak"}`;
      return `${nama}: ${String(v)}`;
    })
    .join("; ");
}

/** "7 hari kerja sebelum Pemeriksaan (tanggal rencana) — wajib hukum — PP 94/2021 Pasal 26 ayat (2)" */
export function uraikanTenggat(b: Record<string, unknown>, namaTahap: (kode: string) => string = (k) => labelKode(k)) {
  const acuan = namaTahap(String(b.dihitung_dari)) || labelKode(String(b.dihitung_dari));
  const bagian = [
    `${b.jumlah} ${LABEL_SATUAN[String(b.satuan)] ?? b.satuan} ${b.arah} ${acuan}${b.acuan_tanggal === "rencana" ? " (tanggal rencana)" : ""}${b.hitung_hari_dasar ? ", hari acuan dihitung hari ke-1" : ""}`,
    LABEL_SIFAT[String(b.sifat ?? "wajib_hukum")] ?? String(b.sifat),
  ];
  if (b.pasal_rujukan) bagian.push(String(b.pasal_rujukan));
  return bagian.join(" — ");
}

// ---------------------------------------------------------------------------
// Konversi baris definisi <-> baris berbentuk tabel (untuk editor generik)
// ---------------------------------------------------------------------------
export function defKeBaris(s: { kolom: Kolom[] }, d: Record<string, unknown>): Baris {
  const b: Baris = {};
  for (const k of s.kolom) {
    if (k.def === null) continue;
    b[k.kunci] = d[k.def ?? k.kunci] ?? null;
  }
  b.perlu_verifikasi = d.perlu_verifikasi ?? false;
  if ("aktif" in d) b.aktif = d.aktif;
  return b;
}

export function barisKeDef(s: { kolom: Kolom[] }, b: Baris, lama: Record<string, unknown> = {}): Record<string, unknown> {
  const d: Record<string, unknown> = { ...lama };
  for (const k of s.kolom) {
    if (k.def === null || k.hanyaDb) continue;
    const v = b[k.kunci];
    d[k.def ?? k.kunci] = v === "" ? null : v;
  }
  if ("perlu_verifikasi" in b) d.perlu_verifikasi = !!b.perlu_verifikasi;
  if ("aktif" in b) d.aktif = b.aktif;
  return d;
}

// ---------------------------------------------------------------------------
// Saran kode & nama dari identitas
// ---------------------------------------------------------------------------
const SINGKATAN: [RegExp, string, string][] = [
  [/^peraturan pemerintah/i, "PP", "PP"],
  [/^undang/i, "UU", "UU"],
  [/^peraturan presiden/i, "PERPRES", "Perpres"],
  [/^peraturan (badan kepegawaian negara|bkn)/i, "PERBKN", "PerBKN"],
  [/^peraturan kepala (badan kepegawaian negara|bkn)/i, "PERKA_BKN", "Perka BKN"],
  [/^peraturan menteri/i, "PERMEN", "Permen"],
  [/^keputusan menteri/i, "KEPMEN", "Kepmen"],
  [/^peraturan rektor/i, "PERTOR", "Pertor"],
  [/^keputusan rektor/i, "KEPTOR", "Keptor"],
  [/^surat edaran/i, "SE", "SE"],
];

export function singkatanJenis(jenis: string) {
  const s = (jenis ?? "").trim();
  for (const [re, kode, tampil] of SINGKATAN) if (re.test(s)) return { kode, tampil };
  const huruf = s.split(/\s+/).filter(Boolean).map((w) => w[0]?.toUpperCase()).join("");
  return { kode: huruf || "REG", tampil: huruf || "Reg" };
}

export function saranIdentitas(r: { jenis?: string | null; nomor?: string | null; tahun?: number | string | null; judul?: string | null }) {
  const s = singkatanJenis(r.jenis ?? "");
  const nomor = String(r.nomor ?? "").trim();
  const tahun = String(r.tahun ?? "").trim();
  const nomorKode = nomor.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase();
  return {
    kode: [s.kode, nomorKode, tahun].filter(Boolean).join("_"),
    nama_singkat: nomor || tahun ? `${s.tampil} ${nomor}${tahun ? `/${tahun}` : ""}`.trim() : "",
    nama_lengkap: r.jenis && nomor && tahun ? `${r.jenis} Nomor ${nomor} Tahun ${tahun}${r.judul ? ` tentang ${r.judul}` : ""}` : "",
  };
}

// ---------------------------------------------------------------------------
// Pemeriksaan kelengkapan definisi (dipakai wizard, impor, dan editor)
// ---------------------------------------------------------------------------
export function periksaDefinisi(def: DefinisiRegulasi): { galat: string[]; peringatan: string[] } {
  const galat: string[] = [];
  const peringatan: string[] = [];
  const r = def.regulasi ?? ({} as DefinisiRegulasi["regulasi"]);
  if (!r.kode?.trim()) galat.push("Kode peraturan belum diisi.");
  else if (/\s/.test(r.kode)) galat.push("Kode peraturan tidak boleh mengandung spasi.");
  if (!r.jenis?.trim()) galat.push("Jenis peraturan belum diisi.");
  if (!r.judul?.trim()) galat.push("Judul peraturan belum diisi.");
  if (!r.nama_singkat?.trim()) galat.push("Nama singkat belum diisi.");
  if (r.berlaku_dari && r.berlaku_sampai && r.berlaku_sampai <= r.berlaku_dari) galat.push("Tanggal berlaku sampai harus sesudah berlaku dari.");

  const tingkat = def.tingkat ?? [];
  const jenis = def.jenis_hukuman ?? [];
  const pasal = def.pasal ?? [];
  const kodeTingkat = new Set(tingkat.map((x) => x.kode));
  const kodeJenis = new Set(jenis.map((x) => x.kode));
  const kunciPasalSet = new Set(pasal.map((p) => kunciPasal(p)));

  const dobel = (xs: string[], nama: string) => {
    const lihat = new Set<string>();
    for (const x of xs) {
      if (lihat.has(x)) galat.push(`${nama} "${x}" tercatat lebih dari sekali.`);
      lihat.add(x);
    }
  };
  dobel(tingkat.map((x) => x.kode), "Kode tingkat");
  dobel(jenis.map((x) => x.kode), "Kode jenis hukuman");
  dobel((def.tenggat ?? []).map((x) => x.kode), "Kode tenggat");
  dobel((def.kaidah ?? []).map((x) => x.kunci), "Kunci kaidah");

  const cekT = (k: string | null | undefined, di: string) => { if (k && !kodeTingkat.has(k)) galat.push(`${di} merujuk tingkat "${k}" yang tidak ada.`); };
  const cekJ = (k: string | null | undefined, di: string) => { if (k && !kodeJenis.has(k)) galat.push(`${di} merujuk jenis hukuman "${k}" yang tidak ada.`); };

  tingkat.forEach((x) => { if (!x.kode || !x.nama || x.urutan === null || x.urutan === undefined) galat.push("Ada tingkat yang kode, nama, atau urutannya kosong."); });
  jenis.forEach((x) => {
    if (!x.kode || !x.nama) galat.push("Ada jenis hukuman yang kode atau namanya kosong.");
    if (!x.tingkat) galat.push(`Jenis hukuman "${x.nama}" belum diberi tingkat.`);
    cekT(x.tingkat, `Jenis hukuman "${x.nama}"`);
    cekJ(x.pengganti_sementara, `Pengganti sementara "${x.nama}"`);
    if (x.pengganti_sementara && x.pengganti_sementara === x.kode) galat.push(`Jenis "${x.nama}" tidak boleh menjadi pengganti dirinya sendiri.`);
  });
  pasal.forEach((p) => {
    if (!p.pasal || !p.teks) galat.push("Ada pasal yang nomor atau bunyinya kosong.");
    cekT(p.tingkat, kunciPasal(p));
  });
  dobel(pasal.map((p) => kunciPasal(p)), "Pasal");
  (def.ambang ?? []).forEach((a) => {
    const di = `Ambang ${rentangHari(a as never)} hari`;
    if (a.hari_min === null || a.hari_min === undefined || Number.isNaN(a.hari_min)) galat.push("Ada ambang tanpa jumlah hari terendah.");
    if (a.hari_max !== null && a.hari_max !== undefined && a.hari_max < a.hari_min) galat.push(`${di}: hari tertinggi lebih kecil dari terendah.`);
    cekT(a.tingkat, di);
    cekJ(a.jenis, di);
  });
  const kumulatif = (def.ambang ?? []).filter((a) => !a.berturut_turut).sort((p, q) => p.hari_min - q.hari_min);
  for (let i = 1; i < kumulatif.length; i += 1) {
    const sebelum = kumulatif[i - 1];
    if (sebelum.hari_max === null || sebelum.hari_max === undefined || sebelum.hari_max >= kumulatif[i].hari_min) {
      peringatan.push(`Rentang ambang ${rentangHari(sebelum as never)} dan ${rentangHari(kumulatif[i] as never)} hari saling tumpang tindih.`);
    }
  }
  const kodeTahap = new Set((def.tahapan ?? []).map((x) => x.kode_tahap));
  (def.tenggat ?? []).forEach((x) => {
    if (!x.kode || !x.kode_tahap || !x.dihitung_dari || !x.jumlah && x.jumlah !== 0) galat.push(`Tenggat "${x.nama_tenggat || x.kode}" belum lengkap.`);
    if (kodeTahap.size && x.kode_tahap && !kodeTahap.has(x.kode_tahap) && x.sifat !== "pengingat_internal") peringatan.push(`Tenggat "${x.nama_tenggat}" untuk tahap "${x.kode_tahap}" yang tidak ada di daftar tahapan.`);
    if (kodeTahap.size && x.dihitung_dari && !kodeTahap.has(x.dihitung_dari)) peringatan.push(`Tenggat "${x.nama_tenggat}" dihitung dari tahap "${x.dihitung_dari}" yang tidak ada di daftar tahapan.`);
  });
  (def.kewenangan ?? []).forEach((k) => cekT(k.tingkat, `Kewenangan "${k.nama_peran}"`));
  (def.tahapan ?? []).forEach((x) => {
    cekT(x.tingkat, `Tahap "${x.nama}"`);
    if (x.urutan === null || x.urutan === undefined) galat.push(`Tahap "${x.nama}" belum diberi urutan.`);
  });
  (def.pemetaan ?? []).forEach((p) => {
    cekT(p.tingkat, `Pemetaan dampak ${p.dampak}`);
    if (!p.tingkat) galat.push(`Pemetaan dampak ${p.dampak} belum diberi tingkat.`);
    if (p.pasal && !kunciPasalSet.has(p.pasal)) peringatan.push(`Pemetaan merujuk "${p.pasal}" yang tidak ada di daftar pasal; baris ini akan dilewati.`);
  });

  if (!tingkat.length) peringatan.push("Belum ada tingkat hukuman.");
  if (!jenis.length) peringatan.push("Belum ada jenis hukuman.");
  if (r.utama !== false) {
    if (!(def.tahapan ?? []).length) peringatan.push("Belum ada tahapan; kasus baru tidak akan memiliki daftar tahap.");
    for (const tk of tingkat) {
      const ada = (def.kewenangan ?? []).some((k) => k.jenis === "penjatuh" && (!k.tingkat || k.tingkat === tk.kode));
      if (!ada) peringatan.push(`Belum ada pejabat yang berwenang menghukum untuk tingkat "${tk.nama}".`);
    }
  }
  for (const k of def.kaidah ?? []) {
    const daftar = k.kunci === "tim_wajib_untuk" ? k.nilai : k.kunci === "pemotongan_insentif_otomatis" ? (k.nilai as { tingkat?: unknown } | null)?.tingkat : null;
    if (Array.isArray(daftar)) for (const x of daftar) if (!kodeTingkat.has(String(x))) peringatan.push(`Kaidah ${k.kunci} menyebut tingkat "${String(x)}" yang tidak ada.`);
  }
  if ((def.fixture ?? []).length < 3) peringatan.push("Disarankan sekurangnya 3 uji regresi (kasus contoh beserta hasil yang benar) untuk peraturan ini.");
  return { galat: [...new Set(galat)], peringatan: [...new Set(peringatan)] };
}

export function jumlahIsi(def: DefinisiRegulasi) {
  return [
    ["Tingkat", def.tingkat?.length ?? 0], ["Jenis hukuman", def.jenis_hukuman?.length ?? 0], ["Pasal", def.pasal?.length ?? 0],
    ["Ambang", def.ambang?.length ?? 0], ["Tenggat", def.tenggat?.length ?? 0], ["Kewenangan", def.kewenangan?.length ?? 0],
    ["Tahapan", def.tahapan?.length ?? 0], ["Pemetaan", def.pemetaan?.length ?? 0], ["Kaidah", def.kaidah?.length ?? 0], ["Uji regresi", def.fixture?.length ?? 0],
  ] as [string, number][];
}

