// Normalisasi data pegawai dari Simpega (Excel maupun API).
// Modul MURNI (tanpa basis data, tanpa "server-only") sehingga dipakai bersama oleh
// peramban (validasi di wizard impor), aksi server, dan skrip.

// ---------------------------------------------------------------------------
// Field tujuan yang BOLEH disimpan (PRD §6.1). Daftar putih — selain ini ditolak.
// ---------------------------------------------------------------------------
export type JenisField = "teks" | "nip" | "tanggal" | "jk" | "golongan" | "email";

export const FIELD_PEGAWAI = [
  { kode: "nip", label: "NIP", jenis: "nip" },
  { kode: "nip_lama", label: "NIP lama", jenis: "nip" },
  { kode: "nama_lengkap_gelar", label: "Nama lengkap (dengan gelar)", jenis: "teks" },
  { kode: "nama_tanpa_gelar", label: "Nama tanpa gelar", jenis: "teks" },
  { kode: "jenis_kelamin", label: "Jenis kelamin (L/P)", jenis: "jk" },
  { kode: "tempat_lahir", label: "Tempat lahir", jenis: "teks" },
  { kode: "tanggal_lahir", label: "Tanggal lahir", jenis: "tanggal" },
  { kode: "email_resmi", label: "Email resmi", jenis: "email" },
  { kode: "status_pegawai", label: "Status pegawai", jenis: "teks" },
  { kode: "jenis_pegawai", label: "Jenis pegawai", jenis: "teks" },
  { kode: "kelompok_jabatan", label: "Kelompok jabatan", jenis: "teks" },
  { kode: "golongan_pangkat", label: "Golongan / pangkat", jenis: "golongan" },
  { kode: "tmt_golongan", label: "TMT golongan", jenis: "tanggal" },
  { kode: "jabatan_fungsional", label: "Jabatan fungsional", jenis: "teks" },
  { kode: "tmt_jabatan_fungsional", label: "TMT jabatan fungsional", jenis: "tanggal" },
  { kode: "jabatan_tambahan", label: "Jabatan tambahan", jenis: "teks" },
  { kode: "unit_kerja", label: "Unit kerja", jenis: "teks" },
  { kode: "subag_unit_kerja", label: "Subbagian / unit kerja", jenis: "teks" },
  { kode: "unit_kerja_induk", label: "Unit kerja induk", jenis: "teks" },
  { kode: "direktorat_fakultas", label: "Direktorat / fakultas", jenis: "teks" },
  { kode: "pejabat_penilai_nip", label: "NIP pejabat penilai (atasan langsung)", jenis: "nip" },
  { kode: "atasan_pejabat_penilai_nip", label: "NIP atasan pejabat penilai", jenis: "nip" },
  { kode: "tanggal_masuk", label: "Tanggal masuk", jenis: "tanggal" },
  { kode: "tanggal_keluar", label: "Tanggal keluar", jenis: "tanggal" },
] as const satisfies readonly { kode: string; label: string; jenis: JenisField }[];

export type FieldPegawai = (typeof FIELD_PEGAWAI)[number]["kode"];
export const KODE_FIELD = new Set<string>(FIELD_PEGAWAI.map((f) => f.kode));
export const LABEL_FIELD: Record<string, string> = Object.fromEntries(FIELD_PEGAWAI.map((f) => [f.kode, f.label]));
const JENIS_FIELD: Record<string, JenisField> = Object.fromEntries(FIELD_PEGAWAI.map((f) => [f.kode, f.jenis]));

/** Kolom turunan yang ikut tersimpan (dihitung dari golongan_pangkat). */
export const FIELD_TURUNAN = ["pangkat", "golongan_ruang"] as const;
/** Semua kolom pegawai yang dapat diisi oleh impor (field sumber + turunan). */
export const KOLOM_IMPOR = [...FIELD_PEGAWAI.map((f) => f.kode), ...FIELD_TURUNAN] as const;
export type KolomImpor = (typeof KOLOM_IMPOR)[number];
export const LABEL_KOLOM: Record<string, string> = { ...LABEL_FIELD, pangkat: "Pangkat", golongan_ruang: "Golongan ruang" };

export function adalahField(x: unknown): x is FieldPegawai {
  return typeof x === "string" && KODE_FIELD.has(x);
}

// ---------------------------------------------------------------------------
// Kolom TERLARANG (PRD §8.1, UU 27/2022) — ditolak keras, tidak pernah disimpan.
// ---------------------------------------------------------------------------
export const KOLOM_TERLARANG = [
  "KK", "NIK", "NPWP", "NO BPJS", "IBU KANDUNG", "Rekening", "Gaji Pokok(Rp)", "Alamat Asal", "Alamat Domisili", "Alamat KTP",
  "Tanggal Nikah", "Nama Pasangan", "Pekerjaan Pasangan", "Agama", "Status Pernikahan", "HP", "Email Alternatif 1", "Email Alternatif 2",
] as const;

export const KETERANGAN_TERLARANG = "kolom ini sengaja tidak disimpan SIMPEL";

const kunciHeader = (h: string) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const TERLARANG = new Set(KOLOM_TERLARANG.map(kunciHeader));

/** true bila nama header termasuk kolom data pribadi yang dilarang disimpan. */
export function kolomTerlarang(header: string | null | undefined): boolean {
  return TERLARANG.has(kunciHeader(header ?? ""));
}

// ---------------------------------------------------------------------------
// Tebakan pemetaan dari nama header (bisa diubah pengguna)
// ---------------------------------------------------------------------------
const TEBAKAN: Record<string, FieldPegawai> = {
  nip: "nip",
  niplama: "nip_lama",
  namalengkapdengangelar: "nama_lengkap_gelar",
  namalengkap: "nama_lengkap_gelar",
  nama: "nama_lengkap_gelar",
  namalengkaptanpagelar: "nama_tanpa_gelar",
  namatanpagelar: "nama_tanpa_gelar",
  jeniskelamin: "jenis_kelamin",
  tempatlahir: "tempat_lahir",
  tanggallahir: "tanggal_lahir",
  emailresmi: "email_resmi",
  statuspegawai: "status_pegawai",
  jenispegawai: "jenis_pegawai",
  kelompokjabatan: "kelompok_jabatan",
  golonganpangkat: "golongan_pangkat",
  jabatanfungsional: "jabatan_fungsional",
  jabatantambahan: "jabatan_tambahan",
  subagunitkerja: "subag_unit_kerja",
  unitunitkerjainduk: "unit_kerja_induk",
  unitkerjainduk: "unit_kerja_induk",
  direktoratfakultas: "direktorat_fakultas",
  pejabatpenilai: "pejabat_penilai_nip",
  atasanpejabatpenilai: "atasan_pejabat_penilai_nip",
  tanggalmasuk: "tanggal_masuk",
  tanggalkeluar: "tanggal_keluar",
  tmtgolongan: "tmt_golongan",
  tmtjabatanfungsional: "tmt_jabatan_fungsional",
};

/** Header "jangkar" untuk mengartikan nama kolom yang berulang (TMT, Unit Kerja). */
const JANGKAR: Record<string, string> = { golonganpangkat: "golongan", jabatanfungsional: "fungsional", jabatantambahan: "tambahan" };

/**
 * Menebak field tujuan untuk tiap indeks kolom. Kolom berulang ("TMT", "Unit Kerja")
 * diartikan dari header jangkar terdekat di sebelah kirinya. Kolom terlarang tidak pernah dipetakan.
 */
export function tebakPemetaan(header: string[]): Record<number, FieldPegawai | null> {
  const hasil: Record<number, FieldPegawai | null> = {};
  const terpakai = new Set<string>();
  let jangkar: string | null = null;
  header.forEach((h, i) => {
    const k = kunciHeader(h);
    if (JANGKAR[k]) jangkar = JANGKAR[k];
    let f: FieldPegawai | null = null;
    if (!k || kolomTerlarang(h)) f = null;
    else if (k === "tmt") f = jangkar === "golongan" ? "tmt_golongan" : jangkar === "fungsional" ? "tmt_jabatan_fungsional" : null;
    else if (k === "unitkerja") f = jangkar === "tambahan" ? null : "unit_kerja";
    else f = TEBAKAN[k] ?? null;
    if (f && terpakai.has(f)) f = null;
    if (f) terpakai.add(f);
    hasil[i] = f;
  });
  return hasil;
}

// ---------------------------------------------------------------------------
// Fungsi normalisasi nilai
// ---------------------------------------------------------------------------
/** Merapikan teks: buang spasi berlebih; kosong / "-" → null. */
export function rapikan(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[ \s]+/g, " ").trim();
  if (!s || /^[-–—.,\s]+$/.test(s)) return null;
  return s;
}

function tanggalSah(y: number, m: number, d: number) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const akhir = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= akhir;
}

const dua = (n: number) => String(n).padStart(2, "0");

/**
 * Tanggal Simpega → "YYYY-MM-DD". Menerima DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, dan nomor seri Excel.
 * Mengembalikan { nilai } atau { galat }.
 */
export function normalTanggal(v: unknown): { nilai: string | null; galat?: string } {
  const s = rapikan(v);
  if (!s) return { nilai: null };
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const [d, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return tanggalSah(y, b, d) ? { nilai: `${y}-${dua(b)}-${dua(d)}` } : { nilai: null, galat: `tanggal "${s}" tidak ada di kalender` };
  }
  m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) {
    const [y, b, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return tanggalSah(y, b, d) ? { nilai: `${y}-${dua(b)}-${dua(d)}` } : { nilai: null, galat: `tanggal "${s}" tidak ada di kalender` };
  }
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    // nomor seri Excel (hari sejak 30-12-1899)
    const n = Math.floor(Number(s));
    const t = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    const [y, b, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
    if (tanggalSah(y, b, d)) return { nilai: `${y}-${dua(b)}-${dua(d)}` };
  }
  return { nilai: null, galat: `format tanggal "${s}" tidak dikenali (gunakan DD-MM-YYYY)` };
}

/** Jenis kelamin → "L" | "P". */
export function normalJenisKelamin(v: unknown): { nilai: "L" | "P" | null; galat?: string } {
  const s = rapikan(v);
  if (!s) return { nilai: null };
  const k = s.toLowerCase().replace(/[^a-z]/g, "");
  if (k === "l" || k === "lakilaki" || k === "pria" || k === "male" || k === "m") return { nilai: "L" };
  if (k === "p" || k === "perempuan" || k === "wanita" || k === "female" || k === "f" || k === "w") return { nilai: "P" };
  return { nilai: null, galat: `jenis kelamin "${s}" bukan L/P` };
}

/** NIP: hanya angka; spasi & tanda kutip dibuang. */
export function normalNip(v: unknown): { nilai: string | null; galat?: string } {
  const s = rapikan(v);
  if (!s) return { nilai: null };
  const bersih = s.replace(/^'+/, "").replace(/[\s.]/g, "");
  if (!/^\d{6,25}$/.test(bersih)) return { nilai: null, galat: `NIP "${s}" harus berupa angka` };
  return { nilai: bersih };
}

const RUANG = /^(I{1,3}|IV)\s*\/\s*([a-e])$/i;

/**
 * "Penata Muda Tingkat I, III/b" → { golongan_pangkat, pangkat: "Penata Muda Tingkat I", golongan_ruang: "III/b" }.
 * Bagian yang kosong/"-" menjadi null. Golongan PPPK (mis. "X") disimpan apa adanya.
 */
export function pecahGolongan(v: unknown): { golongan_pangkat: string | null; pangkat: string | null; golongan_ruang: string | null } {
  const s = rapikan(v);
  if (!s) return { golongan_pangkat: null, pangkat: null, golongan_ruang: null };
  const potong = s.lastIndexOf(",");
  let pangkat: string | null;
  let ruang: string | null;
  if (potong >= 0) {
    pangkat = rapikan(s.slice(0, potong));
    ruang = rapikan(s.slice(potong + 1));
  } else {
    const m = s.match(/^(.*?)[\s(]*((?:I{1,3}|IV)\s*\/\s*[a-e])\)?$/i);
    pangkat = m ? rapikan(m[1]) : s;
    ruang = m ? m[2] : null;
  }
  if (ruang) {
    const r = ruang.match(RUANG);
    ruang = r ? `${r[1].toUpperCase()}/${r[2].toLowerCase()}` : ruang.toUpperCase();
  }
  const golongan_pangkat = pangkat || ruang ? [pangkat, ruang].filter(Boolean).join(", ") : null;
  return { golongan_pangkat, pangkat, golongan_ruang: ruang };
}

// ---------------------------------------------------------------------------
// Normalisasi satu baris
// ---------------------------------------------------------------------------
/** Satu baris dari sumber (Excel/API): nilai mentah per field tujuan. Field yang tidak ada = tidak diubah. */
export type BarisSumber = Partial<Record<FieldPegawai, string | number | null>>;

export type DataPegawai = Partial<Record<KolomImpor, string | null>>;

export type HasilNormalisasi = {
  data: DataPegawai;
  /** Galat yang membuat baris ditolak. */
  galat: string[];
};

const MAKS_PANJANG = 500;

/** Menormalkan satu baris. Hanya field dalam daftar putih yang diproses; sisanya diabaikan. */
export function normalisasiBaris(b: BarisSumber): HasilNormalisasi {
  const data: DataPegawai = {};
  const galat: string[] = [];
  for (const [k, mentah] of Object.entries(b)) {
    if (!adalahField(k)) continue;
    if (mentah !== null && mentah !== undefined && String(mentah).length > MAKS_PANJANG) {
      galat.push(`${LABEL_FIELD[k]} terlalu panjang`);
      continue;
    }
    switch (JENIS_FIELD[k]) {
      case "tanggal": {
        const t = normalTanggal(mentah);
        if (t.galat) galat.push(`${LABEL_FIELD[k]}: ${t.galat}`);
        data[k] = t.nilai;
        break;
      }
      case "jk": {
        const t = normalJenisKelamin(mentah);
        if (t.galat) galat.push(`${LABEL_FIELD[k]}: ${t.galat}`);
        data[k] = t.nilai;
        break;
      }
      case "nip": {
        const t = normalNip(mentah);
        if (t.galat) {
          // NIP pegawai sendiri wajib benar; NIP atasan yang salah cukup dikosongkan.
          if (k === "nip" || k === "nip_lama") galat.push(`${LABEL_FIELD[k]}: ${t.galat}`);
        }
        data[k] = t.nilai;
        break;
      }
      case "golongan": {
        const g = pecahGolongan(mentah);
        data.golongan_pangkat = g.golongan_pangkat;
        data.pangkat = g.pangkat;
        data.golongan_ruang = g.golongan_ruang;
        break;
      }
      case "email": {
        const s = rapikan(mentah);
        data[k] = s ? s.toLowerCase() : null;
        break;
      }
      default:
        data[k] = rapikan(mentah);
    }
  }
  if ("nama_lengkap_gelar" in b && !data.nama_lengkap_gelar) galat.push("Nama lengkap kosong");
  return { data, galat };
}

/** Kunci pencocokan untuk baris tanpa NIP: nama persis (tanpa beda huruf besar/spasi) + tanggal lahir. */
export function kunciNamaLahir(nama: string | null | undefined, tanggalLahir: string | null | undefined) {
  if (!nama) return null;
  return `${nama.replace(/\s+/g, " ").trim().toLowerCase()}|${tanggalLahir ?? ""}`;
}

/** Huruf kolom Excel dari indeks 0-based: 0 → A, 27 → AB. */
export function hurufKolom(i: number) {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Validasi sekumpulan baris (dipakai di peramban untuk ringkasan, dan di server per batch)
// ---------------------------------------------------------------------------
export type BarisMasuk = BarisSumber & { nomor: number };
export type BarisSah = { nomor: number; data: DataPegawai; kunci: string | null };
export type BarisDitolak = { baris: number; alasan: string; nip?: string | null; nama?: string | null };

export type HasilValidasi = {
  sah: BarisSah[];
  ditolak: BarisDitolak[];
  /** Status pegawai yang tidak ada di tabel pemetaan → rezim "perlu verifikasi". */
  statusTakDikenal: Record<string, number>;
  /** Ringkasan per jenis masalah untuk layar validasi. */
  masalah: { nipGanda: number; tanggal: number; jenisKelamin: number; lain: number };
};

/** Kunci identitas baris: NIP, atau nama + tanggal lahir bila NIP kosong. */
export function kunciBaris(d: DataPegawai): string | null {
  if (d.nip) return `nip:${d.nip}`;
  const k = kunciNamaLahir(d.nama_lengkap_gelar, d.tanggal_lahir);
  return k ? `nama:${k}` : null;
}

/**
 * Normalisasi + validasi: format tanggal, jenis kelamin, NIP/identitas ganda di dalam kumpulan,
 * dan status pegawai yang belum dikenal (hanya peringatan, tidak menolak baris).
 */
export function validasiKumpulan(baris: BarisMasuk[], statusDikenal?: Iterable<string>): HasilValidasi {
  const dikenal = statusDikenal ? new Set([...statusDikenal].map((s) => s.toLowerCase())) : null;
  const sementara: BarisSah[] = [];
  const ditolak: BarisDitolak[] = [];
  const masalah = { nipGanda: 0, tanggal: 0, jenisKelamin: 0, lain: 0 };
  const statusTakDikenal: Record<string, number> = {};

  for (const b of baris) {
    const nomor = Number(b.nomor);
    const { nomor: _abaikan, ...isi } = b;
    void _abaikan;
    const n = normalisasiBaris(isi);
    if (n.galat.length) {
      for (const g of n.galat) {
        if (/tanggal|TMT/i.test(g)) masalah.tanggal++;
        else if (/jenis kelamin/i.test(g)) masalah.jenisKelamin++;
        else masalah.lain++;
      }
      ditolak.push({ baris: nomor, alasan: n.galat.join("; "), nip: n.data.nip ?? null, nama: n.data.nama_lengkap_gelar ?? null });
      continue;
    }
    sementara.push({ nomor, data: n.data, kunci: kunciBaris(n.data) });
  }

  // Identitas ganda di dalam berkas → semua baris yang sama ditolak (tidak jelas mana yang benar).
  const kelompok = new Map<string, number[]>();
  for (const s of sementara) if (s.kunci) kelompok.set(s.kunci, [...(kelompok.get(s.kunci) ?? []), s.nomor]);
  const sah: BarisSah[] = [];
  for (const s of sementara) {
    const sama = s.kunci ? kelompok.get(s.kunci)! : [];
    if (sama.length > 1) {
      masalah.nipGanda++;
      const lain = sama.filter((x) => x !== s.nomor).join(", ");
      ditolak.push({
        baris: s.nomor,
        alasan: s.data.nip ? `NIP ganda di berkas (sama dengan baris ${lain})` : `Nama & tanggal lahir ganda di berkas (sama dengan baris ${lain})`,
        nip: s.data.nip ?? null, nama: s.data.nama_lengkap_gelar ?? null,
      });
      continue;
    }
    if (dikenal && s.data.status_pegawai && !dikenal.has(s.data.status_pegawai.toLowerCase())) {
      statusTakDikenal[s.data.status_pegawai] = (statusTakDikenal[s.data.status_pegawai] ?? 0) + 1;
    }
    sah.push(s);
  }
  ditolak.sort((a, b) => a.baris - b.baris);
  return { sah, ditolak, statusTakDikenal, masalah };
}

/**
 * Memecah baris menjadi batch ≤ ukuran, dengan baris berkunci sama selalu di batch yang sama
 * (agar pemeriksaan identitas ganda di server tetap utuh).
 */
export function pecahBatch<T extends BarisMasuk>(baris: T[], ukuran = 200): T[][] {
  const berkunci = baris.map((b) => {
    const { nomor: _n, ...isi } = b;
    void _n;
    return { b, k: kunciBaris(normalisasiBaris(isi).data) ?? `#${b.nomor}` };
  });
  berkunci.sort((x, y) => (x.k < y.k ? -1 : x.k > y.k ? 1 : x.b.nomor - y.b.nomor));
  const hasil: T[][] = [];
  let i = 0;
  while (i < berkunci.length) {
    let j = Math.min(i + ukuran, berkunci.length);
    // mundurkan batas bila memotong rentetan kunci yang sama
    if (j < berkunci.length) {
      let m = j;
      while (m > i + 1 && berkunci[m].k === berkunci[m - 1].k) m--;
      if (m > i) j = m;
    }
    hasil.push(berkunci.slice(i, j).map((x) => x.b));
    i = j;
  }
  return hasil;
}
