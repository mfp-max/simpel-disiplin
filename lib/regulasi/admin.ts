import "server-only";
// Penyuntingan katalog aturan dari layar admin (PRD §18.4, §18.6, §18.9).
//
// Semua fungsi di sini dijalankan DI DALAM transaksi (`transaksi(async (tx) => …)`)
// dan selalu mencatat audit_log dengan nilai sebelum/sesudah serta alasan tertulis.
// Kaidah kekal ditegakkan oleh trigger basis data `katalog_kekal`; fungsi ini
// memeriksanya lebih dulu supaya pengguna mendapat pesan yang jelas, lalu
// menawarkan dua jalan: "versi baru" atau "koreksi salah ketik".

import { izinkanKoreksi, type Sql } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna } from "@/lib/galat";
import { FORMAT_DEFINISI, type DefinisiRegulasi } from "./definisi";
import { eksporDefinisi, simpanDefinisi, simpanTerkait } from "./simpan";

export type Pelaku = { id: string; email: string };

type TipeKolom = "teks" | "angka" | "bool" | "tanggal" | "json" | "uuid" | "daftar_teks";

/** Kolom yang boleh disunting per tabel (daftar putih) beserta tipenya. */
const KOLOM = {
  regulasi: {
    kode: "teks", jenis: "teks", nomor: "teks", tahun: "angka", judul: "teks", nama_singkat: "teks", nama_lengkap: "teks",
    rezim_kode: "teks", utama: "bool", status: "teks", berlaku_dari: "tanggal", berlaku_sampai: "tanggal", ditetapkan_pada: "tanggal",
    menggantikan_id: "uuid", katalog_pasal_lengkap: "bool", catatan: "teks", peringatan: "teks", perlu_verifikasi: "bool",
  },
  tingkat_hukuman: { kode: "teks", nama: "teks", urutan: "angka", aktif: "bool", keterangan: "teks", catatan: "teks", perlu_verifikasi: "bool" },
  jenis_hukuman: {
    tingkat_hukuman_id: "uuid", kode: "teks", nama: "teks", urutan: "angka", durasi_bulan: "angka", aktif: "bool",
    pengganti_sementara_id: "uuid", peringatan: "teks", catatan: "teks", pasal_rujukan: "teks", blokir_kgb: "bool",
    blokir_kenaikan_pangkat: "bool", perlu_verifikasi: "bool",
  },
  pasal_regulasi: {
    jenis: "teks", pasal: "teks", ayat: "teks", huruf: "teks", angka: "teks", teks: "teks", tingkat_hukuman_terkait_id: "uuid",
    urutan: "angka", perlu_verifikasi: "bool", aktif: "bool", catatan: "teks",
  },
  ambang_kehadiran: {
    hari_min: "angka", hari_max: "angka", berturut_turut: "bool", tingkat_hukuman_id: "uuid", jenis_hukuman_id: "uuid",
    pasal_rujukan: "teks", akibat_tambahan: "teks", alur_khusus: "teks", urutan: "angka", aktif: "bool", catatan: "teks", perlu_verifikasi: "bool",
  },
  aturan_tenggat: {
    kode: "teks", nama_tenggat: "teks", kode_tahap: "teks", dihitung_dari: "teks", acuan_tanggal: "teks", arah: "teks", jumlah: "angka",
    satuan: "teks", hitung_hari_dasar: "bool", sifat: "teks", pasal_rujukan: "teks", catatan: "teks", aktif: "bool", perlu_verifikasi: "bool",
  },
  aturan_kewenangan: {
    tingkat_hukuman_id: "uuid", jenis: "teks", peran_kode: "teks", nama_peran: "teks", lingkup: "teks", syarat_tambahan: "json",
    hasil: "json", prioritas: "angka", pasal_rujukan: "teks", catatan: "teks", aktif: "bool", perlu_verifikasi: "bool",
  },
  aturan_tahapan: {
    tingkat_hukuman_id: "uuid", kode_tahap: "teks", nama: "teks", urutan: "angka", opsional: "bool", kondisi: "json", status_kasus: "teks",
    pasal_rujukan: "teks", bantuan: "teks", jenis_dokumen: "daftar_teks", aktif: "bool", perlu_verifikasi: "bool",
  },
  aturan_pemetaan_pelanggaran: {
    pasal_regulasi_id: "uuid", dampak: "teks", tingkat_hukuman_id: "uuid", pasal_rujukan_pemetaan: "teks", catatan: "teks", aktif: "bool",
    perlu_verifikasi: "bool",
  },
  aturan_kaidah: { kunci: "teks", nilai: "json", pasal_rujukan: "teks", catatan: "teks", perlu_verifikasi: "bool" },
  regulasi_terkait: { terkait_id: "uuid", peran: "teks", urutan: "angka", keterangan: "teks" },
  fixture_regresi: { nama: "teks", masukan: "json", harapan: "json", catatan: "teks" },
} as const satisfies Record<string, Record<string, TipeKolom>>;

export type TabelKatalog = keyof typeof KOLOM;
export const TABEL_KATALOG = Object.keys(KOLOM) as TabelKatalog[];

/** Kolom yang selalu boleh diubah walau katalog sudah dipakai (cermin trigger `katalog_kekal`). */
export const KOLOM_BEBAS = new Set([
  "aktif", "status", "berlaku_sampai", "digantikan_oleh_id", "catatan", "perlu_verifikasi", "peringatan", "pengganti_sementara_id", "urutan",
]);

/** Tabel yang dijaga trigger kekal. */
export const TABEL_KEKAL = new Set<TabelKatalog>(["regulasi", "tingkat_hukuman", "jenis_hukuman", "pasal_regulasi", "ambang_kehadiran"]);

/** Tabel yang perubahan substantifnya dapat dibuat sebagai baris versi baru. */
export const TABEL_BERVERSI = new Set<TabelKatalog>(["jenis_hukuman", "pasal_regulasi", "ambang_kehadiran"]);

/** Tabel yang barisnya boleh dihapus (bukan katalog kekal; isi lama tetap tersimpan di audit_log). */
const TABEL_BOLEH_HAPUS = new Set<TabelKatalog>(["aturan_kaidah", "regulasi_terkait", "fixture_regresi"]);

const TANPA_PEMBUAT = new Set<TabelKatalog>(["regulasi_terkait"]);

/** Kolom yang wajib terisi (pesan ramah sebelum basis data menolak). */
const WAJIB: Partial<Record<TabelKatalog, Record<string, string>>> = {
  tingkat_hukuman: { kode: "kode tingkat", nama: "nama tingkat", urutan: "urutan" },
  jenis_hukuman: { tingkat_hukuman_id: "tingkat hukuman", kode: "kode jenis", nama: "nama jenis hukuman" },
  pasal_regulasi: { jenis: "jenis pasal", pasal: "nomor pasal", teks: "bunyi pasal" },
  ambang_kehadiran: { hari_min: "jumlah hari terendah" },
  aturan_tenggat: { kode: "kode tenggat", nama_tenggat: "nama tenggat", kode_tahap: "tahap", dihitung_dari: "dihitung dari", arah: "arah", jumlah: "jumlah", satuan: "satuan" },
  aturan_kewenangan: { jenis: "jenis kewenangan", peran_kode: "kode peran", nama_peran: "nama pejabat" },
  aturan_tahapan: { kode_tahap: "kode tahap", nama: "nama tahap", urutan: "urutan" },
  aturan_pemetaan_pelanggaran: { dampak: "dampak", tingkat_hukuman_id: "tingkat hukuman" },
  aturan_kaidah: { kunci: "kunci kaidah" },
  regulasi_terkait: { terkait_id: "peraturan terkait", peran: "peran" },
  fixture_regresi: { nama: "nama uji", masukan: "masukan", harapan: "harapan" },
  regulasi: { kode: "kode", jenis: "jenis peraturan", judul: "judul", nama_singkat: "nama singkat" },
};

const PILIHAN: Record<string, readonly string[]> = {
  "regulasi.status": ["draf", "aktif", "nonaktif"],
  "aturan_tenggat.arah": ["sebelum", "sesudah"],
  "aturan_tenggat.satuan": ["hari_kerja", "hari_kalender", "bulan"],
  "aturan_tenggat.sifat": ["wajib_hukum", "pengingat_internal"],
  "aturan_tenggat.acuan_tanggal": ["realisasi", "rencana"],
  "aturan_kewenangan.jenis": ["pemeriksa", "pembentuk_tim", "penjatuh"],
};

/** Rujukan antar-tabel yang harus berada dalam peraturan yang sama. */
const RUJUKAN: Record<string, { tabel: string; samaRegulasi: boolean }> = {
  tingkat_hukuman_id: { tabel: "tingkat_hukuman", samaRegulasi: true },
  tingkat_hukuman_terkait_id: { tabel: "tingkat_hukuman", samaRegulasi: true },
  jenis_hukuman_id: { tabel: "jenis_hukuman", samaRegulasi: true },
  pengganti_sementara_id: { tabel: "jenis_hukuman", samaRegulasi: true },
  pasal_regulasi_id: { tabel: "pasal_regulasi", samaRegulasi: true },
  menggantikan_id: { tabel: "regulasi", samaRegulasi: false },
  terkait_id: { tabel: "regulasi", samaRegulasi: false },
};

export const PESAN_TERPAKAI =
  "Peraturan ini sudah dipakai oleh kasus, sehingga isi baris ini tidak boleh diubah langsung agar kasus lama tetap utuh. " +
  "Pilih \"Simpan sebagai versi baru\" atau \"Koreksi salah ketik\" (dengan alasan tertulis).";

function hariIniWib() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function wajibAlasan(alasan: string | null | undefined): string {
  const a = (alasan ?? "").trim();
  if (a.length < 5) throw new GalatPengguna("Tuliskan alasan perubahan (minimal 5 huruf). Alasan dicatat di log audit.");
  return a;
}

function bandingNilai(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Menyaring & mengonversi isian formulir sesuai daftar putih kolom tabel. */
export function saringIsian(tabel: TabelKatalog, data: Record<string, unknown>): Record<string, unknown> {
  const kolom = KOLOM[tabel] as Record<string, TipeKolom>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    const tipe = kolom[k];
    if (!tipe) continue;
    out[k] = ubahTipe(tipe, v, k);
    const pil = PILIHAN[`${tabel}.${k}`];
    if (pil && out[k] !== null && !pil.includes(String(out[k]))) throw new GalatPengguna(`Isian "${k}" tidak sesuai pilihan yang diizinkan.`);
  }
  // Kolom jsonb/array yang NOT NULL
  for (const k of ["syarat_tambahan", "hasil", "kondisi"]) if (k in out && out[k] === null) out[k] = {};
  if ("jenis_dokumen" in out && out.jenis_dokumen === null) out.jenis_dokumen = [];
  return out;
}

function ubahTipe(tipe: TipeKolom, v: unknown, nama: string): unknown {
  if (v === undefined) return null;
  switch (tipe) {
    case "teks": {
      if (v === null) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    }
    case "angka": {
      if (v === null || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n)) throw new GalatPengguna(`Isian "${nama}" harus berupa bilangan bulat.`);
      return n;
    }
    case "bool":
      return v === true || v === "true" || v === "on" || v === 1;
    case "tanggal": {
      if (v === null || v === "") return null;
      const s = String(v).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new GalatPengguna("Format tanggal tidak valid.");
      return s;
    }
    case "uuid": {
      if (v === null || v === "") return null;
      const s = String(v);
      if (!/^[0-9a-f-]{36}$/i.test(s)) throw new GalatPengguna(`Pilihan "${nama}" tidak valid.`);
      return s;
    }
    case "json": {
      if (v === null || v === "") return null;
      if (typeof v === "string") {
        try {
          return JSON.parse(v);
        } catch {
          throw new GalatPengguna(`Isian "${nama}" bukan JSON yang sah.`);
        }
      }
      return v;
    }
    case "daftar_teks": {
      if (v === null || v === "") return [];
      const arr = Array.isArray(v) ? v : String(v).split(/[,\n]/);
      return arr.map((x) => String(x).trim()).filter(Boolean);
    }
  }
}

async function periksaRujukan(tx: Sql, regulasiId: string, isian: Record<string, unknown>) {
  for (const [k, v] of Object.entries(isian)) {
    const r = RUJUKAN[k];
    if (!r || v === null) continue;
    const ada = r.samaRegulasi
      ? await tx`select 1 from ${tx(r.tabel)} where id = ${v as string} and regulasi_id = ${regulasiId}`
      : await tx`select 1 from ${tx(r.tabel)} where id = ${v as string}`;
    if (!ada.length) throw new GalatPengguna("Pilihan rujukan tidak ditemukan pada peraturan ini. Muat ulang halaman lalu coba lagi.");
  }
}

function periksaWajib(tabel: TabelKatalog, baris: Record<string, unknown>) {
  for (const [k, label] of Object.entries(WAJIB[tabel] ?? {})) {
    const v = baris[k];
    if (v === null || v === undefined || v === "") throw new GalatPengguna(`Isian "${label}" wajib diisi.`);
  }
  if (tabel === "ambang_kehadiran" && baris.hari_max !== null && baris.hari_max !== undefined && Number(baris.hari_max) < Number(baris.hari_min)) {
    throw new GalatPengguna("Jumlah hari tertinggi tidak boleh lebih kecil dari jumlah hari terendah.");
  }
  if (tabel === "regulasi" && baris.berlaku_dari && baris.berlaku_sampai && String(baris.berlaku_sampai) <= String(baris.berlaku_dari)) {
    throw new GalatPengguna("Tanggal \"berlaku sampai\" harus sesudah tanggal \"berlaku dari\".");
  }
}

// ---------------------------------------------------------------------------
// Status pemakaian
// ---------------------------------------------------------------------------
export async function jumlahKasusRegulasi(db: Sql, regulasiId: string): Promise<number> {
  const [{ n }] = await db`select count(*)::int as n from entri where regulasi_id = ${regulasiId}`;
  return n as number;
}

/** Cermin logika trigger `katalog_kekal`: apakah baris ini sudah dipakai kasus. */
export async function barisTerpakai(db: Sql, tabel: TabelKatalog, baris: Record<string, unknown>): Promise<boolean> {
  if (!TABEL_KEKAL.has(tabel)) return false;
  const reg = tabel === "regulasi" ? (baris.id as string) : (baris.regulasi_id as string);
  if ((await jumlahKasusRegulasi(db, reg)) > 0) return true;
  if (tabel === "pasal_regulasi") {
    const r = await db`select 1 from pelanggaran_entri where pasal_regulasi_id = ${baris.id as string} limit 1`;
    return r.length > 0;
  }
  if (tabel === "jenis_hukuman") {
    const r = await db`select 1 where exists (select 1 from hukuman where jenis_hukuman_id = ${baris.id as string})
      or exists (select 1 from entri where jenis_hukuman_id = ${baris.id as string})`;
    return r.length > 0;
  }
  return false;
}

async function ambilBaris(tx: Sql, tabel: TabelKatalog, id: string) {
  const [row] = await tx`select * from ${tx(tabel)} where id = ${id}`;
  if (!row) throw new GalatPengguna("Data tidak ditemukan. Mungkin sudah diubah orang lain; muat ulang halaman.");
  return row as Record<string, unknown>;
}

function regulasiDari(tabel: TabelKatalog, baris: Record<string, unknown>) {
  return tabel === "regulasi" ? (baris.id as string) : (baris.regulasi_id as string);
}

function subset(baris: Record<string, unknown>, kunci: string[]) {
  return Object.fromEntries(kunci.map((k) => [k, baris[k] ?? null]));
}

// ---------------------------------------------------------------------------
// Tambah / ubah / hapus baris
// ---------------------------------------------------------------------------
export async function tambahBaris(
  tx: Sql,
  pelaku: Pelaku,
  p: { tabel: TabelKatalog; regulasiId: string; data: Record<string, unknown>; alasan: string },
): Promise<{ id: string }> {
  if (p.tabel === "regulasi") throw new GalatPengguna("Peraturan baru ditambahkan melalui wizard \"Tambah peraturan baru\" atau impor JSON.");
  const alasan = wajibAlasan(p.alasan);
  const [reg] = await tx`select id, kode from regulasi where id = ${p.regulasiId}`;
  if (!reg) throw new GalatPengguna("Peraturan tidak ditemukan.");
  const isian = saringIsian(p.tabel, p.data);
  await periksaRujukan(tx, p.regulasiId, isian);

  // Urutan otomatis bila kosong
  if ("urutan" in KOLOM[p.tabel] && (isian.urutan === null || isian.urutan === undefined)) {
    const [{ m }] = await tx`select coalesce(max(urutan), 0)::int as m from ${tx(p.tabel)} where regulasi_id = ${p.regulasiId}`;
    isian.urutan = (m as number) + (p.tabel === "aturan_tahapan" ? 10 : 1);
  }
  periksaWajib(p.tabel, isian);

  const baris: Record<string, unknown> = { ...isian, regulasi_id: p.regulasiId };
  if (!TANPA_PEMBUAT.has(p.tabel)) {
    baris.created_by = pelaku.id;
    baris.updated_by = pelaku.id;
  }
  const nilai = keNilaiSql(tx, baris);
  const [row] = await tx`insert into ${tx(p.tabel)} ${tx(nilai)} returning id`;
  await catatAudit(pelaku, {
    aksi: "buat", tabel: p.tabel, record_id: row.id,
    ringkasan: { regulasi_id: p.regulasiId, regulasi_kode: reg.kode, perubahan: selisih({}, isian) }, alasan,
  }, tx);
  return { id: row.id as string };
}

/** Membungkus nilai jsonb dengan tx.json agar tersimpan sebagai jsonb (bukan teks). */
function keNilaiSql(tx: Sql, baris: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(baris)) {
    out[k] = ["syarat_tambahan", "hasil", "kondisi", "nilai", "masukan", "harapan"].includes(k) && v !== null ? tx.json(v as never) : v;
  }
  return out as Record<string, never>;
}

export type ModeUbah = "biasa" | "koreksi" | "versi_baru";

export type HasilUbah = { id: string; regulasiId: string; mode: ModeUbah; idBaru?: string; catatan: string[] };

/**
 * Mengubah satu baris katalog.
 * - "biasa": ditolak bila katalog sudah dipakai dan ada kolom substantif yang berubah.
 * - "koreksi": koreksi salah ketik — izinkanKoreksi(tx) + audit aksi "koreksi".
 * - "versi_baru": baris baru (versi+1), baris lama dinonaktifkan dan ditautkan.
 */
export async function ubahBaris(
  tx: Sql,
  pelaku: Pelaku,
  p: { tabel: TabelKatalog; id: string; data: Record<string, unknown>; alasan: string; mode?: ModeUbah; tanggalVersi?: string | null },
): Promise<HasilUbah> {
  const mode = p.mode ?? "biasa";
  const alasan = wajibAlasan(p.alasan);
  const lama = await ambilBaris(tx, p.tabel, p.id);
  const regulasiId = regulasiDari(p.tabel, lama);
  const isian = saringIsian(p.tabel, p.data);

  const perubahan: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(isian)) if (!bandingNilai(lama[k], v)) perubahan[k] = v;
  if (!Object.keys(perubahan).length) throw new GalatPengguna("Tidak ada perubahan untuk disimpan.");
  await periksaRujukan(tx, regulasiId, perubahan);
  periksaWajib(p.tabel, { ...lama, ...perubahan });
  if (p.tabel === "jenis_hukuman" && perubahan.pengganti_sementara_id && perubahan.pengganti_sementara_id === p.id) {
    throw new GalatPengguna("Pengganti sementara tidak boleh jenis hukuman itu sendiri.");
  }

  const substantif = Object.keys(perubahan).filter((k) => !KOLOM_BEBAS.has(k));
  const terpakai = substantif.length > 0 && (await barisTerpakai(tx, p.tabel, lama));

  if (mode === "versi_baru" && substantif.length) {
    if (!TABEL_BERVERSI.has(p.tabel)) {
      throw new GalatPengguna(p.tabel === "regulasi"
        ? "Untuk identitas peraturan, gunakan tombol \"Buat versi baru peraturan\"."
        : "Baris jenis ini tidak dibuat versi tersendiri. Gunakan \"Koreksi salah ketik\" atau buat versi baru seluruh peraturan.");
    }
    return buatVersiBaris(tx, pelaku, p.tabel, lama, perubahan, alasan, p.tanggalVersi ?? null);
  }

  if (mode === "biasa" && terpakai) throw new GalatPengguna(PESAN_TERPAKAI);

  const kunci = Object.keys(perubahan);
  const nilai: Record<string, unknown> = { ...perubahan };
  if (p.tabel !== "regulasi_terkait") nilai.updated_by = pelaku.id;
  if (mode === "koreksi") await izinkanKoreksi(tx);
  await tx`update ${tx(p.tabel)} set ${tx(keNilaiSql(tx, nilai))}, updated_at = now() where id = ${p.id}`;
  if (mode === "koreksi") await tx`select set_config('simpel.izin_koreksi', '', true)`;

  await catatAudit(pelaku, {
    aksi: mode === "koreksi" ? "koreksi" : "ubah", tabel: p.tabel, record_id: p.id,
    ringkasan: { regulasi_id: regulasiId, perubahan: selisih(subset(lama, kunci), perubahan), terpakai_kasus: terpakai },
    alasan,
  }, tx);

  const catatan: string[] = [];
  if (p.tabel === "regulasi" && perubahan.status === "aktif") catatan.push(...(await hubungkanPengganti(tx, pelaku, p.id, alasan)));
  return { id: p.id, regulasiId, mode, catatan };
}

async function kodeBebas(tx: Sql, tabel: TabelKatalog, regulasiId: string, dasar: string) {
  let n = 2;
  let kode = dasar;
  for (;;) {
    const ada = await tx`select 1 from ${tx(tabel)} where regulasi_id = ${regulasiId} and kode = ${kode}`;
    if (!ada.length) return kode;
    kode = `${dasar.replace(/_v\d+$/, "")}_v${n}`;
    n += 1;
  }
}

/** Baris versi baru: salin baris lama + perubahan, versi+1; baris lama dinonaktifkan dan ditautkan. */
async function buatVersiBaris(
  tx: Sql, pelaku: Pelaku, tabel: TabelKatalog, lama: Record<string, unknown>, perubahan: Record<string, unknown>,
  alasan: string, tanggalVersi: string | null,
): Promise<HasilUbah> {
  const regulasiId = lama.regulasi_id as string;
  const catatan: string[] = [];
  const kolom = Object.keys(KOLOM[tabel]);
  const baru: Record<string, unknown> = { ...subset(lama, kolom), ...perubahan };
  baru.regulasi_id = regulasiId;
  baru.versi = Number(lama.versi ?? 1) + 1;
  baru.aktif = true;
  baru.created_by = pelaku.id;
  baru.updated_by = pelaku.id;
  if (tabel === "jenis_hukuman") {
    const dasar = baru.kode === lama.kode ? `${String(lama.kode).replace(/_v\d+$/, "")}_v${baru.versi}` : String(baru.kode);
    baru.kode = await kodeBebas(tx, tabel, regulasiId, dasar);
    if (baru.kode !== perubahan.kode) catatan.push(`Kode jenis hukuman versi baru: ${baru.kode} (kode harus unik dalam satu peraturan).`);
  }
  const [row] = await tx`insert into ${tx(tabel)} ${tx(keNilaiSql(tx, baru))} returning id`;
  const idBaru = row.id as string;
  const tanggal = tanggalVersi || hariIniWib();
  await tx`update ${tx(tabel)} set aktif = false, berlaku_sampai = ${tanggal}, digantikan_oleh_id = ${idBaru},
      updated_by = ${pelaku.id}, updated_at = now() where id = ${lama.id as string}`;

  await catatAudit(pelaku, {
    aksi: "buat", tabel, record_id: idBaru,
    ringkasan: { regulasi_id: regulasiId, versi_baru_dari: lama.id, versi: baru.versi, perubahan: selisih(subset(lama, Object.keys(perubahan)), perubahan) },
    alasan,
  }, tx);
  await catatAudit(pelaku, {
    aksi: "ubah", tabel, record_id: lama.id as string,
    ringkasan: { regulasi_id: regulasiId, perubahan: selisih({ aktif: lama.aktif, berlaku_sampai: lama.berlaku_sampai, digantikan_oleh_id: lama.digantikan_oleh_id }, { aktif: false, berlaku_sampai: tanggal, digantikan_oleh_id: idBaru }) },
    alasan: `Digantikan versi baru: ${alasan}`,
  }, tx);

  // Tautan dari tabel lain dipindahkan ke versi baru
  if (tabel === "pasal_regulasi") {
    const pindah = await tx`update aturan_pemetaan_pelanggaran set pasal_regulasi_id = ${idBaru}, updated_at = now()
      where pasal_regulasi_id = ${lama.id as string} and aktif returning id`;
    for (const m of pindah) {
      await catatAudit(pelaku, { aksi: "ubah", tabel: "aturan_pemetaan_pelanggaran", record_id: m.id, ringkasan: { regulasi_id: regulasiId, perubahan: { pasal_regulasi_id: { sebelum: lama.id, sesudah: idBaru } } }, alasan: "Mengikuti versi baru pasal" }, tx);
    }
    if (pindah.length) catatan.push(`${pindah.length} pemetaan pelanggaran ikut dipindahkan ke versi baru pasal.`);
  }
  if (tabel === "jenis_hukuman") {
    const pengganti = await tx`update jenis_hukuman set pengganti_sementara_id = ${idBaru}, updated_at = now()
      where regulasi_id = ${regulasiId} and pengganti_sementara_id = ${lama.id as string} and aktif returning id`;
    for (const j of pengganti) {
      await catatAudit(pelaku, { aksi: "ubah", tabel: "jenis_hukuman", record_id: j.id, ringkasan: { regulasi_id: regulasiId, perubahan: { pengganti_sementara_id: { sebelum: lama.id, sesudah: idBaru } } }, alasan: "Mengikuti versi baru jenis hukuman" }, tx);
    }
    const ambang = await tx`select * from ambang_kehadiran where regulasi_id = ${regulasiId} and jenis_hukuman_id = ${lama.id as string} and aktif`;
    for (const a of ambang) {
      const ubahAmbang: Record<string, unknown> = { jenis_hukuman_id: idBaru };
      if (perubahan.tingkat_hukuman_id) ubahAmbang.tingkat_hukuman_id = perubahan.tingkat_hukuman_id;
      await buatVersiBaris(tx, pelaku, "ambang_kehadiran", a as Record<string, unknown>, ubahAmbang, `Mengikuti versi baru jenis hukuman: ${alasan}`, tanggal);
    }
    if (ambang.length) catatan.push(`${ambang.length} baris ambang kehadiran ikut dibuat versi barunya agar menunjuk jenis hukuman yang baru.`);
  }
  return { id: lama.id as string, regulasiId, mode: "versi_baru", idBaru, catatan };
}

export async function hapusBaris(tx: Sql, pelaku: Pelaku, p: { tabel: TabelKatalog; id: string; alasan: string }) {
  const alasan = wajibAlasan(p.alasan);
  if (!TABEL_BOLEH_HAPUS.has(p.tabel)) {
    throw new GalatPengguna("Baris katalog tidak dihapus. Nonaktifkan saja supaya kasus lama tetap dapat dibaca.");
  }
  const lama = await ambilBaris(tx, p.tabel, p.id);
  await tx`delete from ${tx(p.tabel)} where id = ${p.id}`;
  const isi = Object.fromEntries(Object.entries(lama).filter(([k]) => !["created_at", "updated_at"].includes(k)));
  await catatAudit(pelaku, {
    aksi: "hapus", tabel: p.tabel, record_id: p.id,
    ringkasan: { regulasi_id: lama.regulasi_id, sebelum: isi }, alasan,
  }, tx);
  return { regulasiId: lama.regulasi_id as string };
}

// ---------------------------------------------------------------------------
// Peraturan: versi baru, penggantian, pendaftaran definisi
// ---------------------------------------------------------------------------

/**
 * Bila peraturan aktif ini menggantikan peraturan lain, tandai peraturan lama:
 * berlaku_sampai = berlaku_dari peraturan baru, digantikan_oleh_id, status nonaktif
 * (semuanya kolom bebas, jadi tetap boleh walau peraturan lama sudah dipakai).
 */
export async function hubungkanPengganti(tx: Sql, pelaku: Pelaku, regulasiBaruId: string, alasan: string): Promise<string[]> {
  const [baru] = await tx`select id, kode, nama_singkat, berlaku_dari, menggantikan_id from regulasi where id = ${regulasiBaruId}`;
  if (!baru?.menggantikan_id) return [];
  const [lama] = await tx`select id, kode, nama_singkat, status, berlaku_sampai, digantikan_oleh_id from regulasi where id = ${baru.menggantikan_id}`;
  if (!lama) return [];
  const sesudah = {
    berlaku_sampai: lama.berlaku_sampai ?? baru.berlaku_dari ?? null,
    digantikan_oleh_id: baru.id,
    status: "nonaktif",
  };
  const beda = selisih({ berlaku_sampai: lama.berlaku_sampai, digantikan_oleh_id: lama.digantikan_oleh_id, status: lama.status }, sesudah);
  if (!Object.keys(beda).length) return [];
  await tx`update regulasi set berlaku_sampai = ${sesudah.berlaku_sampai}, digantikan_oleh_id = ${sesudah.digantikan_oleh_id},
      status = ${sesudah.status}, updated_by = ${pelaku.id}, updated_at = now() where id = ${lama.id}`;
  await catatAudit(pelaku, {
    aksi: "ubah", tabel: "regulasi", record_id: lama.id,
    ringkasan: { regulasi_id: lama.id, perubahan: beda, digantikan_oleh: baru.kode }, alasan: `Digantikan ${baru.nama_singkat}: ${alasan}`,
  }, tx);
  return [`${lama.nama_singkat} ditandai digantikan oleh ${baru.nama_singkat}${sesudah.berlaku_sampai ? ` dan berakhir ${sesudah.berlaku_sampai}` : ""}.`];
}

async function saranKodeBebas(tx: Sql, kode: string) {
  const dasar = kode.replace(/_V\d+$/i, "");
  for (let n = 2; n < 100; n += 1) {
    const k = `${dasar}_V${n}`;
    const ada = await tx`select 1 from regulasi where kode = ${k}`;
    if (!ada.length) return k;
  }
  return `${dasar}_BARU`;
}

/** Memastikan kode peraturan belum dipakai; bila sudah, galat yang menyarankan kode lain. */
export async function pastikanKodeBaru(tx: Sql, kode: string) {
  const k = (kode ?? "").trim();
  if (!k) throw new GalatPengguna("Kode peraturan wajib diisi.");
  if (!/^[A-Za-z0-9_.-]+$/.test(k)) throw new GalatPengguna("Kode peraturan hanya boleh berisi huruf, angka, garis bawah, titik, atau tanda hubung (tanpa spasi).");
  const [ada] = await tx`select nama_singkat from regulasi where kode = ${k}`;
  if (ada) throw new GalatPengguna(`Kode ${k} sudah dipakai oleh ${ada.nama_singkat}. Gunakan kode lain, misalnya ${await saranKodeBebas(tx, k)}.`);
  return k;
}

/** Menyimpan definisi baru (wizard / impor). Tidak pernah menimpa peraturan yang sudah ada. */
export async function daftarkanDefinisi(
  tx: Sql,
  pelaku: Pelaku,
  def: DefinisiRegulasi,
  p: { alasan: string; sumber: "wizard" | "impor"; disalinDari?: string | null },
): Promise<{ regulasiId: string; peringatan: string[] }> {
  const alasan = wajibAlasan(p.alasan);
  if (!def || def.format !== FORMAT_DEFINISI) throw new GalatPengguna(`Berkas bukan definisi peraturan SIMPEL (format harus "${FORMAT_DEFINISI}").`);
  if (!def.regulasi?.judul || !def.regulasi?.nama_singkat || !def.regulasi?.jenis) {
    throw new GalatPengguna("Identitas peraturan belum lengkap (jenis, judul, dan nama singkat wajib diisi).");
  }
  await pastikanKodeBaru(tx, def.regulasi.kode);
  if (def.regulasi.berlaku_dari && def.regulasi.berlaku_sampai && def.regulasi.berlaku_sampai <= def.regulasi.berlaku_dari) {
    throw new GalatPengguna("Tanggal \"berlaku sampai\" harus sesudah tanggal \"berlaku dari\".");
  }

  let hasil: { regulasiId: string; peringatan: string[] };
  try {
    hasil = await simpanDefinisi(tx, def, pelaku.id);
    hasil.peringatan.push(...(await simpanTerkait(tx, def)));
  } catch (e) {
    // Galat dari simpanDefinisi (rujukan kode tidak ditemukan, dsb.) sudah berbahasa manusia.
    const pg = e as { code?: string; message?: string };
    if (!pg.code && pg.message) throw new GalatPengguna(pg.message);
    throw e;
  }

  const catatan = def.regulasi.status === "aktif" ? await hubungkanPengganti(tx, pelaku, hasil.regulasiId, alasan) : [];
  await catatAudit(pelaku, {
    aksi: p.sumber === "impor" ? "impor" : "buat", tabel: "regulasi", record_id: hasil.regulasiId,
    ringkasan: {
      regulasi_id: hasil.regulasiId, kode: def.regulasi.kode, sumber: p.sumber, disalin_dari: p.disalinDari ?? null,
      jumlah: {
        tingkat: def.tingkat?.length ?? 0, jenis_hukuman: def.jenis_hukuman?.length ?? 0, pasal: def.pasal?.length ?? 0,
        ambang: def.ambang?.length ?? 0, tenggat: def.tenggat?.length ?? 0, kewenangan: def.kewenangan?.length ?? 0,
        tahapan: def.tahapan?.length ?? 0, pemetaan: def.pemetaan?.length ?? 0, kaidah: def.kaidah?.length ?? 0, fixture: def.fixture?.length ?? 0,
      },
      peringatan: hasil.peringatan,
    },
    alasan,
  }, tx);
  return { regulasiId: hasil.regulasiId, peringatan: [...hasil.peringatan, ...catatan] };
}

/**
 * "Buat versi baru" seluruh peraturan: salin seluruh isi aktif ke baris peraturan
 * baru (versi+1, status draf, menggantikan peraturan lama). Peraturan lama baru
 * ditandai berakhir ketika versi baru diaktifkan (hubungkanPengganti).
 */
export async function buatVersiBaruRegulasi(
  tx: Sql,
  pelaku: Pelaku,
  p: { regulasiId: string; kode: string; berlakuDari: string | null; alasan: string },
): Promise<{ regulasiId: string; peringatan: string[] }> {
  const alasan = wajibAlasan(p.alasan);
  const [lama] = await tx`select id, kode, versi from regulasi where id = ${p.regulasiId}`;
  if (!lama) throw new GalatPengguna("Peraturan tidak ditemukan.");
  const kode = await pastikanKodeBaru(tx, p.kode);
  const def = await eksporDefinisi(tx, p.regulasiId);
  def.regulasi = {
    ...def.regulasi, kode, status: "draf", berlaku_dari: p.berlakuDari || def.regulasi.berlaku_dari || null, berlaku_sampai: null,
    menggantikan_kode: lama.kode,
  };
  const hasil = await simpanDefinisi(tx, def, pelaku.id);
  hasil.peringatan.push(...(await simpanTerkait(tx, def)));
  const versi = Number(lama.versi ?? 1) + 1;
  await tx`update regulasi set versi = ${versi} where id = ${hasil.regulasiId}`;
  await catatAudit(pelaku, {
    aksi: "buat", tabel: "regulasi", record_id: hasil.regulasiId,
    ringkasan: { regulasi_id: hasil.regulasiId, kode, versi, versi_baru_dari: lama.kode, peringatan: hasil.peringatan }, alasan,
  }, tx);
  await catatAudit(pelaku, {
    aksi: "ubah", tabel: "regulasi", record_id: lama.id,
    ringkasan: { regulasi_id: lama.id, keterangan: `Versi baru dibuat: ${kode} (draf). Peraturan ini ditandai berakhir saat versi baru diaktifkan.` }, alasan,
  }, tx);
  return hasil;
}
