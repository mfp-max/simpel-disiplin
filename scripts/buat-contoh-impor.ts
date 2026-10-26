// Membuat berkas contoh format impor pegawai: public/contoh-format-impor-pegawai.xlsx
// Pakai: npx tsx scripts/buat-contoh-impor.ts
//
// Nama kolom sengaja sama dengan yang ditebak otomatis oleh lib/simpega/normalisasi.ts (tebakPemetaan),
// sehingga langkah "Pemetaan" langsung terisi. Lembar pertama dibaca impor; lembar lain hanya petunjuk.
import * as path from "node:path";
import ExcelJS from "exceljs";
import { FIELD_PEGAWAI, KOLOM_TERLARANG, tebakPemetaan } from "../lib/simpega/normalisasi";
import { PEMETAAN_STATUS } from "../supabase/seed/referensi";

type Kolom = { header: string; field: string; lebar: number; teks?: boolean; wajib?: boolean; ket: string; contoh: [string, string, string] };

// Urutan penting: "Unit Kerja" harus sebelum "Jabatan Tambahan" (kolom berulang dibaca dari jangkar di kirinya).
const KOLOM: Kolom[] = [
  { header: "NIP", field: "nip", lebar: 22, teks: true, ket: "18 digit tanpa spasi. Kosongkan bila tidak punya NIP. Kolom berformat Teks agar angka tidak berubah.", contoh: ["198503122010121003", "199107082019032015", ""] },
  { header: "NIP Lama", field: "nip_lama", lebar: 14, teks: true, ket: "Opsional (NIP 9 digit lama).", contoh: ["", "", ""] },
  { header: "Nama Lengkap Dengan Gelar", field: "nama_lengkap_gelar", lebar: 34, wajib: true, ket: "WAJIB. Nama seperti di SK, lengkap dengan gelar.", contoh: ["Dr. Budi Santoso, M.Pd.", "Siti Rahmawati, S.E.", "Andi Prasetyo, S.Kom."] },
  { header: "Nama Lengkap Tanpa Gelar", field: "nama_tanpa_gelar", lebar: 26, ket: "Opsional.", contoh: ["Budi Santoso", "Siti Rahmawati", "Andi Prasetyo"] },
  { header: "Jenis Kelamin", field: "jenis_kelamin", lebar: 13, ket: "L atau P.", contoh: ["L", "P", "L"] },
  { header: "Tempat Lahir", field: "tempat_lahir", lebar: 16, ket: "Opsional.", contoh: ["Malang", "Blitar", "Kediri"] },
  { header: "Tanggal Lahir", field: "tanggal_lahir", lebar: 14, teks: true, ket: "Format DD-MM-YYYY, mis. 12-03-1985. Dipakai mencocokkan pegawai tanpa NIP.", contoh: ["12-03-1985", "08-07-1991", "21-11-1994"] },
  { header: "Email Resmi", field: "email_resmi", lebar: 30, ket: "Email @um.ac.id. Jangan email pribadi.", contoh: ["budi.santoso@um.ac.id", "siti.rahmawati@um.ac.id", ""] },
  { header: "Status Pegawai", field: "status_pegawai", lebar: 18, ket: "Menentukan peraturan disiplin otomatis: PNS/CPNS → PP 94/2021; PTNA/CPTNA → Peraturan Rektor 70/2026. Lihat lembar Petunjuk.", contoh: ["PNS", "PTNA", "PPPK"] },
  { header: "Jenis Pegawai", field: "jenis_pegawai", lebar: 20, ket: "Mis. Dosen / Tenaga Kependidikan.", contoh: ["Dosen", "Tenaga Kependidikan", "Tenaga Kependidikan"] },
  { header: "Kelompok Jabatan", field: "kelompok_jabatan", lebar: 18, ket: "Opsional.", contoh: ["Fungsional", "Pelaksana", "Fungsional"] },
  { header: "Golongan Pangkat", field: "golongan_pangkat", lebar: 26, ket: "Format: Pangkat, golongan — mis. Penata, III/c. Dipakai membandingkan jenjang Tim Pemeriksa.", contoh: ["Pembina, IV/a", "Penata Muda Tingkat I, III/b", "Ahli Pertama, IX"] },
  { header: "TMT Golongan", field: "tmt_golongan", lebar: 14, teks: true, ket: "DD-MM-YYYY.", contoh: ["01-04-2022", "01-10-2023", "01-03-2024"] },
  { header: "Jabatan Fungsional", field: "jabatan_fungsional", lebar: 30, ket: "Mis. Lektor, Asisten Ahli, Pengadministrasi Umum.", contoh: ["Lektor Kepala", "Pengelola Keuangan", "Pranata Komputer Ahli Pertama"] },
  { header: "TMT Jabatan Fungsional", field: "tmt_jabatan_fungsional", lebar: 14, teks: true, ket: "DD-MM-YYYY.", contoh: ["01-06-2021", "02-01-2020", "01-03-2024"] },
  { header: "Unit Kerja", field: "unit_kerja", lebar: 34, ket: "Unit kerja langsung (departemen/subbagian/seksi).", contoh: ["Departemen Pendidikan Luar Sekolah", "Subbagian Keuangan FE", "Pusat TIK"] },
  { header: "Subag Unit Kerja", field: "subag_unit_kerja", lebar: 22, ket: "Opsional.", contoh: ["", "Subbagian Keuangan", ""] },
  { header: "Unit Kerja Induk", field: "unit_kerja_induk", lebar: 28, ket: "Opsional.", contoh: ["Fakultas Ilmu Pendidikan", "Fakultas Ekonomi dan Bisnis", "Direktorat TIK"] },
  { header: "Direktorat Fakultas", field: "direktorat_fakultas", lebar: 30, ket: "Fakultas/direktorat — dipakai Laporan per unit.", contoh: ["Fakultas Ilmu Pendidikan", "Fakultas Ekonomi dan Bisnis", "Direktorat TIK"] },
  { header: "Jabatan Tambahan", field: "jabatan_tambahan", lebar: 28, ket: "Jabatan struktural/tugas tambahan bila ada, mis. Ketua Departemen.", contoh: ["Ketua Departemen", "", ""] },
  { header: "NIP Pejabat Penilai", field: "pejabat_penilai_nip", lebar: 22, teks: true, ket: "NIP atasan langsung. Dipakai di surat (atasan langsung) dan dibekukan di riwayat kasus.", contoh: ["196805171993031002", "198001012005011004", "197505102000031001"] },
  { header: "NIP Atasan Pejabat Penilai", field: "atasan_pejabat_penilai_nip", lebar: 24, teks: true, ket: "Opsional. NIP atasan dari atasan langsung.", contoh: ["196504121990031001", "196805171993031002", ""] },
  { header: "Tanggal Masuk", field: "tanggal_masuk", lebar: 14, teks: true, ket: "DD-MM-YYYY. Opsional.", contoh: ["01-12-2010", "01-03-2019", "01-03-2024"] },
  { header: "Tanggal Keluar", field: "tanggal_keluar", lebar: 14, teks: true, ket: "DD-MM-YYYY. Isi hanya bila sudah pensiun/berhenti.", contoh: ["", "", ""] },
];

async function main() {
  // Pastikan setiap kolom memang terbaca otomatis oleh impor.
  const tebak = tebakPemetaan(KOLOM.map((k) => k.header));
  const salah = KOLOM.filter((k, i) => tebak[i] !== k.field);
  if (salah.length) throw new Error(`Header tidak terpetakan otomatis: ${salah.map((k) => k.header).join(", ")}`);
  const kurang = FIELD_PEGAWAI.filter((f) => !KOLOM.some((k) => k.field === f.kode));
  if (kurang.length) throw new Error(`Field belum ada di contoh: ${kurang.map((f) => f.kode).join(", ")}`);

  const wb = new ExcelJS.Workbook();
  wb.creator = "SIMPEL UM";
  const BIRU = "FF1E3A8A", KUNING = "FFFEF3C7", ABU = "FFF1F5F9";

  // Lembar 1 — diisi & diunggah
  const ws = wb.addWorksheet("Data Pegawai", { views: [{ state: "frozen", ySplit: 1, xSplit: 3 }] });
  ws.columns = KOLOM.map((k) => ({ header: k.header, key: k.field, width: k.lebar, style: k.teks ? { numFmt: "@" } : {} }));
  const kepala = ws.getRow(1);
  kepala.height = 34;
  kepala.eachCell((c, i) => {
    const k = KOLOM[i - 1];
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: k.wajib ? "FFB91C1C" : BIRU } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.note = { texts: [{ text: k.ket }] };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: KOLOM.length } };
  const kol = (field: string) => ws.getColumn(field).letter;
  // dataValidations ada di ExcelJS tetapi belum ada di definisi tipenya.
  const validasi = (ws as unknown as { dataValidations: { add: (range: string, v: ExcelJS.DataValidation) => void } }).dataValidations;
  validasi.add(`${kol("jenis_kelamin")}2:${kol("jenis_kelamin")}5000`, {
    type: "list", allowBlank: true, formulae: ['"L,P"'], showErrorMessage: true, errorTitle: "Jenis kelamin", error: "Isi L atau P.",
  });
  validasi.add(`${kol("status_pegawai")}2:${kol("status_pegawai")}5000`, {
    type: "list", allowBlank: true, formulae: [`"${PEMETAAN_STATUS.map((s) => s.status_pegawai).join(",")}"`],
    showErrorMessage: true, errorStyle: "warning", errorTitle: "Status belum dikenal",
    error: "Status ini belum ada di Pengaturan → Pemetaan status pegawai. Boleh tetap dipakai; rezimnya perlu diverifikasi.",
  });

  // Lembar 2 — petunjuk
  const pt = wb.addWorksheet("Petunjuk");
  pt.columns = [{ width: 4 }, { width: 110 }];
  const judul = (t: string) => { const r = pt.addRow(["", t]); r.font = { bold: true, size: 13, color: { argb: BIRU } }; r.height = 22; };
  const baris = (t: string) => { const r = pt.addRow(["•", t]); r.alignment = { wrapText: true, vertical: "top" }; };
  judul("CARA MENGISI");
  baris("Isi data di lembar pertama \"Data Pegawai\" (hanya lembar pertama yang dibaca). Satu baris = satu pegawai. Jangan mengubah atau menghapus baris judul.");
  baris("Kolom merah (Nama Lengkap Dengan Gelar) WAJIB. Kolom lain boleh kosong, tetapi makin lengkap makin akurat (peraturan otomatis, atasan langsung, jenjang Tim Pemeriksa, laporan per unit).");
  baris("NIP dan tanggal ditulis sebagai teks: NIP 18 digit tanpa spasi; tanggal DD-MM-YYYY (mis. 12-03-1985). Kolom-kolom tersebut sudah berformat Teks.");
  baris("Golongan Pangkat ditulis \"Pangkat, golongan\", mis. \"Penata, III/c\" atau \"Pembina Tingkat I, IV/b\".");
  baris("Arahkan kursor ke judul kolom untuk melihat keterangannya. Lembar \"Contoh Isian\" berisi tiga contoh baris.");
  baris("Boleh juga langsung mengunggah rekap asli Simpega tanpa diubah — kolom akan dipetakan di langkah 3 impor.");
  pt.addRow([]);
  judul("YANG TERJADI SAAT IMPOR");
  baris("Pegawai dicocokkan dengan NIP; bila tanpa NIP, dengan nama + tanggal lahir. Yang sudah ada diperbarui, yang baru ditambahkan.");
  baris("Isian yang pernah disunting manual di SIMPEL tidak ditimpa impor. Riwayat kasus lama TIDAK berubah walau jabatan/pangkat diperbarui.");
  baris("Baris bermasalah (NIP bukan angka, tanggal salah, NIP ganda) ditolak dan ditampilkan alasannya; baris lain tetap diimpor.");
  baris("Pegawai yang sudah pensiun sebelum SIMPEL dipakai cukup ditambahkan lewat Pegawai → Tambah manual.");
  pt.addRow([]);
  judul("JANGAN DIMASUKKAN (data pribadi — UU 27/2022; ditolak otomatis bila ada)");
  baris(KOLOM_TERLARANG.join(", ") + ".");
  pt.addRow([]);
  judul("STATUS PEGAWAI YANG DIKENALI");
  const h = pt.addRow(["", "Status — peraturan disiplin yang dipakai"]);
  h.font = { bold: true };
  for (const s of PEMETAAN_STATUS) {
    const reg = s.rezim_kode === "A" ? "PP 94/2021 (ASN/PNS)" : s.rezim_kode === "B" ? "Peraturan Rektor UM 70/2026 (pegawai tetap non-ASN)" : "perlu verifikasi dasar hukum";
    const r = pt.addRow(["", `${s.status_pegawai} — ${reg}. ${s.keterangan}`]);
    r.alignment = { wrapText: true };
  }
  baris("Status lain tetap diterima; rezimnya ditandai \"perlu verifikasi\" dan bisa diatur di Pengaturan → Pemetaan status pegawai.");

  // Lembar 3 — contoh
  const ct = wb.addWorksheet("Contoh Isian", { views: [{ state: "frozen", ySplit: 1, xSplit: 3 }] });
  ct.columns = KOLOM.map((k) => ({ header: k.header, key: k.field, width: k.lebar, style: k.teks ? { numFmt: "@" } : {} }));
  ct.getRow(1).eachCell((c, i) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: KOLOM[i - 1].wajib ? "FFB91C1C" : BIRU } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ct.getRow(1).height = 34;
  for (let i = 0; i < 3; i++) {
    const r = ct.addRow(Object.fromEntries(KOLOM.map((k) => [k.field, k.contoh[i]])));
    r.eachCell({ includeEmpty: true }, (c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 ? ABU : KUNING } }));
  }
  const cat = ct.addRow(["Contoh fiktif — salin formatnya ke lembar \"Data Pegawai\". Lembar ini tidak ikut diimpor."]);
  cat.font = { italic: true, color: { argb: "FF64748B" } };

  const keluar = path.resolve(__dirname, "..", "public", "contoh-format-impor-pegawai.xlsx");
  await wb.xlsx.writeFile(keluar);
  console.log(`✓ ${path.relative(process.cwd(), keluar)} (${KOLOM.length} kolom, semuanya terpetakan otomatis)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
