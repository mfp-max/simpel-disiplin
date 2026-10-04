// Ekspor laporan (Excel & tampilan cetak) dan ekspor penuh satu tombol (PRD §10, §18.9).
//
// Setiap berkas hasil ekspor membawa penanda "RAHASIA" beserta identitas pengunduh
// dan waktu unduh (PerBKN 6/2022 Pasal 57; Pertor 70/2026 Pasal 36).
// Tanpa "server-only" agar bisa diuji dari skrip; hanya diimpor dari kode server.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { sql, type Sql } from "@/lib/db";
import { daftarBerkas, unduhBerkas } from "@/lib/penyimpanan";
import { tanggalPanjang, tanggalPendek, ukuranBerkas } from "@/lib/format";
import type { HasilLaporan, Kolom, Lembar } from "@/lib/laporan";
import type { StatusTenggat } from "@/components/simpel/lencana";

export type Pengunduh = { nama: string; email: string };

// ---------------------------------------------------------------------------
// Bantu
// ---------------------------------------------------------------------------

/** "4 Oktober 2026 pukul 14.05 WIB" */
export function waktuWib(d: Date = new Date()) {
  const w = new Date(d.getTime() + 7 * 3600 * 1000);
  const jam = `${String(w.getUTCHours()).padStart(2, "0")}.${String(w.getUTCMinutes()).padStart(2, "0")}`;
  return `${tanggalPanjang(w.toISOString().slice(0, 10))} pukul ${jam} WIB`;
}

/** "20261004-1405" (WIB) untuk nama berkas. */
export function capWaktu(d: Date = new Date()) {
  const w = new Date(d.getTime() + 7 * 3600 * 1000).toISOString();
  return `${w.slice(0, 10).replace(/-/g, "")}-${w.slice(11, 16).replace(":", "")}`;
}

export function barisIdentitas(p: Pengunduh, d: Date = new Date()) {
  return `RAHASIA — diunduh oleh ${p.nama} (${p.email}) pada ${waktuWib(d)}`;
}

/** Nilai sel sebagai teks (untuk cetak & lebar kolom). */
export function teksSel(k: Kolom, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (k.jenis) {
    case "tanggal": return tanggalPendek(String(v));
    case "ya_tidak": return v ? "Ya" : "Tidak";
    case "persen": return typeof v === "number" ? `${(v * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : "—";
    case "angka": return typeof v === "number" ? v.toLocaleString("id-ID") : String(v);
    case "tenggat": return (v as StatusTenggat).label ?? "—";
    default: return String(v);
  }
}

function nilaiExcel(k: Kolom, v: unknown): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  switch (k.jenis) {
    case "tanggal": {
      const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
      return y && m && d ? new Date(Date.UTC(y, m - 1, d)) : String(v);
    }
    case "angka": return typeof v === "number" ? v : Number(v);
    case "persen": return typeof v === "number" ? v : null;
    case "ya_tidak": return v ? "Ya" : "Tidak";
    case "tenggat": return (v as StatusTenggat).label ?? null;
    default: return String(v);
  }
}

function namaLembarAman(nama: string, terpakai: Set<string>) {
  let n = nama.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Lembar";
  let i = 2;
  while (terpakai.has(n.toLowerCase())) n = `${n.slice(0, 28)} ${i++}`;
  terpakai.add(n.toLowerCase());
  return n;
}

const hf = (s: string) => s.replace(/&/g, "&&");

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

export async function bukuExcel(judul: string, hasil: HasilLaporan, pengunduh: Pengunduh, waktu: Date = new Date()): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SIMPEL — Universitas Negeri Malang";
  wb.created = waktu;
  wb.title = judul;
  wb.subject = "RAHASIA";
  wb.keywords = "RAHASIA";
  const identitas = barisIdentitas(pengunduh, waktu);
  const terpakai = new Set<string>();
  const lembarDiekspor: Lembar[] = hasil.lembar.length
    ? hasil.lembar
    : [{ nama: "Data", judul, kolom: [{ kunci: "x", judul: "Keterangan" }], baris: [] }];

  for (const l of lembarDiekspor) {
    const n = Math.max(l.kolom.length, 1);
    const ws = wb.addWorksheet(namaLembarAman(l.nama, terpakai), {
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.7, bottom: 0.6, header: 0.3, footer: 0.3 } },
      headerFooter: {
        oddHeader: `&C&"Arial,Bold"&12&KB91C1CRAHASIA`,
        oddFooter: `&L&8${hf(identitas)}&R&8Halaman &P dari &N`,
        evenHeader: `&C&"Arial,Bold"&12&KB91C1CRAHASIA`,
        evenFooter: `&L&8${hf(identitas)}&R&8Halaman &P dari &N`,
      },
    });

    // Baris 1: banner RAHASIA + identitas pengunduh (pengganti tanda air)
    const b1 = ws.addRow([identitas]);
    ws.mergeCells(1, 1, 1, n);
    b1.height = 24;
    b1.getCell(1).font = { bold: true, color: { argb: "FFB91C1C" }, size: 11 };
    b1.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDECEC" } };
    b1.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    // Baris 2: judul
    const b2 = ws.addRow([`${judul} — ${l.judul}`]);
    ws.mergeCells(2, 1, 2, n);
    b2.getCell(1).font = { bold: true, size: 14 };
    // Baris 3: filter
    const b3 = ws.addRow([hasil.keteranganFilter.join(" · ")]);
    ws.mergeCells(3, 1, 3, n);
    b3.getCell(1).font = { italic: true, size: 10, color: { argb: "FF555555" } };
    let barisJudul = 5;
    if (l.catatan) {
      const b4 = ws.addRow([l.catatan]);
      ws.mergeCells(4, 1, 4, n);
      b4.getCell(1).font = { size: 9, color: { argb: "FF555555" } };
      b4.getCell(1).alignment = { wrapText: true, vertical: "top" };
      b4.height = 30;
    } else {
      ws.addRow([]);
    }

    const kepala = ws.addRow(l.kolom.map((k) => k.judul));
    barisJudul = kepala.number;
    kepala.height = 30;
    kepala.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FF1F2A44" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6EAF2" } };
      c.alignment = { vertical: "middle", wrapText: true };
      c.border = { bottom: { style: "thin", color: { argb: "FF8896B3" } } };
    });

    for (const r of l.baris) {
      const row = ws.addRow(l.kolom.map((k) => nilaiExcel(k, r[k.kunci])));
      l.kolom.forEach((k, i) => {
        const c = row.getCell(i + 1);
        if (k.jenis === "tanggal") c.numFmt = "dd/mm/yyyy";
        if (k.jenis === "persen") c.numFmt = "0.0%";
        if (k.jenis === "angka") c.numFmt = "#,##0";
        c.alignment = { vertical: "top", wrapText: k.jenis === "panjang" };
      });
      if (r.label === "Jumlah") row.font = { bold: true };
    }
    if (!l.baris.length) {
      const row = ws.addRow(["Tidak ada data untuk filter ini."]);
      row.getCell(1).font = { italic: true, color: { argb: "FF777777" } };
    }

    // Lebar kolom otomatis
    l.kolom.forEach((k, i) => {
      const panjang = Math.max(k.judul.length * 0.9, ...l.baris.map((r) => teksSel(k, r[k.kunci]).length));
      const batas = k.jenis === "panjang" ? 50 : 40;
      ws.getColumn(i + 1).width = Math.min(Math.max(Math.ceil(panjang) + 2, 9), batas);
    });

    ws.views = [{ state: "frozen", ySplit: barisJudul, xSplit: 0, topLeftCell: `A${barisJudul + 1}`, activeCell: `A${barisJudul + 1}` }];
    if (l.baris.length) ws.autoFilter = { from: { row: barisJudul, column: 1 }, to: { row: barisJudul, column: n } };
    ws.pageSetup.printTitlesRow = `${barisJudul}:${barisJudul}`;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Tampilan cetak (PDF lewat dialog cetak peramban — tanpa mesin PDF di server)
// ---------------------------------------------------------------------------

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function htmlCetak(judul: string, hasil: HasilLaporan, pengunduh: Pengunduh, opsi: { instansi?: string; waktu?: Date } = {}) {
  const waktu = opsi.waktu ?? new Date();
  const identitas = barisIdentitas(pengunduh, waktu);
  const ringkasan = hasil.ringkasan.length
    ? `<dl class="ringkas">${hasil.ringkasan.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.nilai)}</dd></div>`).join("")}</dl>`
    : "";
  const tabel = hasil.lembar
    .map((l) => {
      const kanan = (k: Kolom) => (k.jenis === "angka" || k.jenis === "persen" ? ' class="kanan"' : "");
      const isi = l.baris.length
        ? l.baris.map((r) => `<tr${r.label === "Jumlah" ? ' class="jumlah"' : ""}>${l.kolom.map((k) => `<td${kanan(k)}>${esc(teksSel(k, r[k.kunci]))}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${l.kolom.length}" class="kosong">Tidak ada data untuk filter ini.</td></tr>`;
      return `<section>
        <h2>${esc(l.judul)}</h2>
        ${l.catatan ? `<p class="catatan">${esc(l.catatan)}</p>` : ""}
        <table><thead><tr>${l.kolom.map((k) => `<th${kanan(k)}>${esc(k.judul)}</th>`).join("")}</tr></thead><tbody>${isi}</tbody></table>
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(judul)} — RAHASIA</title>
<style>
  @page { size: A4 landscape; margin: 14mm 10mm 14mm 10mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif; color: #111827; font-size: 10.5pt; line-height: 1.35; background: #fff; }
  .alat { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 12px 16px; background: #1f2a5a; color: #fff; font-size: 15px; }
  .alat button { min-height: 44px; padding: 0 18px; border: 0; border-radius: 8px; background: #fff; color: #1f2a5a; font-weight: 700; font-size: 15px; cursor: pointer; }
  main { position: relative; z-index: 1; padding: 16px; max-width: 1400px; margin: 0 auto; }
  .tanda-air { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
  .tanda-air span { transform: rotate(-30deg); font-size: 150px; font-weight: 800; letter-spacing: 0.15em; color: rgba(185, 28, 28, 0.07); white-space: nowrap; }
  .identitas { margin: 0 0 10px; padding: 6px 10px; border: 1.5px solid #b91c1c; border-radius: 6px; color: #b91c1c; font-weight: 700; font-size: 9.5pt; }
  .kop { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; border-bottom: 2px solid #1f2a5a; padding-bottom: 6px; margin-bottom: 10px; }
  .kop h1 { margin: 0; font-size: 15pt; }
  .kop p { margin: 2px 0 0; color: #4b5563; font-size: 9.5pt; }
  .rahasia { font-weight: 800; color: #b91c1c; letter-spacing: 0.12em; font-size: 12pt; }
  .filter { margin: 0 0 10px; color: #374151; font-size: 9.5pt; }
  .ringkas { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
  .ringkas div { border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 10px; }
  .ringkas dt { font-size: 8.5pt; color: #6b7280; }
  .ringkas dd { margin: 0; font-weight: 700; font-size: 11pt; }
  section { margin-bottom: 16px; }
  h2 { font-size: 11.5pt; margin: 10px 0 4px; }
  .catatan { margin: 0 0 6px; color: #4b5563; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; background: transparent; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th, td { border: 1px solid #c7ccd6; padding: 3px 5px; text-align: left; vertical-align: top; }
  th { background: #e6eaf2; font-weight: 700; }
  td.kanan, th.kanan { text-align: right; }
  tr.jumlah td { font-weight: 700; background: #f3f4f6; }
  td.kosong { text-align: center; color: #6b7280; font-style: italic; padding: 12px; }
  .kaki { margin-top: 12px; font-size: 8.5pt; color: #6b7280; }
  @media screen and (max-width: 700px) { .tanda-air span { font-size: 70px; } main { padding: 12px; } table { font-size: 12px; } .tabel-gulir { overflow-x: auto; } }
  .cap-halaman { display: none; }
  @media print {
    .alat { display: none; }
    main { padding: 0 0 8mm; max-width: none; }
    .cap-halaman { display: block; position: fixed; left: 0; right: 0; bottom: 0; font-size: 7.5pt; color: #b91c1c; text-align: center; background: #fff; }
  }
</style>
</head>
<body>
<div class="alat"><span>Pratinjau cetak — pilih “Simpan sebagai PDF” pada dialog cetak untuk menghasilkan PDF.</span><button type="button" onclick="window.print()">Cetak / Simpan PDF</button></div>
<div class="tanda-air" aria-hidden="true"><span>RAHASIA</span></div>
<div class="cap-halaman" aria-hidden="true">${esc(identitas)}</div>
<main>
  <p class="identitas">${esc(identitas)}</p>
  <div class="kop">
    <div>
      <h1>${esc(judul)}</h1>
      <p>${esc(opsi.instansi ?? "Universitas Negeri Malang")} · SIMPEL — Sistem Informasi Manajemen Pelanggaran</p>
    </div>
    <div class="rahasia">RAHASIA</div>
  </div>
  <p class="filter">${esc(hasil.keteranganFilter.join(" · "))}</p>
  ${ringkasan}
  ${tabel}
  <p class="kaki">Dokumen ini bersifat rahasia (PerBKN 6/2022 Pasal 57; Peraturan Rektor UM 70/2026 Pasal 36). Dilarang menggandakan atau menyebarluaskan tanpa izin. ${esc(identitas)}.</p>
</main>
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Ekspor penuh satu tombol (§18.9, kriteria penerimaan 20)
// ---------------------------------------------------------------------------

export const PREFIX_EKSPOR = "ekspor";
const PREFIX_BERKAS = ["entri", "template"];
/** Batas ukuran mentah per bagian ZIP — bucket membatasi 50 MB per berkas. */
const BATAS_BAGIAN = 40 * 1024 * 1024;
const PARALEL_UNDUH = 4;

export type ProgresEkspor = { tahap: "data" | "berkas" | "kemas" | "simpan" | "selesai"; pesan: string; persen: number };

export type BagianEkspor = { nama: string; ukuran: number; jumlahBerkas: number };

export type HasilEksporPenuh = {
  stempel: string;
  bagian: BagianEkspor[];
  jumlahTabel: number;
  jumlahBaris: number;
  jumlahBerkas: number;
  berkasGagal: string[];
};

type InfoTabel = { nama: string; baris: number; kolom: { nama: string; tipe: string; boleh_null: boolean }[] };

async function daftarTabel(db: Sql) {
  const rows = await db`
    select c.table_name, c.column_name, c.data_type, c.is_nullable
    from information_schema.columns c
    join information_schema.tables t on t.table_name = c.table_name and t.table_schema = c.table_schema
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by c.table_name, c.ordinal_position`;
  const m = new Map<string, { nama: string; tipe: string; boleh_null: boolean }[]>();
  for (const r of rows) {
    const k = m.get(r.table_name) ?? [];
    k.push({ nama: r.column_name, tipe: r.data_type, boleh_null: r.is_nullable === "YES" });
    m.set(r.table_name, k);
  }
  return m;
}

/** Menyusuri prefix penyimpanan secara rekursif. */
async function jelajahiPenyimpanan(prefix: string, hasil: Map<string, number | null>, daftar = daftarBerkas) {
  const isi = await daftar(prefix);
  for (const it of isi) {
    if (it.name === ".emptyFolderPlaceholder") continue;
    const path = `${prefix}/${it.name}`;
    if (it.id === null) await jelajahiPenyimpanan(path, hasil, daftar);
    else hasil.set(path, (it.metadata as { size?: number } | null)?.size ?? null);
  }
}

function bacaSkemaSql() {
  try {
    const folder = join(process.cwd(), "supabase", "migrations");
    const berkas = readdirSync(folder).filter((f) => f.endsWith(".sql")).sort();
    if (!berkas.length) return null;
    return berkas.map((f) => `-- =====================================================================\n-- ${f}\n-- =====================================================================\n${readFileSync(join(folder, f), "utf8")}`).join("\n\n");
  } catch {
    return null;
  }
}

function readme(o: { pengunduh: Pengunduh; waktu: Date; tabel: InfoTabel[]; bagian: { nama: string; berkas: string[] }[]; adaSkema: boolean }) {
  const totalBaris = o.tabel.reduce((s, t) => s + t.baris, 0);
  const jumlahBerkas = o.bagian.reduce((s, b) => s + b.berkas.length, 0);
  return `EKSPOR PENUH SIMPEL — SISTEM INFORMASI MANAJEMEN PELANGGARAN
Universitas Negeri Malang
==================================================================

RAHASIA. Arsip ini memuat data pribadi pegawai dan bahan pemeriksaan
hukuman disiplin yang bersifat rahasia (PerBKN 6/2022 Pasal 57;
Peraturan Rektor UM 70/2026 Pasal 36). Simpan di media terenkripsi,
jangan dikirim lewat surel/pesan biasa, dan musnahkan salinan yang
tidak diperlukan.

Dibuat oleh : ${o.pengunduh.nama} (${o.pengunduh.email})
Waktu       : ${waktuWib(o.waktu)}
Isi         : ${o.tabel.length} tabel, ${totalBaris.toLocaleString("id-ID")} baris data, ${jumlahBerkas.toLocaleString("id-ID")} berkas
Bagian ZIP  : ${o.bagian.length}
${o.bagian.map((b, i) => `  ${i + 1}. ${b.nama} — ${b.berkas.length} berkas${i === 0 ? " + seluruh data tabel" : ""}`).join("\n")}

Bila ada lebih dari satu bagian, ekstrak SEMUA bagian ke folder yang
sama. Setiap bagian adalah ZIP biasa yang bisa dibuka sendiri-sendiri.


1. STRUKTUR ARSIP
-----------------
  README.txt          berkas ini
  manifest.json       daftar tabel (jumlah baris, kolom & tipe) dan
                      daftar berkas per bagian ZIP
  skema.sql           ${o.adaSkema ? "definisi basis data (gabungan seluruh berkas migrasi)" : "TIDAK TERSEDIA di server saat ekspor; lihat manifest.json untuk kolom & tipe"}
  data/<tabel>.json   isi SATU tabel: larik (array) objek, satu objek per
                      baris, nama properti = nama kolom. SEMUA baris
                      disertakan, termasuk yang diarsipkan
                      (kolom diarsipkan_pada terisi).
  berkas/<lokasi>     seluruh berkas unggahan & template, dengan lokasi
                      yang sama persis seperti di penyimpanan SIMPEL.
  berkas-gagal.txt    (hanya bila ada) berkas yang gagal diunduh.


2. MENGHUBUNGKAN DATA DENGAN BERKAS
-----------------------------------
  Kolom file_path pada tabel berkas, dokumen, dan template_versi (serta
  rekaman_path / persetujuan_rekam_file pada sesi_pemeriksaan) menunjuk
  ke lokasi berkas. Berkasnya ada di:  berkas/<file_path>
  Contoh: file_path "entri/1a2b.../berkas/surat.pdf"
          → berkas/entri/1a2b.../berkas/surat.pdf


3. HUBUNGAN ANTARTABEL (yang terpenting)
----------------------------------------
  entri               satu baris per informasi / kasus hukdis /
                      pembinaan / arsip lampau (kolom kelas).
  tahapan_kasus       tahapan sebuah kasus      (entri_id → entri.id)
  pelanggaran_entri   pasal yang dilanggar      (entri_id → entri.id)
  hukuman             SK hukuman disiplin       (entri_id → entri.id)
  berkas, dokumen     lampiran & surat terbit   (entri_id → entri.id)
  pegawai             master pegawai            (entri.pegawai_id)
  regulasi, tingkat_hukuman, jenis_hukuman, pasal_regulasi,
  ambang_kehadiran, aturan_*   katalog aturan per peraturan (regulasi_id)
  audit_log           jejak seluruh aktivitas pengguna

  Kolom berawalan snapshot_ (snapshot_pegawai, snapshot_regulasi,
  snapshot_pasal, snapshot_jenis_hukuman, snapshot_data) adalah salinan
  beku pada saat kejadian. Untuk keperluan hukum, gunakan nilai snapshot,
  bukan nilai katalog terkini.


4. FORMAT NILAI
---------------
  - Tanggal (date)        : teks "YYYY-MM-DD", mis. "2026-10-04".
  - Waktu (timestamptz)   : teks ISO 8601 dalam UTC, mis.
                            "2026-10-04T07:05:00.000Z" (= 14.05 WIB).
  - Kosong                : null.
  - Kolom jsonb           : objek/larik JSON bersarang.
  - Pengodean teks        : UTF-8.


5. MEMBUKA TANPA APLIKASI SIMPEL
--------------------------------
  a. Penyunting teks (Notepad, VS Code, dll.): buka data/<tabel>.json.
  b. Microsoft Excel (365/2016+):
       Data → Get Data → From File → From JSON → pilih data/<tabel>.json
       → "To Table" → klik ikon panah di judul kolom → Load.
  c. LibreOffice Calc belum dapat membuka JSON secara langsung. Buka
     berkas JSON di peramban Firefox (penampil JSON bawaan), atau ubah
     ke Excel/CSV dengan perintah Python di bawah.
  d. Python (pandas):
       import pandas as pd
       df = pd.read_json("data/entri.json")
       df.to_excel("entri.xlsx", index=False)
  e. Memulihkan ke PostgreSQL: jalankan skema.sql pada basis data
     kosong, lalu impor tiap data/<tabel>.json (mis. dengan
     json_populate_recordset). Urutan aman: tabel katalog & master
     lebih dulu, lalu entri, lalu tabel turunannya.


6. DAFTAR TABEL
---------------
${o.tabel.map((t) => `  ${t.nama.padEnd(30)} ${String(t.baris).padStart(8)} baris`).join("\n")}
`;
}

/**
 * Menyusun arsip ekspor penuh. Hasil setiap bagian ZIP diserahkan ke `simpan`
 * (rute mengunggahnya ke penyimpanan; skrip uji hanya menghitung ukurannya).
 */
export async function buatEksporPenuh(opsi: {
  pengunduh: Pengunduh;
  simpan: (namaBerkas: string, isi: Buffer) => Promise<void>;
  progres?: (p: ProgresEkspor) => void;
  db?: Sql;
  waktu?: Date;
}): Promise<HasilEksporPenuh> {
  const db = opsi.db ?? sql;
  const waktu = opsi.waktu ?? new Date();
  const stempel = capWaktu(waktu);
  const lapor = (p: ProgresEkspor) => opsi.progres?.(p);

  // 1. Data tabel
  lapor({ tahap: "data", pesan: "Membaca daftar tabel…", persen: 2 });
  const skema = await daftarTabel(db);
  const tabel: InfoTabel[] = [];
  const isiData = new Map<string, string>();
  let ukuranData = 0;
  let i = 0;
  for (const [nama, kolom] of skema) {
    i += 1;
    // Kolom tsvector hanyalah indeks pencarian turunan — tidak perlu diekspor.
    const ambil = kolom.filter((k) => k.tipe !== "tsvector").map((k) => k.nama);
    const rows = await db`select ${db(ambil)} from ${db(nama)}`;
    const json = JSON.stringify(rows, null, 1);
    isiData.set(nama, json);
    ukuranData += json.length;
    tabel.push({ nama, baris: rows.length, kolom: kolom.filter((k) => k.tipe !== "tsvector").map((k) => ({ nama: k.nama, tipe: k.tipe, boleh_null: k.boleh_null })) });
    lapor({ tahap: "data", pesan: `Tabel ${nama} (${rows.length.toLocaleString("id-ID")} baris)`, persen: 2 + Math.round((i / skema.size) * 18) });
  }

  // 2. Daftar berkas: susuri penyimpanan + lokasi yang tercatat di basis data
  lapor({ tahap: "berkas", pesan: "Mendaftar berkas di penyimpanan…", persen: 21 });
  const berkas = new Map<string, number | null>();
  for (const p of PREFIX_BERKAS) {
    try {
      await jelajahiPenyimpanan(p, berkas);
    } catch {
      // prefix belum ada — abaikan
    }
  }
  const tercatat = await db`
    select file_path as p, ukuran::bigint as u from berkas where file_path is not null
    union all select file_path, null from dokumen where file_path is not null
    union all select file_path, ukuran::bigint from template_versi where file_path is not null
    union all select rekaman_path, null from sesi_pemeriksaan where rekaman_path is not null
    union all select persetujuan_rekam_file, null from sesi_pemeriksaan where persetujuan_rekam_file is not null`;
  for (const r of tercatat) {
    const p = String(r.p).replace(/^\/+/, "");
    if (p.startsWith(`${PREFIX_EKSPOR}/`)) continue;
    if (!berkas.has(p)) berkas.set(p, r.u === null ? null : Number(r.u));
  }

  // 3. Rencana bagian ZIP (bagian pertama memuat seluruh data)
  const urut = [...berkas.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const rencana: { berkas: string[]; ukuran: number }[] = [{ berkas: [], ukuran: Math.round(ukuranData / 6) }];
  for (const [p, u] of urut) {
    const ukuran = u ?? 1024 * 1024;
    let akhir = rencana[rencana.length - 1];
    if (akhir.ukuran + ukuran > BATAS_BAGIAN && (akhir.berkas.length || rencana.length > 1)) {
      akhir = { berkas: [], ukuran: 0 };
      rencana.push(akhir);
    }
    akhir.berkas.push(p);
    akhir.ukuran += ukuran;
  }
  const jumlahBagian = rencana.length;
  const namaBagian = (n: number) =>
    jumlahBagian === 1 ? `${stempel}-simpel-ekspor-penuh.zip` : `${stempel}-simpel-ekspor-penuh-bagian-${n}-dari-${jumlahBagian}.zip`;

  const skemaSql = bacaSkemaSql();
  const manifest = {
    aplikasi: "SIMPEL — Sistem Informasi Manajemen Pelanggaran, Universitas Negeri Malang",
    sifat: "RAHASIA",
    dibuat_pada: waktu.toISOString(),
    dibuat_oleh: opsi.pengunduh,
    tabel,
    bagian: rencana.map((r, n) => ({ nama: namaBagian(n + 1), berkas: r.berkas.map((p) => `berkas/${p}`) })),
  };

  // 4. Kemas & simpan setiap bagian
  const hasil: BagianEkspor[] = [];
  const gagal: string[] = [];
  let selesaiBerkas = 0;
  for (const [n, r] of rencana.entries()) {
    const zip = new JSZip();
    if (n === 0) {
      zip.file("README.txt", readme({ pengunduh: opsi.pengunduh, waktu, tabel, bagian: manifest.bagian, adaSkema: !!skemaSql }));
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));
      zip.file("skema.sql", skemaSql ?? "-- Berkas migrasi tidak tersedia di server saat ekspor dibuat.\n-- Lihat manifest.json (bagian \"tabel\") untuk daftar kolom dan tipenya.\n");
      for (const [nama, json] of isiData) zip.file(`data/${nama}.json`, json);
      isiData.clear();
    } else {
      zip.file("BACA-SAYA.txt", `Bagian ${n + 1} dari ${jumlahBagian} ekspor penuh SIMPEL (${waktuWib(waktu)}).\nRAHASIA. Ekstrak ke folder yang sama dengan bagian 1; petunjuk lengkap ada di README.txt pada bagian 1.\n`);
    }
    // Unduh berkas dengan paralel terbatas
    let idx = 0;
    const pekerja = Array.from({ length: PARALEL_UNDUH }, async () => {
      while (idx < r.berkas.length) {
        const p = r.berkas[idx++];
        try {
          zip.file(`berkas/${p}`, await unduhBerkas(p));
        } catch {
          gagal.push(p);
        }
        selesaiBerkas += 1;
        lapor({ tahap: "berkas", pesan: `Mengunduh berkas ${selesaiBerkas} dari ${urut.length}`, persen: 22 + Math.round((selesaiBerkas / Math.max(urut.length, 1)) * 58) });
      }
    });
    await Promise.all(pekerja);
    if (n === jumlahBagian - 1 && gagal.length) {
      zip.file("berkas-gagal.txt", `Berkas berikut tercatat tetapi gagal diunduh saat ekspor (mungkin sudah dihapus dari penyimpanan):\n\n${gagal.join("\n")}\n`);
    }
    lapor({ tahap: "kemas", pesan: jumlahBagian > 1 ? `Mengemas ZIP bagian ${n + 1} dari ${jumlahBagian}…` : "Mengemas ZIP…", persen: 82 + Math.round((n / jumlahBagian) * 8) });
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    lapor({ tahap: "simpan", pesan: jumlahBagian > 1 ? `Menyimpan bagian ${n + 1} (${ukuranBerkas(buf.length)})…` : `Menyimpan arsip (${ukuranBerkas(buf.length)})…`, persen: 90 + Math.round(((n + 1) / jumlahBagian) * 8) });
    await opsi.simpan(namaBagian(n + 1), buf);
    hasil.push({ nama: namaBagian(n + 1), ukuran: buf.length, jumlahBerkas: r.berkas.length });
  }

  lapor({ tahap: "selesai", pesan: "Ekspor penuh selesai.", persen: 100 });
  return {
    stempel,
    bagian: hasil,
    jumlahTabel: tabel.length,
    jumlahBaris: tabel.reduce((s, t) => s + t.baris, 0),
    jumlahBerkas: urut.length - gagal.length,
    berkasGagal: gagal,
  };
}

export type EksporLama = { nama: string; ukuran: number | null; dibuat: string | null };

/** Arsip ekspor penuh sebelumnya (terbaru dulu). */
export async function daftarEksporLama(): Promise<EksporLama[]> {
  try {
    const isi = await daftarBerkas(PREFIX_EKSPOR);
    return isi
      .filter((x) => x.id !== null && x.name.endsWith(".zip"))
      .map((x) => ({ nama: x.name, ukuran: (x.metadata as { size?: number } | null)?.size ?? null, dibuat: x.created_at ?? null }))
      .sort((a, b) => b.nama.localeCompare(a.nama));
  } catch {
    return [];
  }
}

export const POLA_NAMA_EKSPOR = /^\d{8}-\d{4}-simpel-ekspor-penuh(-bagian-\d+-dari-\d+)?\.zip$/;
