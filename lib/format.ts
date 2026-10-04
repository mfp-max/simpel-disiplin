// Format tanggal & angka berbahasa Indonesia.

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function bagian(t: string | Date | null | undefined) {
  if (!t) return null;
  if (t instanceof Date) {
    const w = new Date(t.getTime() + 7 * 3600 * 1000); // WIB
    return { y: w.getUTCFullYear(), m: w.getUTCMonth() + 1, d: w.getUTCDate() };
  }
  const [y, m, d] = String(t).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/** "4 Oktober 2026" */
export function tanggalPanjang(t: string | Date | null | undefined, kosong = "—") {
  const b = bagian(t);
  return b ? `${b.d} ${BULAN[b.m - 1]} ${b.y}` : kosong;
}

/** "4 Okt 2026" */
export function tanggalPendek(t: string | Date | null | undefined, kosong = "—") {
  const b = bagian(t);
  return b ? `${b.d} ${BULAN_PENDEK[b.m - 1]} ${b.y}` : kosong;
}

/** "04-10-2026" */
export function tanggalAngka(t: string | Date | null | undefined, kosong = "") {
  const b = bagian(t);
  return b ? `${String(b.d).padStart(2, "0")}-${String(b.m).padStart(2, "0")}-${b.y}` : kosong;
}

export function namaHari(t: string | null | undefined) {
  const b = bagian(t);
  if (!b) return "";
  return HARI[new Date(Date.UTC(b.y, b.m - 1, b.d)).getUTCDay()];
}

export function namaBulan(m: number) {
  return BULAN[m - 1] ?? "";
}

/** "4 Okt 2026, 14.05" */
export function waktuPendek(t: string | Date | null | undefined) {
  if (!t) return "—";
  const d = new Date(t);
  const w = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${w.getUTCDate()} ${BULAN_PENDEK[w.getUTCMonth()]} ${w.getUTCFullYear()}, ${String(w.getUTCHours()).padStart(2, "0")}.${String(w.getUTCMinutes()).padStart(2, "0")}`;
}

const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

/** Terbilang bilangan bulat: 2026 → "dua ribu dua puluh enam" */
export function terbilang(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n < 12) return SATUAN[n] || "nol";
  if (n < 20) return `${terbilang(n - 10)} belas`;
  if (n < 100) return `${terbilang(Math.floor(n / 10))} puluh${n % 10 ? " " + terbilang(n % 10) : ""}`;
  if (n < 200) return `seratus${n - 100 ? " " + terbilang(n - 100) : ""}`;
  if (n < 1000) return `${terbilang(Math.floor(n / 100))} ratus${n % 100 ? " " + terbilang(n % 100) : ""}`;
  if (n < 2000) return `seribu${n - 1000 ? " " + terbilang(n - 1000) : ""}`;
  if (n < 1_000_000) return `${terbilang(Math.floor(n / 1000))} ribu${n % 1000 ? " " + terbilang(n % 1000) : ""}`;
  if (n < 1_000_000_000) return `${terbilang(Math.floor(n / 1_000_000))} juta${n % 1_000_000 ? " " + terbilang(n % 1_000_000) : ""}`;
  return String(n);
}

/** "tanggal empat bulan Oktober tahun dua ribu dua puluh enam" */
export function tanggalTerbilang(t: string | null | undefined) {
  const b = bagian(t);
  if (!b) return "";
  return `tanggal ${terbilang(b.d)} bulan ${BULAN[b.m - 1]} tahun ${terbilang(b.y)}`;
}

/** "12 (dua belas) bulan" */
export function durasiBulan(n: number | null | undefined) {
  if (!n) return "";
  return `${n} (${terbilang(n)}) bulan`;
}

export function angka(n: number | null | undefined) {
  return new Intl.NumberFormat("id-ID").format(n ?? 0);
}

export function ukuranBerkas(b: number | null | undefined) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function labelKode(kode: string | null | undefined) {
  if (!kode) return "—";
  const s = kode.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
