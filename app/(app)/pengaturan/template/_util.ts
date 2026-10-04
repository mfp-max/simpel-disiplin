// Utilitas murni untuk layar admin template (tanpa akses data).

/** Jarak Levenshtein dua teks. */
export function jarakLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** "mungkin maksud Anda …": kode katalog terdekat untuk placeholder yang salah ketik. */
export function saranKode(kode: string, daftar: string[]): string | null {
  const k = kode.toLowerCase().trim();
  let terbaik: string | null = null;
  let jarak = Infinity;
  for (const d of daftar) {
    const j = jarakLevenshtein(k, d);
    if (j < jarak) {
      jarak = j;
      terbaik = d;
    }
  }
  const batas = Math.max(2, Math.floor(k.length / 4));
  return terbaik && jarak > 0 && jarak <= batas ? terbaik : null;
}

export const POLA_KODE = /^[a-z][a-z0-9_]{1,59}$/;
