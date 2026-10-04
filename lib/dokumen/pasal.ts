// Merangkai rujukan pasal untuk dokumen (placeholder {pasal_dilanggar}).
//
// Masukan HANYA boleh berasal dari pelanggaran_entri.snapshot_pasal kasus yang
// bersangkutan. Karena setiap snapshot_pasal dijamin berasal dari peraturan
// kasus itu sendiri (lihat tambahPelanggaran di lib/kasus.ts), rangkaian ini
// secara struktural tidak mungkin mencampur penomoran dua peraturan — kesalahan
// "Pasal 3 huruf f … Peraturan Rektor 70/2026" (PRD §1) tidak dapat terjadi.

export type RujukanPasal = { pasal: string; ayat?: string | null; huruf?: string | null; angka?: string | null };

/** "a", "a dan b", "a, b, dan c" (gaya bahasa peraturan). */
export function daftarIndonesia(item: string[], penghubung = "dan"): string {
  const x = item.filter(Boolean);
  if (x.length <= 1) return x[0] ?? "";
  if (x.length === 2) return `${x[0]} ${penghubung} ${x[1]}`;
  return `${x.slice(0, -1).join(", ")}, ${penghubung} ${x[x.length - 1]}`;
}

function bersih(s: string | null | undefined) {
  return (s ?? "").toString().trim();
}

function bandingkan(a: string, b: string) {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, "id", { numeric: true });
}

/**
 * Merangkai daftar pasal:
 *  - [5 f, 6 j]            → "Pasal 5 huruf f dan Pasal 6 huruf j"
 *  - [3 a, 3 f, 4 c]       → "Pasal 3 huruf a dan huruf f, serta Pasal 4 huruf c"
 *  - [10 (1) e, 10 (2) c]  → "Pasal 10 ayat (1) huruf e dan ayat (2) huruf c"
 */
export function rangkaiPasal(pasal: RujukanPasal[]): string {
  // pasal → ayat → daftar rincian (huruf/angka)
  const grup = new Map<string, Map<string, Set<string>>>();
  const utuh = new Set<string>();
  for (const p of pasal) {
    const ps = bersih(p.pasal).replace(/^pasal\s+/i, "");
    if (!ps) continue;
    const ayat = bersih(p.ayat);
    const huruf = bersih(p.huruf);
    const angka = bersih(p.angka);
    if (!grup.has(ps)) grup.set(ps, new Map());
    if (!ayat && !huruf && !angka) {
      utuh.add(ps);
      continue;
    }
    const g = grup.get(ps)!;
    if (!g.has(ayat)) g.set(ayat, new Set());
    const rinci = [huruf && `huruf ${huruf}`, angka && `angka ${angka}`].filter(Boolean).join(" ");
    g.get(ayat)!.add(rinci);
  }

  let adaGanda = false;
  const teksGrup = [...grup.keys()].sort(bandingkan).map((ps) => {
    if (utuh.has(ps)) return `Pasal ${ps}`;
    const g = grup.get(ps)!;
    const bagianAyat = [...g.keys()].sort(bandingkan).map((ayat) => {
      const rinci = [...g.get(ayat)!].filter(Boolean).sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
      if (rinci.length > 1) adaGanda = true;
      const r = daftarIndonesia(rinci);
      return [ayat && `ayat (${ayat})`, r].filter(Boolean).join(" ");
    });
    if (bagianAyat.length > 1) adaGanda = true;
    return `Pasal ${ps} ${daftarIndonesia(bagianAyat)}`.trim();
  });

  if (teksGrup.length <= 1) return teksGrup[0] ?? "";
  if (!adaGanda) return daftarIndonesia(teksGrup);
  // Ada pasal yang memuat beberapa rincian ("… dan huruf f"): pemisah antarpasal memakai "serta".
  return `${teksGrup.slice(0, -1).join(", ")}, serta ${teksGrup[teksGrup.length - 1]}`;
}
