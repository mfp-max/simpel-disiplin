// Kalkulator hari kerja. Membaca kalender libur dari tabel `hari_libur`
// (diisi admin per tahun) — tidak memakai pustaka hari libur asing.
// Semua tanggal berupa teks "YYYY-MM-DD" agar bebas masalah zona waktu.

export type Kalender = { libur: Set<string> };

export const kalenderKosong: Kalender = { libur: new Set() };

export function buatKalender(tanggalLibur: Iterable<string>): Kalender {
  return { libur: new Set(tanggalLibur) };
}

function keDate(t: string) {
  const [y, m, d] = t.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function keTeks(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function geserHari(t: string, n: number) {
  const d = keDate(t);
  d.setUTCDate(d.getUTCDate() + n);
  return keTeks(d);
}

export function isAkhirPekan(t: string) {
  const h = keDate(t).getUTCDay();
  return h === 0 || h === 6;
}

export function isHariKerja(t: string, kal: Kalender) {
  return !isAkhirPekan(t) && !kal.libur.has(t.slice(0, 10));
}

/**
 * Menambah (n > 0) atau mengurangi (n < 0) sejumlah hari kerja.
 * hitungHariDasar = false: hari dasar tidak dihitung, hari kerja berikutnya = hari ke-1.
 * hitungHariDasar = true : hari dasar (bila hari kerja) dihitung sebagai hari ke-1.
 */
export function tambahHariKerja(t: string, n: number, kal: Kalender, hitungHariDasar = false) {
  if (n === 0) return t.slice(0, 10);
  const arah = n > 0 ? 1 : -1;
  let sisa = Math.abs(n);
  let cur = t.slice(0, 10);
  if (hitungHariDasar && isHariKerja(cur, kal)) sisa -= 1;
  while (sisa > 0) {
    cur = geserHari(cur, arah);
    if (isHariKerja(cur, kal)) sisa -= 1;
  }
  return cur;
}

/** Jumlah hari kerja dari `dari` (tidak dihitung) sampai `sampai` (dihitung). Negatif bila mundur. */
export function selisihHariKerja(dari: string, sampai: string, kal: Kalender) {
  if (dari === sampai) return 0;
  const maju = dari < sampai;
  let cur = dari.slice(0, 10);
  let n = 0;
  while (cur !== sampai.slice(0, 10)) {
    cur = geserHari(cur, maju ? 1 : -1);
    if (isHariKerja(cur, kal)) n += 1;
  }
  return maju ? n : -n;
}

export function tambahHariKalender(t: string, n: number) {
  return geserHari(t, n);
}

/** Menambah n bulan; tanggal disesuaikan ke akhir bulan bila perlu (31 Jan + 1 bulan = 28/29 Feb). */
export function tambahBulan(t: string, n: number) {
  const d = keDate(t);
  const tgl = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const akhir = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(tgl, akhir));
  return keTeks(target);
}

export function hariIni() {
  // Tanggal hari ini menurut WIB (UTC+7)
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
