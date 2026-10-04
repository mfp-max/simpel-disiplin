// Pembuat template Word (.docx) awal SIMPEL.
//
// Jalankan: npx tsx scripts/buat-template.ts
// Keluaran: templates-sumber/<kode>.docx untuk setiap entri TEMPLATE_AWAL.
//
// Template diisi kemudian oleh docxtemplater (delimiter { }), jadi berkas ini
// hanya berisi kerangka naskah + placeholder dari KATALOG_PLACEHOLDER.
//
// ATURAN INTI: jangan pernah menulis nama peraturan, nomor pasal, jenis
// hukuman, jumlah hari, atau tenggat waktu secara tetap di naskah. Semua itu
// berbeda antarperaturan dan WAJIB berasal dari placeholder ({nama_regulasi},
// {pasal_dilanggar}, {jenis_hukuman}, {tingkat_hukuman}, {durasi_hukuman},
// loop {#mengingat}, dst.).
//
// Aturan teknis docxtemplater: setiap placeholder ditulis utuh di dalam satu
// TextRun; loop baris tabel dibuka di sel pertama dan ditutup di sel terakhir
// pada baris yang sama; loop paragraf memakai paragraf tersendiri untuk tag
// pembuka dan penutup.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeightRule,
  ImageRun,
  LeaderType,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlignTable,
  WidthType,
} from "docx";
import { TEMPLATE_AWAL } from "../lib/dokumen/katalog";

const ROOT = path.resolve(__dirname, "..");
const DIR_KELUAR = path.join(ROOT, "templates-sumber");
const LOGO = fs.readFileSync(path.join(ROOT, "public", "logo-um.png"));

// ---------------------------------------------------------------------------
// Ukuran halaman (twip; 1 cm = 567 twip)
// ---------------------------------------------------------------------------
const CM = 567;
const A4_LEBAR = 11906;
const A4_TINGGI = 16838;
const MARGIN = { top: 2 * CM, bottom: 2 * CM, left: Math.round(2.5 * CM), right: 2 * CM };
const LEBAR_POTRET = A4_LEBAR - MARGIN.left - MARGIN.right; // 9355
const LEBAR_LANSKAP = A4_TINGGI - MARGIN.left - MARGIN.right;

/** Lebar area tulis dokumen yang sedang dibangun. */
let W = LEBAR_POTRET;

const FONT = "Bookman Old Style";
const INDEN = 567; // 1 cm

// ---------------------------------------------------------------------------
// Teks
// ---------------------------------------------------------------------------
type GayaRun = {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  size?: number; // pt
  caps?: boolean;
  color?: string;
  font?: string;
};

/** Satu TextRun. Karakter "\t" diubah menjadi tab Word (placeholder tidak pernah mengandung tab). */
function r(teks: string, g: GayaRun = {}): TextRun {
  const bagian = teks.split("\t");
  const children: (string | Tab)[] = [];
  bagian.forEach((b, i) => {
    if (i > 0) children.push(new Tab());
    if (b) children.push(b);
  });
  return new TextRun({
    children,
    bold: g.bold,
    italics: g.italics,
    underline: g.underline ? {} : undefined,
    size: g.size ? g.size * 2 : undefined,
    allCaps: g.caps,
    color: g.color,
    font: g.font,
  });
}

type Isi = string | TextRun | (string | TextRun)[];

type GayaPar = GayaRun & {
  align?: "left" | "center" | "right" | "justify";
  before?: number;
  after?: number;
  left?: number;
  hanging?: number;
  firstLine?: number;
  keepNext?: boolean;
  pageBreakBefore?: boolean;
  tabs?: { pos: number; type?: "left" | "right" | "center"; dot?: boolean }[];
  garisBawah?: boolean;
};

const ALIGN = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
} as const;

function keRun(isi: Isi, g: GayaRun): TextRun[] {
  const daftar = Array.isArray(isi) ? isi : [isi];
  return daftar.map((x) => (typeof x === "string" ? r(x, g) : x));
}

/** Paragraf. Bawaan: rata kiri-kanan, spasi sesudah 0. */
function p(isi: Isi = "", g: GayaPar = {}): Paragraph {
  return new Paragraph({
    children: isi === "" ? [] : keRun(isi, g),
    alignment: ALIGN[g.align ?? "justify"],
    spacing: { before: g.before ?? 0, after: g.after ?? 0 },
    indent:
      g.left || g.hanging || g.firstLine
        ? { left: g.left, hanging: g.hanging, firstLine: g.firstLine }
        : undefined,
    keepNext: g.keepNext,
    keepLines: g.keepNext,
    pageBreakBefore: g.pageBreakBefore,
    tabStops: g.tabs?.map((t) => ({
      type: t.type === "right" ? TabStopType.RIGHT : t.type === "center" ? TabStopType.CENTER : TabStopType.LEFT,
      position: t.pos,
      leader: t.dot ? LeaderType.DOT : undefined,
    })),
    border: g.garisBawah
      ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 } }
      : undefined,
  });
}

const kosong = (n = 1): Paragraph[] => Array.from({ length: n }, () => p(""));

/** Judul tengah tebal. */
const judul = (teks: Isi, g: GayaPar = {}) => p(teks, { bold: true, align: "center", ...g });

/** Butir bernomor dengan inden gantung: "1.<tab>teks". */
function butir(no: string, teks: Isi, g: GayaPar = {}): Paragraph {
  const left = (g.left ?? 0) + INDEN;
  const runs = keRun(teks, g);
  return new Paragraph({
    children: [r(`${no}\t`, g), ...runs],
    alignment: ALIGN[g.align ?? "justify"],
    spacing: { before: g.before ?? 0, after: g.after ?? 60 },
    indent: { left, hanging: INDEN },
    tabStops: [{ type: TabStopType.LEFT, position: left }],
    keepNext: g.keepNext,
  });
}

/** Paragraf isi yang menjorok sejajar teks butir. */
const lanjut = (teks: Isi, g: GayaPar = {}) => p(teks, { left: (g.left ?? 0) + INDEN, after: 60, ...g });

/** Baris titik-titik selebar `lebar` (untuk isian tulisan tangan). */
const titik = (lebar: number, g: GayaPar = {}) =>
  p("\t", { ...g, align: "left", tabs: [{ pos: lebar, type: "right", dot: true }] });

// ---------------------------------------------------------------------------
// Tabel
// ---------------------------------------------------------------------------
const NOB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const GARIS = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const BORDER_NONE = { top: NOB, bottom: NOB, left: NOB, right: NOB, insideHorizontal: NOB, insideVertical: NOB };
const BORDER_TIPIS = { top: GARIS, bottom: GARIS, left: GARIS, right: GARIS, insideHorizontal: GARIS, insideVertical: GARIS };

type IsiSel = Isi | (Paragraph | Table)[];

function sel(
  isi: IsiSel,
  lebar: number,
  o: { span?: number; shade?: string; tengah?: boolean; align?: GayaPar["align"]; bold?: boolean; size?: number } = {},
): TableCell {
  const isElemen = Array.isArray(isi) && isi.length > 0 && (isi[0] instanceof Paragraph || isi[0] instanceof Table);
  const children = isElemen
    ? (isi as (Paragraph | Table)[])
    : [p(isi as Isi, { align: o.align ?? "left", bold: o.bold, size: o.size })];
  return new TableCell({
    children,
    width: { size: lebar, type: WidthType.DXA },
    columnSpan: o.span,
    verticalAlign: o.tengah ? VerticalAlignTable.CENTER : VerticalAlignTable.TOP,
    shading: o.shade ? { fill: o.shade, type: ShadingType.CLEAR, color: "auto" } : undefined,
  });
}

function tabel(
  lebarKolom: number[],
  rows: TableRow[],
  o: { garis?: boolean; inden?: number; rapat?: boolean } = {},
): Table {
  const total = lebarKolom.reduce((a, b) => a + b, 0);
  return new Table({
    rows,
    width: { size: total, type: WidthType.DXA },
    columnWidths: lebarKolom,
    layout: TableLayoutType.FIXED,
    borders: o.garis ? BORDER_TIPIS : BORDER_NONE,
    indent: o.inden ? { size: o.inden, type: WidthType.DXA } : undefined,
    margins: o.garis
      ? { top: 40, bottom: 40, left: 85, right: 85 }
      : { top: 0, bottom: o.rapat ? 0 : 20, left: 57, right: 57 },
  });
}

const baris = (cells: TableCell[], o: { header?: boolean; tinggi?: number } = {}) =>
  new TableRow({
    children: cells,
    tableHeader: o.header,
    cantSplit: true,
    height: o.tinggi ? { value: o.tinggi, rule: HeightRule.ATLEAST } : undefined,
  });

/** Penanda isian titik-titik pada tabel label. */
const TITIK = "__TITIK__";

/**
 * Tabel label tanpa garis: "Nama  :  {nama_terperiksa}".
 * `inden` menggeser seluruh tabel ke kanan (mis. sejajar teks butir).
 */
function tabelLabel(rows: [string, string][], o: { inden?: number; label?: number; lebar?: number } = {}): Table {
  const inden = o.inden ?? 0;
  const label = o.label ?? 3000;
  const titik2 = 300;
  const nilai = (o.lebar ?? W) - inden - label - titik2;
  return tabel(
    [label, titik2, nilai],
    rows.map(([l, v]) =>
      baris([
        sel(l, label),
        sel(":", titik2, { align: "center" }),
        sel(v === TITIK ? [titik(nilai - 120)] : v, nilai),
      ]),
    ),
    { inden },
  );
}

/** Tabel bergaris dengan baris judul berarsir. */
function tabelGaris(
  lebarKolom: number[],
  kepala: string[],
  isiBaris: IsiSel[][],
  o: { tengah?: boolean[]; tinggi?: number; size?: number } = {},
): Table {
  const kepalaRow = baris(
    kepala.map((k, i) => sel(k, lebarKolom[i], { shade: "D9D9D9", align: "center", bold: true, tengah: true, size: o.size })),
    { header: true },
  );
  const rows = isiBaris.map((cells) =>
    baris(
      cells.map((c, i) => sel(c, lebarKolom[i], { align: o.tengah?.[i] ? "center" : "left", size: o.size })),
      { tinggi: o.tinggi },
    ),
  );
  return tabel(lebarKolom, [kepalaRow, ...rows], { garis: true });
}

// ---------------------------------------------------------------------------
// Blok baku naskah dinas
// ---------------------------------------------------------------------------

/** Kop surat: logo UM + identitas instansi, diakhiri garis tebal. */
function kop(): (Paragraph | Table)[] {
  const logoW = 83; // ±2,2 cm pada 96 dpi
  const logoH = Math.round((logoW * 536) / 496);
  const sisi = 1650;
  const tengah = W - 2 * sisi;
  const logo = new ImageRun({
    type: "png",
    data: LOGO,
    transformation: { width: logoW, height: logoH },
    altText: { name: "logo-um", title: "Logo", description: "Logo Universitas Negeri Malang" },
  });
  const t = tabel(
    [sisi, tengah, sisi],
    [
      baris([
        sel([new Paragraph({ children: [logo], alignment: AlignmentType.LEFT })], sisi, { tengah: true }),
        sel(
          [
            p("{nama_kementerian}", { align: "center", bold: true, size: 12, caps: true }),
            p("{nama_instansi}", { align: "center", bold: true, size: 14, caps: true }),
            p("{alamat_instansi}", { align: "center", size: 10 }),
            p("{kontak_instansi}", { align: "center", size: 10 }),
          ],
          tengah,
          { tengah: true },
        ),
        sel("", sisi),
      ]),
    ],
    { rapat: true },
  );
  const garis = new Paragraph({
    children: [],
    spacing: { before: 60, after: 240 },
    border: { bottom: { style: BorderStyle.THICK_THIN_SMALL_GAP, size: 24, color: "000000", space: 1 } },
  });
  return [t, garis];
}

/** Nomor / Sifat / Lampiran / Hal. */
function kepalaSurat(hal = "{hal_surat}"): Table {
  return tabelLabel(
    [
      ["Nomor", "{nomor_surat}"],
      ["Sifat", "{sifat_surat}"],
      ["Lampiran", "{lampiran_surat}"],
      ["Hal", hal],
    ],
    { label: 1300 },
  );
}

const IDENTITAS: [string, string][] = [
  ["Nama", "{nama_terperiksa}"],
  ["NIP", "{nip_terperiksa}"],
  ["Pangkat/Gol. ruang", "{pangkat_golongan_terperiksa}"],
  ["Jabatan", "{jabatan_terperiksa}"],
  ["Unit Kerja", "{unit_kerja_terperiksa}"],
];

const IDENTITAS_LENGKAP: [string, string][] = [
  ["Nama", "{nama_terperiksa}"],
  ["NIP", "{nip_terperiksa}"],
  ["Tempat, tanggal lahir", "{tempat_lahir_terperiksa}, {tanggal_lahir_terperiksa}"],
  ["Pangkat/Gol. ruang", "{pangkat_golongan_terperiksa}"],
  ["Jabatan", "{jabatan_terperiksa}"],
  ["Unit Kerja", "{unit_kerja_terperiksa}"],
  ["Fakultas/Direktorat", "{fakultas_terperiksa}"],
  ["Status Kepegawaian", "{status_pegawai_terperiksa}"],
];

type Ttd = {
  /** "surat" = "{tempat_surat}, {tanggal_surat_panjang}"; "ditetapkan" = format Keputusan; "kosong" = baris kosong penyelaras. */
  tanggal?: "surat" | "ditetapkan" | "kosong" | string;
  jabatan: string[];
  nama: string;
  nip: string;
  /** Catatan kecil di ruang tanda tangan (mis. "Meterai"). */
  catatan?: string;
};

function blokTtd(o: Ttd, lebar: number): Paragraph[] {
  const g: GayaPar = { align: "left", keepNext: true };
  const out: Paragraph[] = [];
  if (o.tanggal === "surat") out.push(p("{tempat_surat}, {tanggal_surat_panjang}", g));
  else if (o.tanggal === "ditetapkan") {
    out.push(p("Ditetapkan di {tempat_surat}", g));
    out.push(p("pada tanggal {tanggal_surat_panjang}", { ...g, garisBawah: true, after: 120 }));
  } else if (o.tanggal === "kosong") out.push(p("", g));
  else if (o.tanggal) out.push(p(o.tanggal, g));
  o.jabatan.forEach((j) => out.push(p(j, g)));
  if (o.catatan) {
    out.push(p("", g));
    out.push(p(o.catatan, { ...g, italics: true, size: 9, color: "808080" }));
    out.push(p("", g));
    out.push(p("", g));
  } else out.push(...Array.from({ length: 4 }, () => p("", g)));
  if (o.nama === TITIK) out.push(titik(lebar - 400, g));
  else out.push(p(o.nama, { ...g, bold: true, underline: true }));
  if (o.nip === TITIK) out.push(p([r("NIP "), r("\t")], { ...g, keepNext: false, tabs: [{ pos: lebar - 400, type: "right", dot: true }] }));
  else out.push(p(`NIP ${o.nip}`, { align: "left" }));
  return out;
}

/** Tanda tangan di sisi kanan. */
function ttdKanan(o: Ttd): Table {
  const kiri = Math.round(W * 0.5);
  const kanan = W - kiri;
  return tabel([kiri, kanan], [baris([sel("", kiri), sel(blokTtd(o, kanan), kanan)])], { rapat: true });
}

/** Dua kolom tanda tangan (kiri dan kanan). */
function ttdDua(kiri: Ttd | (Paragraph | Table)[], kanan: Ttd | (Paragraph | Table)[]): Table {
  const a = Math.round(W * 0.5);
  const b = W - a;
  const isi = (x: Ttd | (Paragraph | Table)[], l: number) => (Array.isArray(x) ? x : blokTtd(x, l));
  return tabel([a, b], [baris([sel(isi(kiri, a), a), sel(isi(kanan, b), b)])], { rapat: true });
}

const TTD_REKTOR = (tanggal: Ttd["tanggal"] = "surat"): Ttd => ({
  tanggal,
  jabatan: ["Rektor,"],
  nama: "{nama_rektor}",
  nip: "{nip_rektor}",
});

const TTD_KETUA_TIM = (tanggal: Ttd["tanggal"] = "surat"): Ttd => ({
  tanggal,
  jabatan: ["Ketua Tim Pemeriksa,"],
  nama: "{nama_ketua_tim}",
  nip: "{nip_ketua_tim}",
});

function tembusan(judulTeks: string, daftar: string[]): Paragraph[] {
  return [
    p(judulTeks, { before: 240, size: 10, align: "left", keepNext: true }),
    ...daftar.map((d, i) => butir(`${i + 1}.`, d, { size: 10, after: 0, align: "left" })),
  ];
}

/** Loop paragraf: tag pembuka & penutup berdiri sendiri. */
function loopParagraf(tag: string, isi: Paragraph[]): Paragraph[] {
  return [p(`{#${tag}}`, { align: "left" }), ...isi, p(`{/${tag}}`, { align: "left" })];
}

/**
 * Tabel konsiderans/diktum Keputusan: "Menimbang : a. ...".
 * Setiap baris: [label, isi paragraf].
 */
function tabelDiktum(rows: [string, (Paragraph | Table)[]][]): Table {
  const label = 1700;
  const titik2 = 300;
  const isi = W - label - titik2;
  return tabel(
    [label, titik2, isi],
    rows.map(([l, ps]) =>
      baris([sel(l, label), sel(l ? ":" : "", titik2, { align: "center" }), sel(ps.length ? ps : [p("")], isi)]),
    ),
  );
}

const LEBAR_ISI_DIKTUM = () => W - 1700 - 300 - 114;

/** Paragraf isi diktum (rata kiri-kanan, jarak bawah kecil). */
const pd = (teks: Isi, g: GayaPar = {}) => p(teks, { after: 120, ...g });

/** Butir loop menimbang / mengingat dengan inden gantung. */
const butirLoop = (no: string, teks: string) =>
  new Paragraph({
    children: [r(`${no}\t`), r(teks)],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 60 },
    indent: { left: INDEN, hanging: INDEN },
    tabStops: [{ type: TabStopType.LEFT, position: INDEN }],
  });

const konsiderans = (): [string, (Paragraph | Table)[]][] => [
  ["Menimbang", loopParagraf("menimbang", [butirLoop("{huruf}.", "{teks}")])],
  ["", [p("")]],
  ["Mengingat", loopParagraf("mengingat", [butirLoop("{nomor}.", "{teks}")])],
];

/** Kepala Keputusan: KEPUTUSAN ... NOMOR ... TENTANG ... DENGAN RAHMAT ... */
function kepalaKeputusan(pejabat: string, nomor: string, tentang: Isi): Paragraph[] {
  return [
    judul([r(`KEPUTUSAN ${pejabat} {nama_instansi}`, { bold: true, caps: true })]),
    judul([r(`NOMOR ${nomor}`, { bold: true })]),
    p(""),
    judul("TENTANG"),
    judul(tentang, { after: 240 }),
    judul("DENGAN RAHMAT TUHAN YANG MAHA ESA", { after: 240 }),
    judul([r(`${pejabat} {nama_instansi},`, { bold: true, caps: true })], { after: 240 }),
  ];
}

// ---------------------------------------------------------------------------
// Isi setiap template
// ---------------------------------------------------------------------------
type Konten = { judul: string; landscape?: boolean; isi: () => (Paragraph | Table)[] };

const KONTEN: Record<string, Konten> = {
  // 1 -----------------------------------------------------------------------
  surat_panggilan: {
    judul: "Surat Panggilan",
    isi: () => [
      ...kop(),
      judul("SURAT PANGGILAN {urutan_panggilan}", { underline: true, after: 240 }),
      kepalaSurat(),
      p("", { after: 120 }),
      p("Yth. Sdr. {nama_terperiksa}", { align: "left" }),
      p("{jabatan_terperiksa}", { align: "left" }),
      p("{unit_kerja_terperiksa}", { align: "left" }),
      p("{nama_instansi}", { align: "left", after: 240 }),
      butir("1.", "Bersama ini diminta dengan hormat kehadiran Saudara:"),
      tabelLabel(IDENTITAS, { inden: INDEN }),
      lanjut("untuk menghadap Tim Pemeriksa pada:", { before: 120 }),
      tabelLabel(
        [
          ["Hari", "{hari_pemeriksaan}"],
          ["Tanggal", "{tanggal_pemeriksaan}"],
          ["Jam", "{jam_pemeriksaan}"],
          ["Tempat", "{tempat_pemeriksaan}"],
        ],
        { inden: INDEN },
      ),
      lanjut("untuk diperiksa sehubungan dengan dugaan pelanggaran disiplin {uraian_dugaan}.", { before: 120, after: 120 }),
      butir(
        "2.",
        "Apabila Saudara berhalangan hadir, Saudara diminta memberitahukan secara tertulis kepada Tim Pemeriksa disertai alasan yang sah sebelum waktu pemeriksaan.",
      ),
      butir("3.", "Demikian untuk dilaksanakan.", { after: 360 }),
      ttdKanan(TTD_KETUA_TIM()),
      ...tembusan("Tembusan:", ["Pejabat yang Berwenang Menghukum;", "Atasan langsung yang bersangkutan;", "Arsip."]),
    ],
  },

  // 2 -----------------------------------------------------------------------
  bap: {
    judul: "Berita Acara Pemeriksaan",
    isi: () => {
      const kiri = Math.round(W * 0.38);
      const kanan = W - kiri;
      const kolomTim = [450, kanan - 450 - 2000 - 114, 2000];
      const tim = tabel(
        kolomTim,
        [
          baris(
            [
              sel("{#anggota_tim}{nomor}.", kolomTim[0]),
              sel(
                [p("{nama}", { align: "left", size: 11 }), p("{jabatan_dalam_tim}", { align: "left", size: 10, italics: true })],
                kolomTim[1],
              ),
              sel("(…………………){/anggota_tim}", kolomTim[2], { align: "right", size: 11 }),
            ],
            { tinggi: 850 },
          ),
        ],
        { rapat: true },
      );
      const ttdTerperiksa = blokTtd({ jabatan: ["Yang diperiksa,"], nama: "{nama_terperiksa}", nip: "{nip_terperiksa}" }, kiri);
      return [
        ...kop(),
        judul("BERITA ACARA PEMERIKSAAN", { underline: true }),
        judul([r("Nomor Registrasi: {nomor_registrasi}", { bold: false, size: 11 })], { after: 240 }),
        p(
          "Pada hari ini {hari_pemeriksaan} {tanggal_pemeriksaan_terbilang}, pukul {jam_pemeriksaan}, bertempat di {tempat_pemeriksaan}, kami Tim Pemeriksa yang dibentuk berdasarkan Keputusan {pejabat_pembentuk_tim} Nomor {nomor_sk_tim} tanggal {tanggal_sk_tim} telah melakukan pemeriksaan terhadap:",
          { after: 120 },
        ),
        tabelLabel(IDENTITAS_LENGKAP, { inden: INDEN }),
        p(
          "karena yang bersangkutan diduga melakukan pelanggaran disiplin {uraian_dugaan}. Atas pertanyaan Tim Pemeriksa, terperiksa memberikan keterangan sebagai berikut:",
          { before: 120, after: 120 },
        ),
        tabelGaris(
          [650, Math.round((W - 650) * 0.45), W - 650 - Math.round((W - 650) * 0.45)],
          ["No", "Pertanyaan", "Jawaban"],
          [["{#qa}{nomor}", "{pertanyaan}", "{jawaban}{/qa}"]],
          { tengah: [true, false, false] },
        ),
        p("", { after: 120 }),
        ...loopParagraf("catatan_perekaman", [p("Catatan: {catatan_perekaman}", { after: 120, italics: true })]),
        p(
          "Pemeriksaan selesai pada pukul {jam_selesai_pemeriksaan}. Setelah Berita Acara Pemeriksaan ini dibacakan kembali, terperiksa menyatakan bahwa keterangan yang diberikan adalah benar, kemudian bersama Tim Pemeriksa membubuhkan tanda tangan di bawah ini.",
          { after: 120 },
        ),
        p(
          "Demikian Berita Acara Pemeriksaan ini dibuat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.",
          { after: 240 },
        ),
        p("{tempat_surat}, {tanggal_pemeriksaan}", { align: "right", after: 120, keepNext: true }),
        tabel(
          [kiri, kanan],
          [baris([sel(ttdTerperiksa, kiri), sel([p("Tim Pemeriksa,", { align: "left", keepNext: true }), tim], kanan)])],
          { rapat: true },
        ),
      ];
    },
  },

  // 3 -----------------------------------------------------------------------
  bap_tidak_hadir: {
    judul: "Berita Acara Ketidakhadiran Pemeriksaan",
    isi: () => {
      const kol = [600, 3000, 2300, 1655];
      kol.push(W - kol.reduce((a, b) => a + b, 0));
      return [
        ...kop(),
        judul("BERITA ACARA KETIDAKHADIRAN PEMERIKSAAN", { underline: true }),
        judul([r("Nomor Registrasi: {nomor_registrasi}", { size: 11 })], { after: 240 }),
        p(
          "Pada hari ini {hari_pemeriksaan} {tanggal_pemeriksaan_terbilang}, pukul {jam_pemeriksaan}, bertempat di {tempat_pemeriksaan}, kami Tim Pemeriksa yang dibentuk berdasarkan Keputusan {pejabat_pembentuk_tim} Nomor {nomor_sk_tim} tanggal {tanggal_sk_tim} telah menunggu kehadiran:",
          { after: 120 },
        ),
        tabelLabel(IDENTITAS, { inden: INDEN }),
        p("untuk diperiksa sehubungan dengan dugaan pelanggaran disiplin {uraian_dugaan}.", { before: 120, after: 120 }),
        p(
          "Sampai dengan pukul {jam_selesai_pemeriksaan}, yang bersangkutan tidak hadir memenuhi panggilan tanpa memberikan keterangan atau alasan yang sah, meskipun telah dipanggil secara tertulis dengan:",
          { after: 120 },
        ),
        butir("a.", "Surat Panggilan I Nomor {nomor_panggilan_1} tanggal {tanggal_panggilan_1};", { left: INDEN }),
        ...loopParagraf("nomor_panggilan_2", [
          butir("b.", "Surat Panggilan II Nomor {nomor_panggilan_2} tanggal {tanggal_panggilan_2}.", { left: INDEN }),
        ]),
        p(
          "Atas ketidakhadiran tersebut, Tim Pemeriksa akan menindaklanjuti sesuai dengan ketentuan peraturan perundang-undangan.",
          { before: 120, after: 120 },
        ),
        p(
          "Demikian Berita Acara Ketidakhadiran Pemeriksaan ini dibuat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.",
          { after: 240 },
        ),
        p("{tempat_surat}, {tanggal_pemeriksaan}", { align: "right", after: 60, keepNext: true }),
        p("Tim Pemeriksa,", { align: "left", after: 120, keepNext: true }),
        tabelGaris(
          kol,
          ["No", "Nama", "NIP", "Jabatan dalam Tim", "Tanda Tangan"],
          [["{#anggota_tim}{nomor}", "{nama}", "{nip}", "{jabatan_dalam_tim}", "{/anggota_tim}"]],
          { tengah: [true, false, false, false, false], tinggi: 700 },
        ),
      ];
    },
  },

  // 4 -----------------------------------------------------------------------
  sk_tim_pemeriksa: {
    judul: "Keputusan Pembentukan Tim Pemeriksa",
    isi: () => {
      const tentang = (bold = true): TextRun[] => [
        r("PEMBENTUKAN TIM PEMERIKSA ATAS DUGAAN PELANGGARAN DISIPLIN A.N. ", { bold }),
        r("{nama_terperiksa}", { bold }),
      ];
      const kol = [600, 2800, 2200, 1600];
      kol.push(W - kol.reduce((a, b) => a + b, 0));
      const lampiranKepala = (teks: Isi) => p(teks, { align: "left", left: Math.round(W * 0.45) });
      return [
        ...kop(),
        ...kepalaKeputusan("{pejabat_pembentuk_tim}", "{nomor_surat}", tentang()),
        tabelDiktum(konsiderans()),
        judul("MEMUTUSKAN:", { before: 240, after: 240 }),
        tabelDiktum([
          [
            "Menetapkan",
            [
              pd([
                r("KEPUTUSAN {pejabat_pembentuk_tim} {nama_instansi}", { caps: true }),
                r(" TENTANG "),
                ...tentang(false),
                r("."),
              ], { align: "left" }),
            ],
          ],
          [
            "KESATU",
            [
              pd(
                "Membentuk Tim Pemeriksa atas dugaan pelanggaran disiplin yang dilakukan oleh Sdr. {nama_terperiksa}, NIP {nip_terperiksa}, {jabatan_terperiksa} pada {unit_kerja_terperiksa}, dengan susunan keanggotaan sebagaimana tercantum dalam Lampiran yang merupakan bagian tidak terpisahkan dari Keputusan ini.",
              ),
            ],
          ],
          [
            "KEDUA",
            [
              p("Tim Pemeriksa sebagaimana dimaksud dalam Diktum KESATU bertugas:", { after: 60 }),
              butir("a.", "memanggil dan melakukan pemeriksaan terhadap terperiksa;"),
              butir("b.", "menuangkan hasil pemeriksaan dalam Berita Acara Pemeriksaan;"),
              butir(
                "c.",
                "menyusun Laporan Hasil Pemeriksaan dan melaporkannya kepada {pejabat_pembentuk_tim} sebagai bahan pertimbangan bagi Pejabat yang Berwenang Menghukum.",
                { after: 120 },
              ),
            ],
          ],
          ["KETIGA", [pd("Keputusan ini mulai berlaku pada tanggal ditetapkan.")]],
        ]),
        p("", { after: 240 }),
        ttdKanan(TTD_REKTOR("ditetapkan")),
        ...tembusan("Salinan Keputusan ini disampaikan kepada:", [
          "Yang bersangkutan;",
          "Para anggota Tim Pemeriksa;",
          "Atasan langsung yang bersangkutan.",
        ]),
        // Lampiran
        p("LAMPIRAN", { align: "left", left: Math.round(W * 0.45), pageBreakBefore: true }),
        lampiranKepala([r("KEPUTUSAN {pejabat_pembentuk_tim} {nama_instansi}", { caps: true })]),
        lampiranKepala("NOMOR {nomor_surat}"),
        lampiranKepala([r("TENTANG PEMBENTUKAN TIM PEMERIKSA ATAS DUGAAN PELANGGARAN DISIPLIN A.N. "), r("{nama_terperiksa}")]),
        p("", { after: 240 }),
        judul("SUSUNAN KEANGGOTAAN TIM PEMERIKSA", { after: 240 }),
        tabelGaris(
          kol,
          ["No", "Nama/NIP", "Jabatan", "Unsur", "Kedudukan dalam Tim"],
          [
            [
              "{#anggota_tim}{nomor}",
              [p("{nama}", { align: "left" }), p("NIP {nip}", { align: "left" })],
              "{jabatan}",
              "{unsur}",
              "{jabatan_dalam_tim}{/anggota_tim}",
            ],
          ],
          { tengah: [true, false, false, false, false] },
        ),
        p("", { after: 360 }),
        ttdKanan({ jabatan: ["Rektor,"], nama: "{nama_rektor}", nip: "{nip_rektor}" }),
      ];
    },
  },

  // 5 -----------------------------------------------------------------------
  surat_tugas_sekretariat: {
    judul: "Surat Tugas Tim Sekretariat",
    isi: () => {
      const kol = [600, 3400, 2500];
      kol.push(W - kol.reduce((a, b) => a + b, 0));
      const kosongBaris = (no: string): IsiSel[] => [
        no,
        [titik(kol[1] - 200)],
        [titik(kol[2] - 200)],
        [titik(kol[3] - 200)],
      ];
      return [
        ...kop(),
        judul("SURAT TUGAS", { underline: true }),
        judul([r("Nomor {nomor_surat}", { bold: false })], { after: 360 }),
        tabelDiktum([
          [
            "Dasar",
            [
              pd(
                "Keputusan {pejabat_pembentuk_tim} {nama_instansi} Nomor {nomor_sk_tim} tanggal {tanggal_sk_tim} tentang Pembentukan Tim Pemeriksa atas Dugaan Pelanggaran Disiplin a.n. {nama_terperiksa}.",
              ),
            ],
          ],
        ]),
        judul("MENUGASKAN:", { before: 240, after: 240 }),
        p("Kepada:", { after: 120 }),
        tabelGaris(kol, ["No", "Nama", "NIP", "Jabatan"], [kosongBaris("1."), kosongBaris("2."), kosongBaris("3.")], {
          tengah: [true, false, false, false],
          tinggi: 500,
        }),
        p("Untuk:", { before: 240, after: 120 }),
        butir(
          "1.",
          "bertindak sebagai Tim Sekretariat yang membantu Tim Pemeriksa dalam pelaksanaan pemeriksaan atas dugaan pelanggaran disiplin a.n. Sdr. {nama_terperiksa}, NIP {nip_terperiksa}, {jabatan_terperiksa} pada {unit_kerja_terperiksa};",
        ),
        butir(
          "2.",
          "melaksanakan tugas administrasi pemeriksaan, meliputi penyiapan surat panggilan, notulensi pemeriksaan, dan pengelolaan berkas pemeriksaan;",
        ),
        butir("3.", "menjaga kerahasiaan seluruh dokumen dan informasi yang berkaitan dengan pemeriksaan;"),
        butir("4.", "melaksanakan tugas ini dengan penuh tanggung jawab dan melaporkannya kepada Ketua Tim Pemeriksa.", {
          after: 360,
        }),
        ttdKanan(TTD_REKTOR()),
      ];
    },
  },

  // 6 -----------------------------------------------------------------------
  lhp: {
    judul: "Laporan Hasil Pemeriksaan",
    isi: () => [
      ...kop(),
      judul("LAPORAN HASIL PEMERIKSAAN", { underline: true }),
      judul("atas Dugaan Pelanggaran Disiplin a.n. {nama_terperiksa}", { after: 240 }),
      p("Yth. {jabatan_pejabat_penjatuh}", { align: "left" }),
      p("{nama_instansi}", { align: "left", after: 240 }),
      ...bab("I.", "DASAR", [
        butir(
          "1.",
          "Keputusan {pejabat_pembentuk_tim} {nama_instansi} Nomor {nomor_sk_tim} tanggal {tanggal_sk_tim} tentang Pembentukan Tim Pemeriksa atas Dugaan Pelanggaran Disiplin a.n. {nama_terperiksa};",
          { left: INDEN },
        ),
        butir("2.", "Berita Acara Pemeriksaan tanggal {tanggal_pemeriksaan}.", { left: INDEN }),
      ]),
      ...bab("II.", "IDENTITAS TERPERIKSA", [tabelLabel(IDENTITAS, { inden: INDEN })]),
      ...bab("III.", "URAIAN DUGAAN PELANGGARAN", [
        lanjut("{uraian_dugaan}"),
        lanjut("Kronologi:", { bold: true, before: 60 }),
        lanjut("{kronologi}"),
      ]),
      ...bab("IV.", "FAKTA HASIL PEMERIKSAAN", [
        lanjut("Berdasarkan hasil pemeriksaan, diperoleh fakta sebagai berikut:"),
        ...loopParagraf("pelanggaran", [
          butir("{nomor}.", "{uraian}; perbuatan tersebut melanggar {pasal}, dengan dampak negatif pada {dampak}.", {
            left: INDEN,
          }),
        ]),
      ]),
      ...bab("V.", "ANALISIS", analisis()),
      ...bab("VI.", "REKOMENDASI", [
        lanjut(
          [
            r(
              "Berdasarkan fakta dan analisis tersebut, Tim Pemeriksa merekomendasikan agar terperiksa dijatuhi hukuman disiplin tingkat {tingkat_hukuman} berupa {jenis_hukuman}",
            ),
            r("{#pemotongan_ik_teks}, {pemotongan_ik_teks}{/pemotongan_ik_teks}"),
            r(", sesuai dengan ketentuan {nama_regulasi}."),
          ],
        ),
      ]),
      ...bab("VII.", "PENUTUP", [
        lanjut(
          "Demikian Laporan Hasil Pemeriksaan ini dibuat sebagai bahan pertimbangan bagi Pejabat yang Berwenang Menghukum dalam menjatuhkan hukuman disiplin.",
          { after: 240 },
        ),
      ]),
      ...ttdTim(),
    ],
  },

  // 7 -----------------------------------------------------------------------
  lhp_tidak_hadir: {
    judul: "Laporan Hasil Pemeriksaan (Terperiksa Tidak Hadir)",
    isi: () => [
      ...kop(),
      judul("LAPORAN HASIL PEMERIKSAAN", { underline: true }),
      judul("atas Dugaan Pelanggaran Disiplin a.n. {nama_terperiksa}", {}),
      judul([r("(Terperiksa Tidak Memenuhi Panggilan)", { bold: false, italics: true })], { after: 240 }),
      p("Yth. {jabatan_pejabat_penjatuh}", { align: "left" }),
      p("{nama_instansi}", { align: "left", after: 240 }),
      ...bab("I.", "DASAR", [
        lanjut(
          "Keputusan {pejabat_pembentuk_tim} {nama_instansi} Nomor {nomor_sk_tim} tanggal {tanggal_sk_tim} tentang Pembentukan Tim Pemeriksa atas Dugaan Pelanggaran Disiplin a.n. {nama_terperiksa}.",
        ),
      ]),
      ...bab("II.", "IDENTITAS TERPERIKSA", [tabelLabel(IDENTITAS, { inden: INDEN })]),
      ...bab("III.", "URAIAN DUGAAN PELANGGARAN", [
        lanjut("{uraian_dugaan}"),
        lanjut("Kronologi:", { bold: true, before: 60 }),
        lanjut("{kronologi}"),
      ]),
      ...bab("IV.", "PELAKSANAAN PEMANGGILAN", [
        lanjut("Tim Pemeriksa telah memanggil terperiksa secara tertulis untuk diperiksa, yaitu dengan:"),
        butir("1.", "Surat Panggilan I Nomor {nomor_panggilan_1} tanggal {tanggal_panggilan_1};", { left: INDEN }),
        butir("2.", "Surat Panggilan II Nomor {nomor_panggilan_2} tanggal {tanggal_panggilan_2}.", { left: INDEN }),
        lanjut(
          "Terperiksa tidak hadir memenuhi panggilan tersebut tanpa alasan yang sah, sebagaimana dituangkan dalam Berita Acara Ketidakhadiran Pemeriksaan.",
        ),
      ]),
      ...bab("V.", "FAKTA BERDASARKAN ALAT BUKTI YANG TERSEDIA", [
        lanjut(
          "Oleh karena terperiksa tidak hadir, Tim Pemeriksa menyusun laporan berdasarkan alat bukti dan keterangan yang tersedia, dengan fakta sebagai berikut:",
        ),
        ...loopParagraf("pelanggaran", [
          butir("{nomor}.", "{uraian}; perbuatan tersebut melanggar {pasal}, dengan dampak negatif pada {dampak}.", {
            left: INDEN,
          }),
        ]),
      ]),
      ...bab("VI.", "ANALISIS", analisis()),
      ...bab("VII.", "REKOMENDASI", [
        lanjut([
          r(
            "Berdasarkan alat bukti yang tersedia, Tim Pemeriksa merekomendasikan agar terperiksa dijatuhi hukuman disiplin tingkat {tingkat_hukuman} berupa {jenis_hukuman}",
          ),
          r("{#pemotongan_ik_teks}, {pemotongan_ik_teks}{/pemotongan_ik_teks}"),
          r(", sesuai dengan ketentuan {nama_regulasi}."),
        ]),
      ]),
      ...bab("VIII.", "PENUTUP", [
        lanjut(
          "Demikian Laporan Hasil Pemeriksaan ini dibuat sebagai bahan pertimbangan bagi Pejabat yang Berwenang Menghukum dalam menjatuhkan hukuman disiplin.",
          { after: 240 },
        ),
      ]),
      ...ttdTim(),
    ],
  },

  // 8 -----------------------------------------------------------------------
  nota_dinas_kewenangan: {
    judul: "Nota Dinas Laporan Kewenangan",
    isi: () => [
      ...kop(),
      judul("NOTA DINAS", { underline: true }),
      judul([r("Nomor {nomor_surat}", { bold: false })], { after: 240 }),
      tabelLabel(
        [
          ["Yth.", "Rektor"],
          ["Dari", "Ketua Tim Pemeriksa"],
          ["Sifat", "{sifat_surat}"],
          ["Lampiran", "{lampiran_surat}"],
          ["Hal", "Laporan Kewenangan Penjatuhan Hukuman Disiplin a.n. {nama_terperiksa}"],
          ["Tanggal", "{tanggal_surat_panjang}"],
        ],
        { label: 1300 },
      ),
      p("", { garisBawah: true, after: 240 }),
      butir(
        "1.",
        "Berdasarkan Keputusan {pejabat_pembentuk_tim} Nomor {nomor_sk_tim} tanggal {tanggal_sk_tim}, Tim Pemeriksa telah melaksanakan pemeriksaan atas dugaan pelanggaran disiplin yang dilakukan oleh Sdr. {nama_terperiksa}, NIP {nip_terperiksa}, {jabatan_terperiksa} pada {unit_kerja_terperiksa}.",
        { after: 120 },
      ),
      butir(
        "2.",
        "Berdasarkan Laporan Hasil Pemeriksaan, terperiksa terbukti melanggar {pasal_dilanggar} {nama_regulasi} dan direkomendasikan untuk dijatuhi hukuman disiplin tingkat {tingkat_hukuman} berupa {jenis_hukuman}.",
        { after: 120 },
      ),
      butir(
        "3.",
        "Sesuai dengan ketentuan {nama_regulasi}, Pejabat yang Berwenang Menghukum untuk menjatuhkan hukuman disiplin tersebut adalah {jabatan_pejabat_penjatuh}.",
        { after: 120 },
      ),
      butir(
        "4.",
        "Sehubungan dengan hal tersebut, kami mohon arahan Bapak/Ibu Rektor mengenai tindak lanjut penjatuhan hukuman disiplin dimaksud.",
        { after: 120 },
      ),
      p("Demikian disampaikan, atas perhatian dan arahan Bapak/Ibu diucapkan terima kasih.", { after: 360 }),
      ttdKanan(TTD_KETUA_TIM("")),
    ],
  },

  // 9 -----------------------------------------------------------------------
  usul_menteri: {
    judul: "Surat Usul Penjatuhan Hukuman Disiplin",
    isi: () => [
      ...kop(),
      kepalaSurat("Usul Penjatuhan Hukuman Disiplin a.n. {nama_terperiksa}"),
      p("", { after: 120 }),
      p("Yth. {jabatan_pejabat_penjatuh}", { align: "left", after: 240 }),
      p(
        "Dengan hormat, bersama ini kami sampaikan usul penjatuhan hukuman disiplin terhadap pegawai di lingkungan {nama_instansi} sebagai berikut:",
        { after: 120 },
      ),
      tabelLabel(IDENTITAS, { inden: INDEN }),
      p("", { after: 120 }),
      butir(
        "1.",
        "Berdasarkan Laporan Hasil Pemeriksaan Tim Pemeriksa yang dibentuk dengan Keputusan {pejabat_pembentuk_tim} Nomor {nomor_sk_tim} tanggal {tanggal_sk_tim}, yang bersangkutan terbukti melakukan pelanggaran disiplin berupa {uraian_dugaan}.",
        { after: 120 },
      ),
      butir("2.", "Perbuatan tersebut melanggar {pasal_dilanggar} {nama_regulasi}.", { after: 120 }),
      butir(
        "3.",
        "Sesuai dengan ketentuan {nama_regulasi}, penjatuhan hukuman disiplin tingkat {tingkat_hukuman} berupa {jenis_hukuman} merupakan kewenangan {jabatan_pejabat_penjatuh}. Oleh karena itu, kami mengusulkan agar yang bersangkutan dijatuhi hukuman disiplin tingkat {tingkat_hukuman} berupa {jenis_hukuman}.",
        { after: 120 },
      ),
      butir("4.", "Sebagai bahan pertimbangan, bersama ini kami lampirkan:"),
      butir("a.", "salinan Keputusan pembentukan Tim Pemeriksa;", { left: INDEN, after: 0 }),
      butir("b.", "Berita Acara Pemeriksaan;", { left: INDEN, after: 0 }),
      butir("c.", "Laporan Hasil Pemeriksaan;", { left: INDEN, after: 0 }),
      butir("d.", "bukti-bukti pendukung.", { left: INDEN, after: 120 }),
      p("Demikian usul ini kami sampaikan, atas perhatian dan perkenan Bapak/Ibu diucapkan terima kasih.", {
        after: 360,
      }),
      ttdKanan(TTD_REKTOR()),
    ],
  },

  // 10 ----------------------------------------------------------------------
  rekapitulasi_tmk: {
    judul: "Rekapitulasi Ketidakhadiran Kerja",
    landscape: true,
    isi: () => {
      const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      const kodeBulan = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"];
      const lebarTahun = 1300;
      const lebarJumlah = 1400;
      const lebarBulan = Math.floor((W - lebarTahun - lebarJumlah) / 12);
      const kol = [lebarTahun, ...bulan.map(() => lebarBulan), W - lebarTahun - 12 * lebarBulan];
      return [
        ...kop(),
        judul("REKAPITULASI KETIDAKHADIRAN KERJA", { underline: true }),
        judul([r("Nomor Registrasi: {nomor_registrasi}", { bold: false, size: 11 })], { after: 240 }),
        tabelLabel(IDENTITAS, { lebar: Math.round(W * 0.7) }),
        p("", { after: 120 }),
        tabelGaris(
          kol,
          ["Tahun", ...bulan, "Jumlah"],
          [["{#rekap_tmk}{tahun}", ...kodeBulan.map((k) => `{${k}}`), "{jumlah}{/rekap_tmk}"]],
          { tengah: kol.map(() => true), size: 11 },
        ),
        p("Jumlah ketidakhadiran tanpa alasan yang sah tahun berjalan: {jumlah_tmk} hari kerja.", {
          before: 120,
          bold: true,
        }),
        p(
          "Keterangan: angka menunjukkan jumlah hari kerja tidak masuk tanpa alasan yang sah berdasarkan data presensi pegawai.",
          { size: 10, italics: true, after: 240 },
        ),
        ttdKanan({
          tanggal: "surat",
          jabatan: ["Kepala Unit Kepegawaian,"],
          nama: TITIK,
          nip: TITIK,
        }),
      ];
    },
  },

  // 11 ----------------------------------------------------------------------
  keterangan_rekan_sejawat: {
    judul: "Surat Keterangan Kesaksian Rekan Sejawat",
    isi: () => [
      ...kop(),
      judul("SURAT KETERANGAN", { underline: true, after: 360 }),
      p("Yang bertanda tangan di bawah ini:", { after: 120 }),
      tabelLabel(
        [
          ["Nama", TITIK],
          ["NIP", TITIK],
          ["Jabatan", TITIK],
          ["Unit Kerja", TITIK],
        ],
        { inden: INDEN },
      ),
      p(
        "menerangkan dengan sebenarnya bahwa Sdr. {nama_terperiksa}, NIP {nip_terperiksa}, {jabatan_terperiksa} pada {unit_kerja_terperiksa}, sepanjang pengetahuan saya:",
        { before: 120, after: 120 },
      ),
      ...Array.from({ length: 6 }, () => titik(W - 60, { after: 120 })),
      p(
        "Demikian surat keterangan ini saya buat dengan sebenarnya, dalam keadaan sadar dan tanpa paksaan dari pihak mana pun, untuk dipergunakan dalam pemeriksaan atas dugaan pelanggaran disiplin. Apabila di kemudian hari keterangan ini terbukti tidak benar, saya bersedia mempertanggungjawabkannya sesuai dengan ketentuan peraturan perundang-undangan.",
        { before: 120, after: 360 },
      ),
      ttdKanan({
        tanggal: "surat",
        jabatan: ["Yang menerangkan,"],
        catatan: "Meterai",
        nama: TITIK,
        nip: TITIK,
      }),
    ],
  },

  // 12 ----------------------------------------------------------------------
  kronologi: {
    judul: "Kronologi Dugaan Pelanggaran Disiplin",
    isi: () => {
      const kol = [600, 2000, 2400];
      kol.push(W - kol.reduce((a, b) => a + b, 0));
      return [
        ...kop(),
        judul("KRONOLOGI DUGAAN PELANGGARAN DISIPLIN", { underline: true }),
        judul([r("Nomor Registrasi: {nomor_registrasi}", { bold: false, size: 11 })], { after: 240 }),
        ...bab("A.", "IDENTITAS PEGAWAI", [tabelLabel(IDENTITAS, { inden: INDEN })]),
        ...bab("B.", "DUGAAN PELANGGARAN", [
          tabelLabel(
            [
              ["Perihal", "{judul_kasus}"],
              ["Uraian dugaan", "{uraian_dugaan}"],
              ["Waktu perbuatan", "{waktu_perbuatan}"],
              ["Tempat perbuatan", "{tempat_perbuatan}"],
            ],
            { inden: INDEN },
          ),
        ]),
        ...bab("C.", "KRONOLOGI", [lanjut("{kronologi}")]),
        ...bab("D.", "RINCIAN PERBUATAN", [
          tabelGaris(
            kol,
            ["No", "Waktu", "Tempat", "Uraian Perbuatan"],
            [["{#pelanggaran}{nomor}", "{waktu}", "{tempat}", "{uraian}{/pelanggaran}"]],
            { tengah: [true, false, false, false] },
          ),
        ]),
        p(
          "Demikian kronologi ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.",
          { before: 240, after: 360 },
        ),
        ttdKanan({
          tanggal: "surat",
          jabatan: ["{jabatan_atasan_langsung},"],
          nama: "{nama_atasan_langsung}",
          nip: "{nip_atasan_langsung}",
        }),
      ];
    },
  },

  // 13 ----------------------------------------------------------------------
  sk_hukdis: {
    judul: "Keputusan Penjatuhan Hukuman Disiplin",
    isi: () => [
      ...kop(),
      ...kepalaKeputusan("{jabatan_pejabat_penjatuh}", "{nomor_sk}", [
        r("PENJATUHAN HUKUMAN DISIPLIN {tingkat_hukuman} BERUPA {jenis_hukuman}", { bold: true, caps: true }),
      ]),
      tabelDiktum(konsiderans()),
      judul("MEMUTUSKAN:", { before: 240, after: 240 }),
      tabelDiktum([
        [
          "Menetapkan",
          [
            pd([
              r(
                "KEPUTUSAN {jabatan_pejabat_penjatuh} {nama_instansi} TENTANG PENJATUHAN HUKUMAN DISIPLIN {tingkat_hukuman} BERUPA {jenis_hukuman}",
                { caps: true },
              ),
              r("."),
            ], { align: "left" }),
          ],
        ],
        [
          "KESATU",
          [
            p("Menjatuhkan hukuman disiplin tingkat {tingkat_hukuman} berupa {jenis_hukuman} kepada:", { after: 60 }),
            tabelLabel(IDENTITAS, { lebar: LEBAR_ISI_DIKTUM(), label: 2800 }),
            pd("karena yang bersangkutan terbukti melanggar {pasal_dilanggar} {nama_regulasi}.", { before: 60 }),
          ],
        ],
        [
          "KEDUA",
          [
            pd(
              "Hukuman disiplin sebagaimana dimaksud dalam Diktum KESATU dilaksanakan sesuai dengan ketentuan {nama_regulasi}.",
            ),
            ...loopParagraf("durasi_hukuman", [
              pd("Hukuman disiplin sebagaimana dimaksud dalam Diktum KESATU berlaku selama {durasi_hukuman}."),
            ]),
            ...loopParagraf("pemotongan_ik_teks", [
              pd("Penjatuhan hukuman disiplin sebagaimana dimaksud dalam Diktum KESATU {pemotongan_ik_teks}."),
            ]),
          ],
        ],
        ["KETIGA", [pd("Keputusan ini mulai berlaku pada tanggal {tanggal_mulai_berlaku}.")]],
        [
          "KEEMPAT",
          [pd("Salinan Keputusan ini disampaikan kepada yang bersangkutan untuk diketahui dan dilaksanakan sebagaimana mestinya.")],
        ],
      ]),
      p("", { after: 240 }),
      ttdKanan({
        tanggal: "ditetapkan",
        jabatan: ["{jabatan_pejabat_penjatuh},"],
        nama: "{nama_pejabat_penjatuh}",
        nip: "{nip_pejabat_penjatuh}",
      }),
      ...tembusan("Tembusan:", [
        "Atasan langsung yang bersangkutan;",
        "Pimpinan unit kerja yang bersangkutan;",
        "Unit pengelola kepegawaian;",
        "Arsip.",
      ]),
    ],
  },

  // 14 ----------------------------------------------------------------------
  panggilan_penerimaan_sk: {
    judul: "Surat Panggilan Penerimaan Keputusan Hukuman Disiplin",
    isi: () => [
      ...kop(),
      judul("SURAT PANGGILAN", { underline: true, after: 240 }),
      kepalaSurat(),
      p("", { after: 120 }),
      p("Yth. Sdr. {nama_terperiksa}", { align: "left" }),
      p("{jabatan_terperiksa}", { align: "left" }),
      p("{unit_kerja_terperiksa}", { align: "left" }),
      p("{nama_instansi}", { align: "left", after: 240 }),
      butir("1.", "Bersama ini diminta dengan hormat kehadiran Saudara:"),
      tabelLabel(IDENTITAS, { inden: INDEN }),
      lanjut("untuk menghadap {jabatan_pejabat_penjatuh} atau pejabat lain yang ditunjuk pada:", { before: 120 }),
      tabelLabel(
        [
          ["Hari", "{hari_pemeriksaan}"],
          ["Tanggal", "{tanggal_pemeriksaan}"],
          ["Jam", "{jam_pemeriksaan}"],
          ["Tempat", "{tempat_pemeriksaan}"],
        ],
        { inden: INDEN },
      ),
      lanjut(
        "guna menerima penyampaian Keputusan {jabatan_pejabat_penjatuh} Nomor {nomor_sk} tanggal {tanggal_sk} tentang Penjatuhan Hukuman Disiplin.",
        { before: 120, after: 120 },
      ),
      butir("2.", "Demikian untuk dilaksanakan.", { after: 360 }),
      ttdKanan({
        tanggal: "surat",
        jabatan: ["{jabatan_pejabat_penjatuh},"],
        nama: "{nama_pejabat_penjatuh}",
        nip: "{nip_pejabat_penjatuh}",
      }),
      ...tembusan("Tembusan:", ["Atasan langsung yang bersangkutan;", "Arsip."]),
    ],
  },

  // 15 ----------------------------------------------------------------------
  sk_pembebasan_sementara: {
    judul: "Keputusan Pembebasan Sementara dari Tugas Jabatan",
    isi: () => {
      const tentang = (bold = true): TextRun[] => [
        r("PEMBEBASAN SEMENTARA DARI TUGAS JABATAN A.N. ", { bold }),
        r("{nama_terperiksa}", { bold }),
      ];
      return [
        ...kop(),
        ...kepalaKeputusan("Rektor", "{nomor_surat}", tentang()),
        tabelDiktum(konsiderans()),
        judul("MEMUTUSKAN:", { before: 240, after: 240 }),
        tabelDiktum([
          [
            "Menetapkan",
            [pd([r("KEPUTUSAN REKTOR {nama_instansi}", { caps: true }), r(" TENTANG "), ...tentang(false), r(".")], { align: "left" })],
          ],
          [
            "KESATU",
            [
              p("Membebaskan sementara dari tugas jabatannya:", { after: 60 }),
              tabelLabel(IDENTITAS, { lebar: LEBAR_ISI_DIKTUM(), label: 2800 }),
              pd(
                "terhitung sejak tanggal Keputusan ini ditetapkan sampai dengan ditetapkannya keputusan hukuman disiplin.",
                { before: 60 },
              ),
            ],
          ],
          [
            "KEDUA",
            [
              pd(
                "Selama dibebaskan sementara dari tugas jabatannya, yang bersangkutan tetap masuk kerja dan tetap diberikan hak-hak kepegawaiannya sesuai dengan ketentuan peraturan perundang-undangan.",
              ),
            ],
          ],
          ["KETIGA", [pd("Keputusan ini mulai berlaku pada tanggal ditetapkan.")]],
        ]),
        p("", { after: 240 }),
        ttdKanan(TTD_REKTOR("ditetapkan")),
        ...tembusan("Salinan Keputusan ini disampaikan kepada:", [
          "Yang bersangkutan;",
          "Atasan langsung yang bersangkutan;",
          "Unit pengelola kepegawaian.",
        ]),
      ];
    },
  },

  // 16 ----------------------------------------------------------------------
  lapor_sekjen: {
    judul: "Surat Pelaporan Pembentukan Tim Pemeriksa",
    isi: () => [
      ...kop(),
      kepalaSurat("Laporan Pembentukan Tim Pemeriksa"),
      p("", { after: 120 }),
      p("Yth. Sekretaris Jenderal", { align: "left" }),
      p("{nama_kementerian}", { align: "left" }),
      p("c.q. Kepala Biro Organisasi dan Sumber Daya Manusia", { align: "left", after: 240 }),
      p(
        "Dengan hormat, kami laporkan bahwa {nama_instansi} telah membentuk Tim Pemeriksa atas dugaan pelanggaran disiplin yang dilakukan oleh:",
        { after: 120 },
      ),
      tabelLabel(IDENTITAS, { inden: INDEN }),
      p(
        "berdasarkan Keputusan {pejabat_pembentuk_tim} {nama_instansi} Nomor {nomor_sk_tim} tanggal {tanggal_sk_tim} tentang Pembentukan Tim Pemeriksa atas Dugaan Pelanggaran Disiplin a.n. {nama_terperiksa}.",
        { before: 120, after: 120 },
      ),
      p("Bersama ini kami lampirkan salinan Keputusan tersebut sebagai bahan laporan.", { after: 120 }),
      p("Demikian laporan ini kami sampaikan, atas perhatian Bapak/Ibu diucapkan terima kasih.", { after: 360 }),
      ttdKanan(TTD_REKTOR()),
    ],
  },

  // 17 ----------------------------------------------------------------------
  persetujuan_rekam: {
    judul: "Surat Persetujuan Perekaman Pemeriksaan",
    isi: () => {
      const kotak = (teks: string, tebal: string) =>
        p([r("☐", { font: "Segoe UI Symbol", size: 14 }), r("\t"), r(tebal, { bold: true }), r(teks)], {
          left: INDEN * 2,
          hanging: INDEN,
          tabs: [{ pos: INDEN * 2 }],
          after: 120,
          align: "left",
        });
      return [
        ...kop(),
        judul("SURAT PERSETUJUAN PEREKAMAN PEMERIKSAAN", { underline: true, after: 360 }),
        p("Yang bertanda tangan di bawah ini:", { after: 120 }),
        tabelLabel(IDENTITAS, { inden: INDEN }),
        p(
          "selaku terperiksa dalam pemeriksaan atas dugaan pelanggaran disiplin yang dilaksanakan oleh Tim Pemeriksa pada hari {hari_pemeriksaan}, tanggal {tanggal_pemeriksaan}, bertempat di {tempat_pemeriksaan}, telah menerima penjelasan dari Tim Pemeriksa mengenai perekaman (audio/video) jalannya pemeriksaan sebagai berikut:",
          { before: 120, after: 120 },
        ),
        butir("1.", [
          r("Tujuan. ", { bold: true }),
          r(
            "Rekaman digunakan semata-mata sebagai cadangan bukti untuk menjamin keakuratan isi Berita Acara Pemeriksaan.",
          ),
        ]),
        butir("2.", [
          r("Akses. ", { bold: true }),
          r(
            "Rekaman bersifat rahasia dan hanya dapat diakses secara terbatas oleh Tim Pemeriksa dan pejabat yang berwenang.",
          ),
        ]),
        butir("3.", [
          r("Penyimpanan dan penghapusan. ", { bold: true }),
          r(
            "Rekaman disimpan secara aman dan dihapus secara otomatis setelah berakhirnya jangka waktu retensi yang ditetapkan, terhitung sejak kasus selesai atau dihentikan.",
          ),
        ]),
        butir("4.", [
          r("Hak terperiksa. ", { bold: true }),
          r("Terperiksa berhak mengajukan permintaan salinan rekaman pemeriksaan atas dirinya."),
        ]),
        butir(
          "5.",
          [
            r("Penolakan. ", { bold: true }),
            r(
              "Terperiksa berhak menolak perekaman. Penolakan tidak akan dianggap sebagai hal yang memberatkan dan tidak memengaruhi hak-hak terperiksa; pemeriksaan tetap dilanjutkan dengan pencatatan dalam Berita Acara Pemeriksaan.",
            ),
          ],
          { after: 120 },
        ),
        p(
          "Setelah memahami penjelasan tersebut, dengan ini saya menyatakan (beri tanda centang pada salah satu kotak):",
          { after: 120 },
        ),
        kotak(" pemeriksaan terhadap diri saya direkam.", "MENYETUJUI"),
        kotak(" pemeriksaan terhadap diri saya direkam.", "TIDAK MENYETUJUI"),
        p("Demikian pernyataan ini saya buat dengan sadar dan tanpa paksaan dari pihak mana pun.", {
          before: 120,
          after: 240,
        }),
        p("{tempat_surat}, {tanggal_surat_panjang}", { align: "right", after: 120, keepNext: true }),
        ttdDua(
          { jabatan: ["Saksi,", "Ketua Tim Pemeriksa,"], nama: "{nama_ketua_tim}", nip: "{nip_ketua_tim}" },
          { jabatan: ["", "Terperiksa,"], nama: "{nama_terperiksa}", nip: "{nip_terperiksa}" },
        ),
      ];
    },
  },
};

// --- blok bersama LHP ------------------------------------------------------

/** Judul bab bernomor romawi + isinya. */
function bab(no: string, nama: string, isi: (Paragraph | Table)[]): (Paragraph | Table)[] {
  return [butir(no, nama, { bold: true, before: 120, after: 60, keepNext: true, align: "left" }), ...isi];
}

function analisis(): Paragraph[] {
  return [
    lanjut(
      "Berdasarkan fakta tersebut, Tim Pemeriksa berpendapat bahwa terperiksa terbukti melanggar {pasal_dilanggar} {nama_regulasi}.",
    ),
    lanjut("Hal-hal yang memberatkan:", { bold: true, before: 60 }),
    lanjut("{faktor_memberatkan}"),
    lanjut("Hal-hal yang meringankan:", { bold: true, before: 60 }),
    lanjut("{faktor_meringankan}"),
  ];
}

function ttdTim(): (Paragraph | Table)[] {
  return [
    p("{tempat_surat}, {tanggal_surat_panjang}", { align: "right", keepNext: true }),
    judul("Tim Pemeriksa,", { before: 120, after: 120, keepNext: true }),
    ttdDua(
      { jabatan: ["Sekretaris,"], nama: "{nama_sekretaris_tim}", nip: "{nip_sekretaris_tim}" },
      { jabatan: ["Ketua,"], nama: "{nama_ketua_tim}", nip: "{nip_ketua_tim}" },
    ),
  ];
}

// ---------------------------------------------------------------------------
// Dokumen
// ---------------------------------------------------------------------------
function buatDokumen(kode: string, k: Konten): Document {
  W = k.landscape ? LEBAR_LANSKAP : LEBAR_POTRET;
  const children = k.isi();
  return new Document({
    title: k.judul,
    subject: "Template SIMPEL",
    creator: "SIMPEL - Universitas Negeri Malang",
    description: `Template ${kode} untuk docxtemplater SIMPEL.`,
    // Baris yang diakhiri ganti-baris manual (linebreaks docxtemplater) tidak direnggangkan.
    compatibility: { doNotExpandShiftReturn: true },
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 24, language: { value: "id-ID" } },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_LEBAR,
              height: A4_TINGGI,
              orientation: k.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: { ...MARGIN, header: 567, footer: 567 },
          },
        },
        headers: {
          default: new Header({
            children: [p([r("RAHASIA", { bold: true, color: "C00000", size: 10 })], { align: "right" })],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: ["Halaman ", PageNumber.CURRENT, " dari ", PageNumber.TOTAL_PAGES],
                    size: 18,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

async function main() {
  fs.mkdirSync(DIR_KELUAR, { recursive: true });
  let gagal = 0;
  for (const t of TEMPLATE_AWAL) {
    const k = KONTEN[t.kode];
    if (!k) {
      console.error(`✗ ${t.kode}: konten belum didefinisikan`);
      gagal++;
      continue;
    }
    const buf = await Packer.toBuffer(buatDokumen(t.kode, k));
    const tujuan = path.join(DIR_KELUAR, `${t.kode}.docx`);
    fs.writeFileSync(tujuan, buf);
    console.log(`✓ ${path.relative(ROOT, tujuan)} (${(buf.length / 1024).toFixed(1)} KB)`);
  }
  if (gagal) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
