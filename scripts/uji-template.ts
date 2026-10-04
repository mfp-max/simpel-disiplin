// Uji template Word hasil scripts/buat-template.ts.
//
// Jalankan: npx tsx scripts/uji-template.ts
//
// Untuk setiap templates-sumber/<kode>.docx:
//  1. dimuat dengan PizZip + docxtemplater ({ paragraphLoop, linebreaks });
//  2. semua tag didaftar dengan InspectModule dan dicocokkan ke
//     KATALOG_PLACEHOLDER (di dalam loop hanya field loop tersebut yang boleh);
//  3. dirender dengan data dummy lengkap, hasilnya ditulis ke
//     templates-sumber/_uji/<kode>.docx, lalu dipastikan tidak ada sisa "{" / "}".

import * as fs from "node:fs";
import * as path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { KATALOG_PLACEHOLDER, TEMPLATE_AWAL } from "../lib/dokumen/katalog";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const InspectModule = require("docxtemplater/js/inspect-module.js");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "templates-sumber");
const DIR_UJI = path.join(DIR, "_uji");

type Part = { type: string; value: string; module?: string; inverted?: boolean; subparsed?: Part[] };

const katalog = new Map(KATALOG_PLACEHOLDER.map((d) => [d.kode, d]));
const tagTeks = new Set(KATALOG_PLACEHOLDER.filter((d) => d.jenis !== "loop").map((d) => d.kode));
const tagLoop = new Set(KATALOG_PLACEHOLDER.filter((d) => d.jenis === "loop").map((d) => d.kode));

/** Data dummy untuk seluruh katalog: teks "[kode]", loop 3 baris. */
function dataDummy(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const d of KATALOG_PLACEHOLDER) {
    if (d.jenis === "loop") {
      data[d.kode] = [1, 2, 3].map((i) =>
        Object.fromEntries((d.field ?? []).map((f) => [f.kode, f.kode === "nomor" ? String(i) : `[${d.kode}.${f.kode} ${i}]`])),
      );
    } else data[d.kode] = `[${d.kode}]`;
  }
  // huruf menimbang yang realistis
  (data.menimbang as Record<string, string>[]).forEach((row, i) => (row.huruf = "abc"[i]));
  data.kronologi = "[kronologi baris 1]\n[kronologi baris 2]";
  return data;
}

/** Validasi struktur tag. Mengembalikan daftar galat; mengisi `ringkas` untuk laporan. */
function periksa(parts: Part[], izin: Set<string>, konteks: string, galat: string[], ringkas: Set<string>, loopAktif?: string) {
  for (const part of parts) {
    if (part.type !== "placeholder") continue;
    const nama = part.value;
    const label = loopAktif ? `${loopAktif}.${nama}` : nama;
    if (part.module === "loop") {
      if (!izin.has(nama)) {
        galat.push(`${konteks}: tag bagian {#${nama}} tidak ada di katalog/izin`);
        continue;
      }
      if (part.inverted) galat.push(`${konteks}: bagian terbalik {^${nama}} tidak dipakai`);
      if (!loopAktif && tagLoop.has(nama)) {
        ringkas.add(`#${nama}`);
        const field = new Set((katalog.get(nama)?.field ?? []).map((f) => f.kode));
        periksa(part.subparsed ?? [], field, `${konteks} > {#${nama}}`, galat, ringkas, nama);
      } else {
        // kondisional pada tag teks: isi bagian memakai cakupan yang sama
        ringkas.add(`?${label}`);
        periksa(part.subparsed ?? [], izin, `${konteks} > {#${nama}}`, galat, ringkas, loopAktif);
      }
    } else if (part.module) {
      galat.push(`${konteks}: modul tag tidak didukung (${part.module}) pada ${nama}`);
    } else {
      if (!izin.has(nama)) galat.push(`${konteks}: tag {${nama}} tidak diizinkan`);
      else if (!loopAktif && tagLoop.has(nama)) galat.push(`${konteks}: tag loop {${nama}} dipakai sebagai teks`);
      ringkas.add(label);
    }
  }
}

function teksDokumen(zip: PizZip): string {
  return Object.keys(zip.files)
    .filter((f) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f))
    .map((f) => zip.file(f)!.asText().replace(/<[^>]+>/g, ""))
    .join("\n");
}

function main() {
  fs.mkdirSync(DIR_UJI, { recursive: true });
  const izinAtas = new Set([...tagTeks, ...tagLoop]);
  let totalGalat = 0;

  for (const t of TEMPLATE_AWAL) {
    const berkas = path.join(DIR, `${t.kode}.docx`);
    const galat: string[] = [];
    const ringkas = new Set<string>();
    const kosongNilai: string[] = [];
    try {
      const zip = new PizZip(fs.readFileSync(berkas));
      const iModule = new InspectModule();
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        modules: [iModule],
        nullGetter: (part: { value: string }) => {
          kosongNilai.push(part.value);
          return "";
        },
      });
      periksa(iModule.getAllStructuredTags() as Part[], izinAtas, t.kode, galat, ringkas);

      doc.render(dataDummy());
      if (kosongNilai.length) galat.push(`nilai kosong saat render: ${[...new Set(kosongNilai)].join(", ")}`);

      const hasil = doc.getZip();
      const sisa = teksDokumen(hasil).match(/[{}]/g);
      if (sisa) galat.push(`masih ada ${sisa.length} kurung kurawal setelah render`);

      fs.writeFileSync(path.join(DIR_UJI, `${t.kode}.docx`), hasil.generate({ type: "nodebuffer", compression: "DEFLATE" }));
    } catch (e: unknown) {
      const err = e as { message?: string; properties?: { errors?: { properties?: { explanation?: string; id?: string } }[] } };
      const rinci = err.properties?.errors?.map((x) => `${x.properties?.id}: ${x.properties?.explanation}`) ?? [];
      galat.push(`${err.message}${rinci.length ? "\n    " + rinci.join("\n    ") : ""}`);
    }

    totalGalat += galat.length;
    console.log(`${galat.length ? "✗" : "✓"} ${t.kode}.docx`);
    console.log(`    tag: ${[...ringkas].join(", ")}`);
    galat.forEach((g) => console.log(`    GALAT ${g}`));
  }

  console.log(totalGalat ? `\n${totalGalat} galat.` : `\nSemua ${TEMPLATE_AWAL.length} template lolos uji.`);
  if (totalGalat) process.exit(1);
}

main();
