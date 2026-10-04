// Kriteria penerimaan 21: tidak ada angka hukum, nama jenis hukuman, atau kode
// peraturan yang ditulis sebagai konstanta di lib/hukdis.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFINISI_AWAL } from "@/supabase/seed/regulasi";

const folder = join(process.cwd(), "lib", "hukdis");
const berkas = readdirSync(folder).filter((f) => f.endsWith(".ts"));
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("lib/hukdis bebas konstanta hukum", () => {
  for (const f of berkas) {
    const isi = tanpaKomentar(readFileSync(join(folder, f), "utf8"));

    it(`${f}: tanpa angka selain 0 dan 1`, () => {
      const angka = [...isi.matchAll(/(?<![\w.$])\d+(?![\w])/g)].map((m) => m[0]).filter((n) => n !== "0" && n !== "1");
      expect(angka).toEqual([]);
    });

    it(`${f}: tanpa kode peraturan`, () => {
      for (const d of DEFINISI_AWAL) expect(isi).not.toContain(d.regulasi.kode);
      expect(isi).not.toMatch(/PP[_ ]?\d+|Pertor|PERTOR/);
    });

    it(`${f}: tanpa nama jenis hukuman`, () => {
      const nama = new Set(DEFINISI_AWAL.flatMap((d) => (d.jenis_hukuman ?? []).map((j) => j.nama.toLowerCase())));
      for (const n of nama) expect(isi.toLowerCase()).not.toContain(n);
      expect(isi.toLowerCase()).not.toMatch(/teguran|pemberhentian|tunjangan kinerja/);
    });
  }
});
