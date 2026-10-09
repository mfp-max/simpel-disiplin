import "server-only";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { sql, type Sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { GalatPengguna } from "@/lib/galat";
import { buatKasus, catatHukuman, segarkanTenggat, selaraskanStatus, selesaikanTahap, tambahPelanggaran } from "@/lib/kasus";
import { ambilPegawai, nomorRegistrasi, peringkatGolongan, snapshotPegawai } from "@/lib/entri";
import { ambilRegulasi, muatAturan, muatKalender, snapshotRegulasi } from "@/lib/regulasi";
import { hitungTanggalTenggat, validasiTim } from "@/lib/hukdis/mesin";
import { konteksDokumen } from "@/lib/dokumen/konteks";
import { MIME_DOCX, judulDokumen, muatKatalog, siapkanDokumen, susunData, type VersiTemplate } from "@/lib/dokumen/buat";
import { isiTemplate } from "@/lib/dokumen/template";
import { tanggalPanjang } from "@/lib/format";
import { hapusBerkas, namaAman, unduhBerkas, unggahBerkas } from "@/lib/penyimpanan";
import { daftarQa, isiPertanyaanAwal, simpanJawaban, sisipkanPertanyaan } from "@/app/(app)/kasus/[id]/sidang/_qa";

// Data simulasi alur SIMPEL untuk pelatihan & uji coba (Pengaturan → Data simulasi).
//
// Setiap langkah memakai fungsi yang sama dengan tombol di aplikasi (lib/kasus, lib/dokumen,
// pertanyaan baku mode sidang) dan tercatat di log audit. Semua entri ditandai
// data_tambahan.simulasi = "S1".."S16", sehingga dapat diarsipkan sekaligus.
// Pegawai diambil dari master pegawai; tiap skenario memakai pegawai yang belum dipakai
// skenario lain. Satu skenario = satu transaksi: bila gagal, tidak ada data yang tertinggal.

export type Penyimpanan = {
  unggah: (path: string, isi: Buffer, mime: string) => Promise<void>;
  unduh: (path: string) => Promise<Buffer>;
  hapus: (paths: string[]) => Promise<void>;
};
const penyimpananSupabase: Penyimpanan = {
  unggah: async (p, isi, mime) => void (await unggahBerkas(p, isi, mime)),
  unduh: unduhBerkas,
  hapus: async (p) => void (await hapusBerkas(p)),
};

export type Pengguna = { id: string; email: string; nama: string };
type Pg = { id: string; nip: string; nama_lengkap_gelar: string; golongan_ruang: string | null; jabatan: string | null; unit_kerja: string | null };
type Kasus = { id: string; nomor: string; kode: string; urutDok: number; isian: Record<string, string> };

type Konteks = {
  P: Pengguna;
  st: Penyimpanan;
  log: (s: string) => void;
  salin?: (kode: string, nama: string, isi: Buffer) => void;
  unggahan: string[];
  template: Map<string, Buffer>;
};
let C: Konteks;
const log = (s: string) => C.log(s);

// ------------------------------------------------------------------ berkas pendukung (PDF & Excel)
function pdf(judul: string, baris: string[]): Buffer {
  const esc = (s: string) => s.normalize("NFKD").replace(/[–—]/g, "-").replace(/[^\x20-\x7e]/g, "").replace(/[\\()]/g, (m) => `\\${m}`);
  const semua: string[] = [];
  for (const par of baris.join("\n").split("\n")) {
    let x = "";
    for (const w of par.split(" ")) {
      if ((x + " " + w).trim().length > 88) {
        semua.push(x);
        x = w;
      } else x = (x + " " + w).trim();
    }
    semua.push(x);
  }
  const halaman: string[][] = [];
  for (let i = 0; i < semua.length; i += 46) halaman.push(semua.slice(i, i + 46));
  const obj: string[] = [];
  const kids: number[] = [];
  obj[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  obj[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  obj[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  let n = 5;
  halaman.forEach((h, i) => {
    let s = `BT /F2 13 Tf 56 790 Td (${esc(judul)}) Tj ET\n0.6 G 56 778 m 539 778 l S 0 G\n`;
    s += `BT /F1 10.5 Tf 15 TL 56 760 Td\n${h.map((b) => `(${esc(b)}) '`).join("\n")}\nET\n`;
    s += `BT /F1 8 Tf 56 40 Td (Berkas simulasi SIMPEL - halaman ${i + 1}/${halaman.length}) Tj ET`;
    obj[n] = `<< /Length ${Buffer.byteLength(s, "latin1")} >>\nstream\n${s}\nendstream`;
    obj[n + 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${n} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`;
    kids.push(n + 1);
    n += 2;
  });
  obj[2] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const off: number[] = [];
  for (let i = 1; i < obj.length; i++) {
    off[i] = Buffer.byteLength(out, "latin1");
    out += `${i} 0 obj\n${obj[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${obj.length}\n0000000000 65535 f \n${off.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${obj.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

async function xlsx(judul: string, kepala: string[], baris: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRow([judul]).font = { bold: true, size: 13 };
  ws.addRow([]);
  ws.addRow(kepala).font = { bold: true };
  for (const b of baris) ws.addRow(b);
  ws.columns.forEach((c) => (c.width = 26));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function xlsxPresensi(pg: Pg, tahun: number, tmk: Record<number, number>) {
  const baris = BULAN.map((b, i) => [b, 21, 21 - (tmk[i + 1] ?? 0) - (i % 4 === 0 ? 1 : 0), tmk[i + 1] ?? 0, i % 4 === 0 ? 1 : 0]);
  baris.push(["Jumlah", "", "", Object.values(tmk).reduce((a, b) => a + b, 0), ""]);
  return xlsx(`REKAP PRESENSI ${pg.nama_lengkap_gelar} (NIP ${pg.nip}) TAHUN ${tahun}`, ["Bulan", "Hari kerja", "Hadir", "Tanpa keterangan (TMK)", "Cuti/izin"], baris);
}

// ------------------------------------------------------------------ langkah (meniru tombol aplikasi)
async function berkas(tx: Sql, entriId: string, nama: string, isi: Buffer, mime: string, kategori: string, o: { tanggal: string; keterangan?: string; teks?: string }) {
  const p = `entri/${entriId}/berkas/${Date.now()}-${namaAman(nama)}`;
  await C.st.unggah(p, isi, mime);
  C.unggahan.push(p);
  const [b] = await tx`insert into berkas (entri_id, nama_file, file_path, mime, ukuran, kategori, keterangan, teks_ocr, created_at, created_by, updated_by)
    values (${entriId}, ${nama}, ${p}, ${mime}, ${isi.length}, ${kategori}, ${o.keterangan ?? null}, ${o.teks ?? null},
      ${`${o.tanggal} 10:00:00+07`}, ${C.P.id}, ${C.P.id}) returning id`;
  await catatAudit(C.P, { aksi: "buat", tabel: "berkas", record_id: b.id, entri_id: entriId, ringkasan: { nama_file: nama, kategori, simulasi: true } }, tx);
  log(`     📎 ${nama}`);
}

async function tahapId(tx: Sql, entriId: string, kode: string) {
  const [t] = await tx`select id from tahapan_kasus where entri_id = ${entriId} and kode_tahap = ${kode} order by urutan limit 1`;
  if (!t) throw new Error(`Tahap "${kode}" tidak ada pada kasus ini`);
  return t.id as string;
}

async function adaTahap(tx: Sql, entriId: string, kode: string) {
  return (await tx`select 1 from tahapan_kasus where entri_id = ${entriId} and kode_tahap = ${kode}`).length > 0;
}

async function selesai(tx: Sql, entriId: string, kode: string, tanggal: string) {
  const id = await tahapId(tx, entriId, kode);
  await selesaikanTahap(tx, id, tanggal, C.P.id);
  await catatAudit(C.P, { aksi: "ubah", tabel: "tahapan_kasus", record_id: id, entri_id: entriId, ringkasan: { tahap: kode, status: "selesai", tanggal_realisasi: tanggal, simulasi: true } }, tx);
}

async function aturTahap(tx: Sql, entriId: string, kode: string, status: "berjalan" | "dilewati", alasan?: string) {
  if (!(await adaTahap(tx, entriId, kode))) return;
  const id = await tahapId(tx, entriId, kode);
  await tx`update tahapan_kasus set status = ${status},
      catatan = case when ${alasan ?? null}::text is null then catatan else trim(both from coalesce(catatan, '') || ${`\n[${status}] ${alasan ?? ""}`}) end,
      updated_by = ${C.P.id} where id = ${id}`;
  await selaraskanStatus(tx, entriId);
  await segarkanTenggat(tx, entriId);
  await catatAudit(C.P, { aksi: "ubah", tabel: "tahapan_kasus", record_id: id, entri_id: entriId, alasan, ringkasan: { tahap: kode, status, simulasi: true } }, tx);
}

async function rencana(tx: Sql, entriId: string, kode: string, tanggal: string) {
  await tx`update tahapan_kasus set tanggal_rencana = ${tanggal}, updated_by = ${C.P.id} where id = ${await tahapId(tx, entriId, kode)}`;
  await segarkanTenggat(tx, entriId);
}

async function tim(tx: Sql, entriId: string, m: { nomorSk: string; tanggalSk: string; pembentuk?: string; anggota: [Pg, string, string][] }) {
  const [e] = await tx`select regulasi_id, snapshot_pegawai from entri where id = ${entriId}`;
  const [t] = await tx`insert into tim_pemeriksa (entri_id, jenis, nomor_sk, tanggal_sk, pejabat_pembentuk, created_by, updated_by)
    values (${entriId}, 'um', ${m.nomorSk}, ${m.tanggalSk}, ${m.pembentuk ?? "Rektor"}, ${C.P.id}, ${C.P.id}) returning id`;
  await catatAudit(C.P, { aksi: "buat", tabel: "tim_pemeriksa", record_id: t.id, entri_id: entriId, ringkasan: { nomor_sk: m.nomorSk, tanggal_sk: m.tanggalSk, simulasi: true } }, tx);
  const peringkat = await peringkatGolongan(tx);
  const aturan = await muatAturan(e.regulasi_id, tx);
  const golT = String(e.snapshot_pegawai?.golongan_ruang ?? "").toUpperCase();
  for (const [i, [pg, unsur, jab]] of m.anggota.entries()) {
    const gol = (pg.golongan_ruang ?? "").toUpperCase();
    const v = validasiTim(aturan, [{ nama: pg.nama_lengkap_gelar, unsur, jabatan_dalam_tim: jab, peringkat: peringkat.get(gol) ?? null }], peringkat.get(golT) ?? null);
    if (v.galat.length) throw new Error(`Anggota tim ditolak aturan: ${v.galat.join(" ")}`);
    const [a] = await tx`insert into anggota_tim (tim_id, pegawai_id, golongan_ruang, unsur, jabatan_dalam_tim, pernyataan_bebas_konflik, eselon_setara, urutan, created_by, updated_by)
      values (${t.id}, ${pg.id}, ${gol || null}, ${unsur}, ${jab}, true, ${peringkat.get(gol) ?? null}, ${i + 1}, ${C.P.id}, ${C.P.id}) returning id`;
    await catatAudit(C.P, { aksi: "buat", tabel: "anggota_tim", record_id: a.id, entri_id: entriId, ringkasan: { nama: pg.nama_lengkap_gelar, unsur, jabatan_dalam_tim: jab, simulasi: true } }, tx);
  }
  log(`     👥 Tim Pemeriksa (SK ${m.nomorSk}): ${m.anggota.map(([p, , j]) => `${j} ${p.nama_lengkap_gelar}`).join("; ")}`);
}

/** Sama dengan "Jadwalkan pemeriksaan" di panel kasus: sesi direncanakan + tanggal rencana tahap pemeriksaan. */
async function jadwal(tx: Sql, entriId: string, m: { tanggal: string; jam: string; tempat?: string }) {
  const [{ n }] = await tx`select coalesce(max(urutan), 0)::int + 1 as n from sesi_pemeriksaan where entri_id = ${entriId}`;
  const [s] = await tx`insert into sesi_pemeriksaan (entri_id, urutan, status, tanggal, jam_mulai, tempat, moda, notulis_user_id, created_by, updated_by)
    values (${entriId}, ${n}, 'direncanakan', ${m.tanggal}, ${m.jam}, ${m.tempat ?? RUANG}, 'tatap_muka', ${C.P.id}, ${C.P.id}, ${C.P.id}) returning id`;
  await catatAudit(C.P, { aksi: "buat", tabel: "sesi_pemeriksaan", record_id: s.id, entri_id: entriId, ringkasan: { urutan: n, tanggal: m.tanggal, jam: m.jam, tempat: m.tempat ?? RUANG, simulasi: true } }, tx);
  if (n === 1) await rencana(tx, entriId, "pemeriksaan", m.tanggal);
  log(`     🗓  Pemeriksaan dijadwalkan ${m.tanggal} pukul ${m.jam}${n > 1 ? ` (sesi ke-${n})` : ""}`);
  return s.id as string;
}

const URUTAN_BAKU = new Map<string, number>();
/** Mode sidang: terperiksa hadir/tidak, persetujuan rekam, tanya-jawab dari pertanyaan baku + tambahan, sesi selesai. */
async function laksana(tx: Sql, entriId: string, sesiId: string, m: { selesai: string; hadir: boolean; rekam?: boolean; jawaban?: Record<number, string>; tambahan?: [string, string][] }) {
  const [s] = await tx`update sesi_pemeriksaan set status = 'selesai', terperiksa_hadir = ${m.hadir}, jam_selesai = ${m.selesai},
      mulai_pada = (tanggal + jam_mulai) at time zone 'Asia/Jakarta', selesai_pada = (tanggal + ${m.selesai}::time) at time zone 'Asia/Jakarta',
      persetujuan_rekam = ${m.hadir && !!m.rekam}, persetujuan_ditolak = ${m.hadir && !m.rekam}, updated_by = ${C.P.id}
    where id = ${sesiId} returning id, tanggal`;
  await catatAudit(C.P, { aksi: "ubah", tabel: "sesi_pemeriksaan", record_id: sesiId, entri_id: entriId, ringkasan: { status: "selesai", terperiksa_hadir: m.hadir, simulasi: true } }, tx);
  if (!m.hadir) {
    log(`     🪑 Sesi pemeriksaan ${s.tanggal}: terperiksa TIDAK HADIR`);
    return;
  }
  if (!URUTAN_BAKU.size) for (const r of await tx`select pertanyaan, urutan from pertanyaan_baku`) URUTAN_BAKU.set(r.pertanyaan as string, r.urutan as number);
  await isiPertanyaanAwal(tx, sesiId, C.P.id);
  if (m.tambahan?.length) {
    const d0 = await daftarQa(tx, sesiId);
    const akhirSubstansi = d0.filter((b) => b.kategori === "substansi").at(-1)?.urutan ?? null;
    await sisipkanPertanyaan(tx, sesiId, akhirSubstansi, m.tambahan.map(([q]) => q), "tambahan", C.P.id);
  }
  const umum: Record<number, string> = {
    1: "Ya, saya sudah menerima surat panggilan tersebut.",
    2: "Ya, saya memahami.",
    3: "Ya, saya sehat jasmani dan rohani serta bersedia diperiksa.",
    4: "Ya, saya bersedia.",
    5: "Saya diangkat sebagai CPNS dan sejak itu bertugas di unit kerja saya saat ini.",
    6: "Beban tugas cukup banyak dan beberapa kali bertepatan dengan urusan keluarga.",
    7: "Saya berusaha mengatur waktu dan berkoordinasi dengan atasan.",
    8: "Ya, saya mengetahuinya.",
    13: "Ya, saya menyadarinya.",
    14: "Ya, saya siap.",
    15: "Tidak ada. Saya mohon menjadi pertimbangan bahwa saya bersikap kooperatif.",
    16: "Ya, saya bersedia.",
    17: "Ya, tanpa tekanan atau paksaan dari pihak mana pun.",
    ...m.jawaban,
  };
  const tambahan = new Map(m.tambahan ?? []);
  const d = await daftarQa(tx, sesiId);
  await simpanJawaban(tx, sesiId, d.map((b) => {
    const u = URUTAN_BAKU.get(b.pertanyaan);
    return { id: b.id, jawaban: tambahan.get(b.pertanyaan) ?? (u ? umum[u] : undefined) ?? "Ya." };
  }), C.P.id);
  log(`     🪑 Sesi pemeriksaan ${s.tanggal} s.d. ${m.selesai}: ${d.length} tanya-jawab, ${m.rekam ? "direkam (disetujui terperiksa)" : "tanpa rekaman (terperiksa menolak)"}`);
}

const HAL: Record<string, string> = {
  surat_panggilan: "Panggilan untuk Diperiksa",
  lapor_sekjen: "Penyampaian Salinan Keputusan Pembentukan Tim Pemeriksa",
  nota_dinas_kewenangan: "Laporan Kewenangan Penjatuhan Hukuman Disiplin",
  usul_menteri: "Usul Penjatuhan Hukuman Disiplin",
  panggilan_penerimaan_sk: "Panggilan Penerimaan Keputusan Hukuman Disiplin",
};
// Bila Nama/NIP Rektor belum diisi di Pengaturan, dokumen tetap dibuat dengan penanda yang jelas.
const CADANGAN: Record<string, string> = {
  nama_rektor: "[Nama Rektor — isi di Pengaturan → Pengaturan umum]",
  nip_rektor: "[NIP Rektor]",
  nama_pejabat_penjatuh: "[Nama Rektor — isi di Pengaturan → Pengaturan umum]",
  nip_pejabat_penjatuh: "[NIP Rektor]",
  faktor_memberatkan: "-",
  faktor_meringankan: "-",
  // Kasus ringan tanpa Tim Pemeriksa
  pejabat_pembentuk_tim: "-",
  nomor_sk_tim: "-",
  tanggal_sk_tim: "-",
  nama_sekretaris_tim: "-",
  nip_sekretaris_tim: "-",
};

// Konsideran "menimbang" belum ada di kaidah peraturan (aturan_kaidah.konsideran_menimbang); di aplikasi
// diketik pada dialog pembuatan dokumen. Simulasi memakai rumusan lazim per jenis keputusan.
function menimbang(kodeTemplate: string, v: Record<string, unknown>): string | undefined {
  const nama = String(v.nama_terperiksa ?? "");
  const nip = String(v.nip_terperiksa ?? "");
  const reg = String(v.nama_regulasi ?? v.nama_regulasi_singkat ?? "peraturan disiplin pegawai");
  if (kodeTemplate === "sk_tim_pemeriksa") return [
    `bahwa terdapat dugaan pelanggaran disiplin yang dilakukan oleh Saudara ${nama}, NIP ${nip}, berupa ${String(v.judul_kasus ?? "").replace(/^./, (c) => c.toLowerCase())}`,
    `bahwa sesuai ketentuan ${reg}, pemeriksaan terhadap dugaan pelanggaran disiplin yang dapat dijatuhi hukuman disiplin tingkat ${String(v.tingkat_hukuman ?? "sedang")} dilakukan oleh Tim Pemeriksa`,
    "bahwa berdasarkan pertimbangan sebagaimana dimaksud dalam huruf a dan huruf b, perlu menetapkan Keputusan Rektor tentang Pembentukan Tim Pemeriksa",
  ].join("\n");
  if (kodeTemplate === "sk_hukdis") return [
    `bahwa berdasarkan hasil pemeriksaan, Saudara ${nama}, NIP ${nip}, terbukti melakukan pelanggaran terhadap ${String(v.pasal_dilanggar ?? "")} ${reg}`,
    `bahwa untuk menegakkan disiplin, perlu menjatuhkan hukuman disiplin tingkat ${String(v.tingkat_hukuman ?? "")} berupa ${String(v.jenis_hukuman ?? "")}`,
    "bahwa berdasarkan pertimbangan sebagaimana dimaksud dalam huruf a dan huruf b, perlu menetapkan Keputusan tentang Penjatuhan Hukuman Disiplin",
  ].join("\n");
  if (kodeTemplate === "sk_pembebasan_sementara") return [
    `bahwa Saudara ${nama}, NIP ${nip}, sedang menjalani pemeriksaan atas dugaan pelanggaran disiplin yang dapat dijatuhi hukuman disiplin berat`,
    "bahwa untuk kelancaran pemeriksaan, yang bersangkutan perlu dibebaskan sementara dari tugas jabatannya",
    "bahwa berdasarkan pertimbangan sebagaimana dimaksud dalam huruf a dan huruf b, perlu menetapkan Keputusan tentang Pembebasan Sementara dari Tugas Jabatan",
  ].join("\n");
  return undefined;
}

type OpsiDok = { tanggal: string; nomor?: string; final?: boolean; tahap?: string | null; sesiId?: string | null; isian?: Record<string, string> };

/** Sama dengan tombol "Buat dokumen" (lib/dokumen/buat.ts → buatDokumen), di dalam transaksi skenario. */
async function dokumen(tx: Sql, k: Kasus, kodeTemplate: string, o: OpsiDok) {
  const [t] = await tx`select id, nama, jenis_dokumen, versi_aktif_id from template_dokumen where kode = ${kodeTemplate} and aktif and diarsipkan_pada is null`;
  if (!t?.versi_aktif_id) throw new Error(`Template ${kodeTemplate} tidak aktif`);
  const tahapanId = o.tahap === null ? null : o.tahap ? await tahapId(tx, k.id, o.tahap) : undefined;
  const prep = await siapkanDokumen({ entriId: k.id, templateId: t.id, tahapanId, sesiId: o.sesiId, penggunaNama: C.P.nama, db: tx });
  const isian: Record<string, string> = {};
  for (const x of prep.kosong) {
    const v = o.isian?.[x.kode] ?? k.isian[x.kode] ?? (x.kode === "hal_surat" ? HAL[kodeTemplate] : undefined) ?? (x.kode === "menimbang" ? menimbang(kodeTemplate, prep.nilai) : undefined) ?? (x.kode === "tanggal_mulai_berlaku" ? tanggalPanjang(o.tanggal) : undefined) ?? CADANGAN[x.kode];
    if (!v) throw new Error(`Dokumen ${kodeTemplate}: isian "${x.label}" (${x.kode}) belum disiapkan`);
    isian[x.kode] = v;
  }
  const [v] = await tx`select id, versi, file_path, placeholder, pemetaan from template_versi where id = ${t.versi_aktif_id}`;
  const versi = v as unknown as VersiTemplate;
  const konteks = await konteksDokumen(k.id, { sesiId: o.sesiId, tahapanId: prep.tahapanId, penggunaNama: C.P.nama, db: tx });
  const data = susunData(versi, konteks, await muatKatalog(tx), isian, { nomor: o.nomor ?? "", tanggal: o.tanggal });
  if (!C.template.has(versi.file_path)) C.template.set(versi.file_path, await C.st.unduh(versi.file_path));
  const isi = isiTemplate(C.template.get(versi.file_path)!, data);
  const judul = judulDokumen(t.nama, data);

  const [{ n }] = await tx`select coalesce(max(versi), 0)::int + 1 as n from dokumen
    where entri_id = ${k.id} and template_id = ${t.id} and tahapan_id is not distinct from ${prep.tahapanId}`;
  const id = randomUUID();
  const p = `entri/${k.id}/dokumen/${id}-v${n}.docx`;
  await C.st.unggah(p, isi, MIME_DOCX);
  C.unggahan.push(p);
  await tx`insert into dokumen (id, entri_id, tahapan_id, jenis_dokumen, judul, nomor, tanggal, template_id, template_versi_id,
      data_isian, snapshot_data, file_path, versi, status, dibuat_oleh, created_at, created_by, updated_by)
    values (${id}, ${k.id}, ${prep.tahapanId}, ${t.jenis_dokumen}, ${judul}, ${o.nomor || null}, ${o.tanggal}, ${t.id}, ${versi.id},
      ${tx.json({ isian, sesi_id: o.sesiId ?? null } as never)}, ${tx.json(data as never)}, ${p}, ${n}, 'draf', ${C.P.id},
      ${`${o.tanggal} 09:30:00+07`}, ${C.P.id}, ${C.P.id})`;
  await catatAudit(C.P, { aksi: "buat", tabel: "dokumen", record_id: id, entri_id: k.id, ringkasan: { judul, nomor: o.nomor || null, versi: n, status: "draf", template: kodeTemplate, simulasi: true } }, tx);
  if (o.final !== false) {
    await tx`update dokumen set status = 'final', updated_by = ${C.P.id} where id = ${id}`;
    await catatAudit(C.P, { aksi: "ubah", tabel: "dokumen", record_id: id, entri_id: k.id, ringkasan: { status: { sebelum: "draf", sesudah: "final" }, judul, simulasi: true } }, tx);
  }
  k.urutDok += 1;
  C.salin?.(k.kode, `${String(k.urutDok).padStart(2, "0")} ${judul.replace(/[\\/:*?"<>|]+/g, "-")}${o.final === false ? " (DRAF)" : ""}.docx`, isi);
  log(`     📄 ${judul}${o.nomor ? ` — ${o.nomor}` : ""} (${o.final === false ? "DRAF" : "final"}, ${o.tanggal})`);
  return id;
}

async function hukuman(tx: Sql, k: Kasus, m: { jenisKode: string; nomorSk: string; tanggalSk: string; pejabat: string; tanggalDiterima?: string }) {
  const [j] = await tx`select id from jenis_hukuman where regulasi_id = (select regulasi_id from entri where id = ${k.id}) and kode = ${m.jenisKode}`;
  if (!j) throw new Error(`Jenis hukuman ${m.jenisKode} tidak ada`);
  const r = await catatHukuman(tx, k.id, { jenisHukumanId: j.id, nomorSk: m.nomorSk, tanggalSk: m.tanggalSk, pejabatPenjatuh: m.pejabat, tanggalDiterima: m.tanggalDiterima ?? null }, C.P.id);
  if (m.tanggalDiterima) await tx`update tahapan_kasus set tanggal_realisasi = coalesce(tanggal_realisasi, ${m.tanggalDiterima}) where entri_id = ${k.id} and kode_tahap = 'penyampaian_sk'`;
  await segarkanTenggat(tx, k.id);
  await catatAudit(C.P, { aksi: "ubah", tabel: "hukuman", entri_id: k.id, ringkasan: { ...m, tanggal_mulai_berlaku: r.mulai, tanggal_selesai: r.selesai, simulasi: true } }, tx);
  if (m.tanggalDiterima) log(`     ⚖️  Hukuman ${m.jenisKode} (SK ${m.nomorSk}, ${m.tanggalSk}); diterima ${m.tanggalDiterima}, berlaku ${r.mulai ?? "-"} s.d. ${r.selesai ?? "-"}${r.diganti ? " — diganti hukuman pengganti masa transisi" : ""}`);
  return r;
}

async function kehadiran(tx: Sql, pegawaiId: string, tahun: number, tmk: Record<number, number>, berturut?: number) {
  for (const [b, n] of Object.entries(tmk)) {
    await tx`insert into catatan_kehadiran (pegawai_id, tahun, bulan, jumlah_hari, berturut_maks, sumber, keterangan, created_by, updated_by)
      values (${pegawaiId}, ${tahun}, ${Number(b)}, ${n}, ${berturut ?? null}, 'simulasi', 'Data simulasi', ${C.P.id}, ${C.P.id})
      on conflict (pegawai_id, tahun, bulan) do update set jumlah_hari = excluded.jumlah_hari, berturut_maks = excluded.berturut_maks`;
  }
}

async function entriSederhana(tx: Sql, kode: string, m: {
  kelas: "informasi" | "non_hukdis" | "arsip"; judul: string; ringkasan: string; tanggal: string; peristiwa?: string | null; tahun?: number | null;
  pegawai?: Pg | null; namaBebas?: string | null; unitBebas?: string | null; sumber?: string | null; pelapor?: string | null; kontak?: string | null;
  catatan?: string | null; jenisNonHukdis?: string | null; regulasiKode?: string | null; berasalDari?: { id: string } | null; status?: string;
}) {
  const pegawai = m.pegawai ? await ambilPegawai(m.pegawai.id, tx) : null;
  const [rg] = m.regulasiKode ? await tx`select id from regulasi where kode = ${m.regulasiKode}` : [null];
  const regulasi = rg ? await ambilRegulasi(rg.id, tx) : null;
  const nomor = await nomorRegistrasi(tx, m.kelas, new Date().getFullYear());
  const status = m.status ?? { informasi: "informasi", non_hukdis: "tercatat", arsip: "selesai" }[m.kelas];
  const [e] = await tx`insert into entri (nomor_registrasi, kelas, judul, ringkasan, tanggal_peristiwa, tahun_peristiwa, pegawai_id, nama_pegawai_bebas,
      unit_kerja_id, unit_kerja_bebas, snapshot_pegawai, regulasi_id, rezim_kode, snapshot_regulasi, status_kasus, sumber_informasi, pelapor_nama,
      pelapor_kontak, hitung_dalam_sla, jenis_non_hukdis, catatan_internal, berasal_dari_id, tanggal_selesai, data_tambahan, pic_user_id,
      created_at, created_by, updated_by)
    values (${nomor}, ${m.kelas}, ${m.judul}, ${m.ringkasan}, ${m.peristiwa ?? null}, ${m.tahun ?? (m.peristiwa ? Number(m.peristiwa.slice(0, 4)) : null)},
      ${pegawai?.id ?? null}, ${pegawai ? null : m.namaBebas ?? null}, ${pegawai?.unit_kerja_id ?? null}, ${m.unitBebas ?? null},
      ${pegawai ? tx.json(snapshotPegawai(pegawai) as never) : null}, ${regulasi?.id ?? null}, ${regulasi?.rezim_kode ?? pegawai?.rezim_kode ?? null},
      ${regulasi ? tx.json(snapshotRegulasi(regulasi) as never) : null}, ${status}, ${m.sumber ?? null}, ${m.pelapor ?? null}, ${m.kontak ?? null}, false,
      ${m.jenisNonHukdis ?? null}, ${m.catatan ?? null}, ${m.berasalDari?.id ?? null}, ${m.kelas === "arsip" ? m.peristiwa ?? null : null},
      ${tx.json({ simulasi: kode } as never)}, ${C.P.id}, ${`${m.tanggal} 08:15:00+07`}, ${C.P.id}, ${C.P.id})
    returning id`;
  if (m.berasalDari) {
    await tx`update entri set status_kasus = 'dinaikkan', dinaikkan_ke_id = ${e.id}, updated_by = ${C.P.id} where id = ${m.berasalDari.id}`;
    await catatAudit(C.P, { aksi: "ubah", tabel: "entri", record_id: m.berasalDari.id, entri_id: m.berasalDari.id, ringkasan: { ditindaklanjuti_menjadi: nomor, simulasi: true } }, tx);
  }
  await catatAudit(C.P, { aksi: "buat", tabel: "entri", record_id: e.id, entri_id: e.id, ringkasan: { kelas: m.kelas, nomor, judul: m.judul, simulasi: true } }, tx);
  log(`   📥 ${{ informasi: "Informasi", non_hukdis: "Pembinaan", arsip: "Arsip lampau" }[m.kelas]} ${nomor} (${m.tanggal}): ${m.judul}`);
  return { id: e.id as string, nomor };
}
const informasi = (tx: Sql, kode: string, m: Omit<Parameters<typeof entriSederhana>[2], "kelas">) => entriSederhana(tx, kode, { ...m, kelas: "informasi" });

type Pelanggaran = { pasal: { jenis: string; cari: string } | { teksBebas: string }; uraian: string; dampak: string; waktu: string; tempat: string };

async function kasus(tx: Sql, kode: string, inf: { id: string; nomor: string } | null, m: {
  judul: string; ringkasan: string; tanggal: string; peristiwa: string; pegawai: Pg; tingkat: string; hariTmk?: number; hariTmkBerturut?: number;
  sumber: string; pelapor?: string | null; pelanggaran: Pelanggaran[]; isian?: Record<string, string>;
}): Promise<Kasus> {
  const r0 = await buatKasus(tx, {
    judul: m.judul, ringkasan: m.ringkasan, pegawaiId: m.pegawai.id, tanggalPeristiwa: m.peristiwa, tingkatKode: m.tingkat,
    hariTmk: m.hariTmk ?? null, hariTmkBerturut: m.hariTmkBerturut ?? null, sumberInformasi: m.sumber, pelaporNama: m.pelapor ?? null, adaBukti: true,
    berasalDariId: inf?.id ?? null,
  }, C.P.id);
  const [e] = await tx`select regulasi_id, snapshot_regulasi->>'nama_singkat' as reg, kalkulasi from entri where id = ${r0.id}`;
  for (const [i, x] of m.pelanggaran.entries()) {
    let pasalRegulasiId: string | null = null;
    let pasalTeksBebas: string | null = null;
    if ("cari" in x.pasal) {
      const [ps] = await tx`select id from pasal_regulasi where regulasi_id = ${e.regulasi_id} and aktif and jenis = ${x.pasal.jenis}
        and teks ilike ${`%${x.pasal.cari}%`} order by urutan limit 1`;
      if (!ps) throw new Error(`Pasal "${x.pasal.cari}" tidak ditemukan di katalog ${e.reg}`);
      pasalRegulasiId = ps.id;
    } else pasalTeksBebas = x.pasal.teksBebas;
    await tambahPelanggaran(tx, r0.id, { pasalRegulasiId, pasalTeksBebas, uraian: x.uraian, dampak: x.dampak, waktu: x.waktu, tempat: x.tempat }, i + 1, C.P.id);
  }
  await tx`update entri set created_at = ${`${m.tanggal} 08:30:00+07`}, data_tambahan = data_tambahan || ${tx.json({ simulasi: kode } as never)},
      catatan_internal = ${"Data simulasi alur SIMPEL (pelatihan/uji coba)."} where id = ${r0.id}`;
  if (inf) {
    await tx`update entri set status_kasus = 'dinaikkan', dinaikkan_ke_id = ${r0.id}, updated_by = ${C.P.id} where id = ${inf.id}`;
    await catatAudit(C.P, { aksi: "ubah", tabel: "entri", record_id: inf.id, entri_id: inf.id, ringkasan: { dinaikkan_menjadi: r0.nomor, simulasi: true } }, tx);
  }
  await catatAudit(C.P, { aksi: "buat", tabel: "entri", record_id: r0.id, entri_id: r0.id, ringkasan: { kelas: "hukdis", nomor: r0.nomor, judul: m.judul, tingkat: m.tingkat, simulasi: true } }, tx);
  const tahap = await tx`select kode_tahap from tahapan_kasus where entri_id = ${r0.id} order by urutan`;
  const u = e.kalkulasi?.usulan_kehadiran;
  log(`   📂 Kasus ${r0.nomor} (${m.tanggal}) — ${e.reg}, dugaan ${m.tingkat}${u ? `; mesin aturan: ${m.hariTmkBerturut ? `${m.hariTmkBerturut} hari berturut-turut` : `${m.hariTmk} hari TMK`} → ${u.jenisEfektif ?? u.jenis}${u.alur ? ` (alur ${u.alur})` : ""}` : ""}`);
  log(`      penjatuh: ${e.kalkulasi?.kewenangan?.penjatuh?.nama_peran ?? "-"}; tahapan: ${tahap.map((t) => t.kode_tahap).join(" → ")}`);
  return { id: r0.id, nomor: r0.nomor, kode, urutDok: 0, isian: m.isian ?? {} };
}

// ------------------------------------------------------------------ pemilihan pegawai (master, belum dipakai simulasi lain)
async function pegawai(tx: Sql, m: { gol: string[]; dosen: boolean; status?: string; fakultas?: string | null }): Promise<Pg> {
  const status = m.status ?? "PNS";
  const rows = await tx`select p.id, p.nip, p.nama_lengkap_gelar, p.golongan_ruang, p.unit_kerja,
      coalesce(nullif(p.jabatan_tambahan, ''), p.jabatan_fungsional, p.jenis_pegawai) as jabatan
    from pegawai p
    where p.status_pegawai = ${status} and p.nip is not null and p.nama_lengkap_gelar is not null and p.unit_kerja is not null
      and upper(coalesce(p.golongan_ruang, '')) in ${tx(m.gol.map((g) => g.toUpperCase()))}
      and (case when ${m.dosen} then p.jenis_pegawai ilike 'dosen%' and p.jabatan_fungsional in ('Asisten Ahli', 'Lektor', 'Lektor Kepala', 'Guru Besar')
                else p.jenis_pegawai = 'Tenaga Kependidikan' end)
      and (${m.fakultas ?? null}::text is null or p.direktorat_fakultas = ${m.fakultas ?? null})
      and not exists (select 1 from entri e where e.pegawai_id = p.id and e.data_tambahan ? 'simulasi' and e.diarsipkan_pada is null)
      and not exists (select 1 from anggota_tim a join tim_pemeriksa t on t.id = a.tim_id join entri e on e.id = t.entri_id
                      where a.pegawai_id = p.id and e.data_tambahan ? 'simulasi' and e.diarsipkan_pada is null)
      and p.id <> all(${dipakai.size ? [...dipakai] : ["00000000-0000-0000-0000-000000000000"]}::uuid[])
    order by md5(p.id::text || 'simpel') limit 1`;
  const p = rows[0];
  if (!p) {
    if (m.fakultas) return pegawai(tx, { ...m, fakultas: null });
    throw new Error(`Tidak ada pegawai ${status} golongan ${m.gol.join("/")} (${m.dosen ? "dosen" : "tendik"}) yang tersedia di master pegawai`);
  }
  dipakai.add(p.id as string);
  return p as unknown as Pg;
}
const dipakai = new Set<string>();
async function fakultas(tx: Sql, id: string) {
  const [r] = await tx`select direktorat_fakultas from pegawai where id = ${id}`;
  return (r?.direktorat_fakultas as string | null) ?? null;
}
async function timTiga(tx: Sql, t: Pg, golKetua: string[] = ["IV/b", "IV/c", "IV/d", "IV/e"]) {
  const fak = await fakultas(tx, t.id);
  const ketua = await pegawai(tx, { gol: golKetua, dosen: true, fakultas: fak });
  const sek = await pegawai(tx, { gol: ["III/d", "IV/a", "IV/b"], dosen: false });
  const ang = await pegawai(tx, { gol: ["IV/a", "IV/b", "IV/c"], dosen: true });
  return { ketua, sek, ang, anggota: [[ketua, "atasan_langsung", "ketua"], [sek, "kepegawaian", "sekretaris"], [ang, "pengawasan", "anggota"]] as [Pg, string, string][] };
}
// Kasus ringan diperiksa atasan langsung (tanpa Tim): penanda "ketua tim" di template diisi atasan langsung.
const atasan = (a: Pg, jabatan?: string) => ({
  nama_atasan_langsung: a.nama_lengkap_gelar, nip_atasan_langsung: a.nip, jabatan_atasan_langsung: jabatan ?? a.jabatan ?? "Ketua Departemen",
  nama_ketua_tim: a.nama_lengkap_gelar, nip_ketua_tim: a.nip,
  anggota_tim: `${a.nama_lengkap_gelar} | ${a.nip} | ${a.golongan_ruang ?? "-"} | ${jabatan ?? a.jabatan ?? "-"} | ${a.unit_kerja ?? "-"} | Atasan langsung | Pemeriksa`,
});
const MENTERI = { nama_pejabat_penjatuh: "Menteri Pendidikan Tinggi, Sains, dan Teknologi", nip_pejabat_penjatuh: "-" };
const RUANG = "Ruang Rapat Direktorat SDM, Gedung A3";
const terperiksaLog = (t: Pg) => log(`   terperiksa: ${t.nama_lengkap_gelar} — ${t.golongan_ruang}, ${t.jabatan}, ${t.unit_kerja}`);
const PASAL_HADIR = { jenis: "kewajiban", cari: "masuk Kerja dan menaati ketentuan jam Kerja" };

// ------------------------------------------------------------------ skenario
export type Skenario = { kode: string; kelompok: string; judul: string; ringkas: string; jalan: (tx: Sql) => Promise<void> };

export const SKENARIO: Skenario[] = [
  {
    kode: "S1", kelompok: "Ringan", judul: "Ringan — komplit 100%", ringkas: "TMK 5 hari → teguran tertulis. Informasi → kasus → panggilan → sidang (direkam) → BAP → LHP → SK → diterima → berlaku → selesai.",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["II/c", "II/d", "III/a", "III/b"], dosen: false });
      const ats = await pegawai(tx, { gol: ["III/d", "IV/a", "IV/b"], dosen: true, fakultas: await fakultas(tx, t.id) });
      terperiksaLog(t);
      await kehadiran(tx, t.id, 2026, { 4: 1, 5: 5 });
      const inf = await informasi(tx, "S1", { judul: "Rekap presensi Mei 2026: 5 hari tanpa keterangan", ringkasan: `Rekap presensi elektronik bulan Mei 2026 menunjukkan ${t.nama_lengkap_gelar} tidak masuk kerja tanpa keterangan selama 5 hari kerja.`, tanggal: "2026-06-02", peristiwa: "2026-05-29", pegawai: t, sumber: "presensi", pelapor: "Subdirektorat Administrasi Kepegawaian" });
      await berkas(tx, inf.id, "Rekap presensi Mei 2026.xlsx", await xlsxPresensi(t, 2026, { 4: 1, 5: 5 }), MIME_XLSX, "bukti", { tanggal: "2026-06-02", keterangan: "Unduhan sistem presensi elektronik" });
      const k = await kasus(tx, "S1", inf, {
        judul: "Tidak masuk kerja tanpa alasan sah selama 5 hari kerja pada Mei 2026", tanggal: "2026-06-04", peristiwa: "2026-05-29", pegawai: t, tingkat: "ringan", hariTmk: 5, sumber: "presensi",
        ringkasan: `Berdasarkan rekap presensi elektronik, ${t.nama_lengkap_gelar} tidak masuk kerja tanpa alasan yang sah pada tanggal 11, 12, 18, 26, dan 29 Mei 2026 (5 hari kerja). Atasan langsung telah menegur secara lisan namun tidak ada keterangan tertulis dari yang bersangkutan.`,
        pelanggaran: [{ pasal: PASAL_HADIR, uraian: "Tidak masuk kerja tanpa alasan yang sah selama 5 hari kerja pada bulan Mei 2026.", dampak: "unit_kerja", waktu: "11, 12, 18, 26, dan 29 Mei 2026", tempat: t.unit_kerja ?? "Unit kerja" }],
        isian: { ...atasan(ats, "Kepala Bagian Umum"), faktor_memberatkan: "Telah ditegur lisan oleh atasan langsung namun tidak menyampaikan keterangan.", faktor_meringankan: "Mengakui perbuatannya, bersikap kooperatif, dan belum pernah dijatuhi hukuman disiplin.", nama_pejabat_penjatuh: ats.nama_lengkap_gelar, nip_pejabat_penjatuh: ats.nip },
      });
      await berkas(tx, k.id, "Laporan atasan langsung.pdf", pdf("LAPORAN ATASAN LANGSUNG", ["Kepada Yth. Direktur Sumber Daya Manusia", "", `Dengan hormat, kami laporkan bahwa Sdr. ${t.nama_lengkap_gelar} (NIP ${t.nip}) tidak masuk kerja tanpa keterangan pada 11, 12, 18, 26, dan 29 Mei 2026. Teguran lisan telah kami sampaikan pada 1 Juni 2026.`, "", "Malang, 3 Juni 2026", ats.nama_lengkap_gelar, `NIP ${ats.nip}`]), "application/pdf", "bukti", { tanggal: "2026-06-04", keterangan: "Laporan tertulis atasan langsung" });
      await dokumen(tx, k, "kronologi", { tanggal: "2026-06-05", tahap: "telaah" });
      await dokumen(tx, k, "rekapitulasi_tmk", { tanggal: "2026-06-05", tahap: "telaah" });
      await selesai(tx, k.id, "telaah", "2026-06-08");
      const s = await jadwal(tx, k.id, { tanggal: "2026-06-22", jam: "09:00", tempat: "Ruang Ketua Departemen" });
      await dokumen(tx, k, "surat_panggilan", { tanggal: "2026-06-09", nomor: "4417/UN32.II/KP/2026", tahap: "panggilan_1", sesiId: s });
      await selesai(tx, k.id, "panggilan_1", "2026-06-10");
      await aturTahap(tx, k.id, "panggilan_2", "dilewati", "Terperiksa hadir memenuhi Panggilan I.");
      await laksana(tx, k.id, s, { selesai: "10:15", hadir: true, rekam: true, jawaban: {
        9: "Benar. Pada tanggal-tanggal tersebut saya tidak masuk kerja karena mengurus orang tua yang sakit, tetapi saya tidak mengajukan izin.",
        10: "Tanggal 11, 12, 18, 26, dan 29 Mei 2026; seharusnya saya bertugas di kantor.", 11: "Saya mengurus orang tua yang dirawat di rumah dan lalai mengajukan cuti.", 12: "Tidak ada." } });
      await dokumen(tx, k, "persetujuan_rekam", { tanggal: "2026-06-22", tahap: "pemeriksaan", sesiId: s });
      await selesai(tx, k.id, "pemeriksaan", "2026-06-22");
      await dokumen(tx, k, "bap", { tanggal: "2026-06-22", tahap: "bap", sesiId: s });
      await selesai(tx, k.id, "bap", "2026-06-23");
      await dokumen(tx, k, "lhp", { tanggal: "2026-06-26", tahap: "lhp", sesiId: s });
      await selesai(tx, k.id, "lhp", "2026-06-26");
      const pejabat = "Kepala Bagian Umum";
      await hukuman(tx, k, { jenisKode: "teguran_tertulis", nomorSk: "4980/UN32.II/KP/2026", tanggalSk: "2026-07-06", pejabat });
      await dokumen(tx, k, "sk_hukdis", { tanggal: "2026-07-06", nomor: "4980/UN32.II/KP/2026", tahap: "penetapan_sk" });
      await selesai(tx, k.id, "penetapan_sk", "2026-07-06");
      await berkas(tx, k.id, "SK teguran tertulis (ditandatangani).pdf", pdf("KEPUTUSAN HUKUMAN DISIPLIN (PINDAIAN)", ["Nomor 4980/UN32.II/KP/2026 tanggal 6 Juli 2026", `Hukuman disiplin ringan berupa teguran tertulis kepada ${t.nama_lengkap_gelar}, NIP ${t.nip}.`, "", "[pindaian dokumen bertanda tangan basah]"]), "application/pdf", "dokumen_terbit", { tanggal: "2026-07-06" });
      await hukuman(tx, k, { jenisKode: "teguran_tertulis", nomorSk: "4980/UN32.II/KP/2026", tanggalSk: "2026-07-06", pejabat, tanggalDiterima: "2026-07-08" });
      await berkas(tx, k.id, "Tanda terima SK.pdf", pdf("TANDA TERIMA KEPUTUSAN", ["Telah diterima Keputusan Nomor 4980/UN32.II/KP/2026 pada 8 Juli 2026.", "", t.nama_lengkap_gelar]), "application/pdf", "dokumen_terbit", { tanggal: "2026-07-08" });
      await selesai(tx, k.id, "penyampaian_sk", "2026-07-08");
      await aturTahap(tx, k.id, "pengiriman_sk", "dilewati", "Keputusan diterima langsung oleh terperiksa.");
      const [b] = await tx`select tanggal_mulai_berlaku as t from hukuman where entri_id = ${k.id}`;
      await selesai(tx, k.id, "berlaku", b.t);
    },
  },
  {
    kode: "S2", kelompok: "Ringan", judul: "Ringan — masih draf", ringkas: "Nilai ujian tidak diunggah tepat waktu. Sudah diperiksa (terperiksa menolak direkam); BAP masih DRAF.",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["III/b", "III/c"], dosen: true });
      const ats = await pegawai(tx, { gol: ["IV/a", "IV/b", "IV/c"], dosen: true, fakultas: await fakultas(tx, t.id) });
      terperiksaLog(t);
      const inf = await informasi(tx, "S2", { judul: "Nilai ujian akhir dua kelas belum diunggah melewati batas", ringkasan: `Ketua Program Studi melaporkan nilai UAS dua kelas yang diampu ${t.nama_lengkap_gelar} belum diunggah ke SIAKAD hingga dua minggu melewati batas akhir, sehingga yudisium tertunda.`, tanggal: "2026-09-14", peristiwa: "2026-08-28", pegawai: t, sumber: "surat", pelapor: "Ketua Program Studi" });
      const k = await kasus(tx, "S2", inf, {
        judul: "Tidak melaksanakan tugas kedinasan: nilai ujian akhir tidak diunggah tepat waktu", tanggal: "2026-09-16", peristiwa: "2026-08-28", pegawai: t, tingkat: "ringan", sumber: "surat", pelapor: "Ketua Program Studi",
        ringkasan: `${t.nama_lengkap_gelar} tidak mengunggah nilai ujian akhir semester genap 2025/2026 untuk dua kelas hingga 11 September 2026, padahal batas akhir 28 Agustus 2026. Akibatnya yudisium 41 mahasiswa tertunda satu periode.`,
        pelanggaran: [{ pasal: { jenis: "kewajiban", cari: "melaksanakan tugas kedinasan" }, uraian: "Tidak mengunggah nilai ujian akhir dua kelas sampai melewati batas akhir yang ditetapkan.", dampak: "unit_kerja", waktu: "28 Agustus – 11 September 2026", tempat: t.unit_kerja ?? "Program Studi" }],
        isian: { ...atasan(ats, "Ketua Departemen"), faktor_memberatkan: "Berdampak pada tertundanya yudisium 41 mahasiswa.", faktor_meringankan: "Nilai telah diunggah setelah ditegur; bersikap kooperatif." },
      });
      await berkas(tx, k.id, "Nota dinas Ketua Prodi - keterlambatan nilai.pdf", pdf("NOTA DINAS KETUA PROGRAM STUDI", ["Hal: Keterlambatan unggah nilai UAS", "", `Nilai UAS kelas A dan B yang diampu ${t.nama_lengkap_gelar} belum diunggah hingga 11 September 2026 (batas 28 Agustus 2026). Yudisium 41 mahasiswa tertunda.`, "", "Malang, 14 September 2026"]), "application/pdf", "bukti", { tanggal: "2026-09-14" });
      await berkas(tx, k.id, "Log unggah nilai SIAKAD.pdf", pdf("LOG UNGGAH NILAI SIAKAD", ["Kelas A - status: BELUM DIUNGGAH (per 11-09-2026)", "Kelas B - status: BELUM DIUNGGAH (per 11-09-2026)", "Batas akhir unggah: 28-08-2026 23.59 WIB"]), "application/pdf", "bukti", { tanggal: "2026-09-15" });
      await dokumen(tx, k, "kronologi", { tanggal: "2026-09-17", tahap: "telaah" });
      await selesai(tx, k.id, "telaah", "2026-09-18");
      const s = await jadwal(tx, k.id, { tanggal: "2026-10-06", jam: "13:00", tempat: "Ruang Rapat Departemen" });
      await dokumen(tx, k, "surat_panggilan", { tanggal: "2026-09-23", nomor: "6521/UN32.II/KP/2026", tahap: "panggilan_1", sesiId: s });
      await selesai(tx, k.id, "panggilan_1", "2026-09-24");
      await aturTahap(tx, k.id, "panggilan_2", "dilewati", "Terperiksa hadir memenuhi Panggilan I.");
      await laksana(tx, k.id, s, { selesai: "14:10", hadir: true, rekam: false, jawaban: {
        9: "Benar, nilai dua kelas terlambat saya unggah karena saya menunggu tugas akhir susulan beberapa mahasiswa.", 10: "Batas akhir 28 Agustus 2026; nilai baru saya unggah 12 September 2026.",
        11: "Saya keliru memahami bahwa nilai bisa diunggah setelah semua tugas susulan masuk.", 12: "Staf akademik program studi mengetahui dan sudah mengingatkan." } });
      await selesai(tx, k.id, "pemeriksaan", "2026-10-06");
      await dokumen(tx, k, "bap", { tanggal: "2026-10-06", tahap: "bap", sesiId: s, final: false });
    },
  },
  {
    kode: "S3", kelompok: "Sedang", judul: "Sedang — komplit 100%", ringkas: "TMK 13 hari kumulatif 2025 → pemotongan tukin (diganti hukuman pengganti masa transisi). Tim Pemeriksa, lapor Sekjen, SK Rektor, dijalani sampai selesai.",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["III/a", "III/b", "III/c"], dosen: false });
      const tm = await timTiga(tx, t);
      terperiksaLog(t);
      await kehadiran(tx, t.id, 2025, { 1: 3, 2: 4, 3: 6 });
      const inf = await informasi(tx, "S3", { judul: "Rekap presensi triwulan I 2025: 13 hari tanpa keterangan", ringkasan: `Rekap presensi Januari–Maret 2025 menunjukkan ${t.nama_lengkap_gelar} tidak masuk kerja tanpa keterangan 13 hari kerja secara kumulatif.`, tanggal: "2025-04-07", peristiwa: "2025-03-31", pegawai: t, sumber: "presensi", pelapor: "Subdirektorat Administrasi Kepegawaian" });
      const k = await kasus(tx, "S3", inf, {
        judul: "Tidak masuk kerja tanpa alasan sah 13 hari kerja kumulatif (Januari–Maret 2025)", tanggal: "2025-04-09", peristiwa: "2025-03-31", pegawai: t, tingkat: "sedang", hariTmk: 13, sumber: "presensi",
        ringkasan: `${t.nama_lengkap_gelar} tidak masuk kerja tanpa alasan sah selama 13 hari kerja secara kumulatif pada Januari (3 hari), Februari (4 hari), dan Maret (6 hari) 2025.`,
        pelanggaran: [{ pasal: PASAL_HADIR, uraian: "Tidak masuk kerja tanpa alasan yang sah 13 hari kerja kumulatif dalam tahun 2025.", dampak: "instansi", waktu: "Januari – Maret 2025", tempat: t.unit_kerja ?? "Unit kerja" }],
        isian: { ...atasan(tm.ketua), faktor_memberatkan: "Ketidakhadiran berulang dalam tiga bulan berturut-turut.", faktor_meringankan: "Mengakui perbuatan dan berjanji memperbaiki kedisiplinan." },
      });
      await berkas(tx, k.id, "Rekap presensi Januari-Maret 2025.xlsx", await xlsxPresensi(t, 2025, { 1: 3, 2: 4, 3: 6 }), MIME_XLSX, "bukti", { tanggal: "2025-04-09" });
      await dokumen(tx, k, "kronologi", { tanggal: "2025-04-10", tahap: "telaah" });
      await dokumen(tx, k, "rekapitulasi_tmk", { tanggal: "2025-04-10", tahap: "telaah" });
      await selesai(tx, k.id, "telaah", "2025-04-14");
      await tim(tx, k.id, { nomorSk: "2210/UN32/KP/2025", tanggalSk: "2025-04-21", anggota: tm.anggota });
      await dokumen(tx, k, "sk_tim_pemeriksa", { tanggal: "2025-04-21", nomor: "2210/UN32/KP/2025", tahap: "pembentukan_tim" });
      await selesai(tx, k.id, "pembentukan_tim", "2025-04-21");
      await dokumen(tx, k, "lapor_sekjen", { tanggal: "2025-04-24", nomor: "2291/UN32/KP/2025", tahap: "lapor_sekjen" });
      await selesai(tx, k.id, "lapor_sekjen", "2025-04-24");
      await aturTahap(tx, k.id, "surat_tugas_sekretariat", "dilewati", "Tidak diperlukan.");
      const s = await jadwal(tx, k.id, { tanggal: "2025-05-12", jam: "09:00", tempat: RUANG });
      await dokumen(tx, k, "surat_panggilan", { tanggal: "2025-04-28", nomor: "2350/UN32/KP/2025", tahap: "panggilan_1", sesiId: s });
      await selesai(tx, k.id, "panggilan_1", "2025-04-29");
      await aturTahap(tx, k.id, "panggilan_2", "dilewati", "Terperiksa hadir memenuhi Panggilan I.");
      await laksana(tx, k.id, s, { selesai: "11:00", hadir: true, rekam: true, jawaban: {
        9: "Benar, saya tidak masuk kerja pada hari-hari tersebut tanpa mengajukan izin.", 10: "Januari sampai Maret 2025 di unit kerja saya.", 11: "Ada masalah keluarga dan saya tidak memberi kabar kepada atasan.", 12: "Tidak ada." },
        tambahan: [["Apakah Saudara pernah diingatkan oleh atasan sebelum laporan ini dibuat?", "Pernah, secara lisan pada bulan Februari 2025."]] });
      await dokumen(tx, k, "persetujuan_rekam", { tanggal: "2025-05-12", tahap: "pemeriksaan", sesiId: s });
      await selesai(tx, k.id, "pemeriksaan", "2025-05-12");
      await dokumen(tx, k, "bap", { tanggal: "2025-05-12", tahap: "bap", sesiId: s });
      await selesai(tx, k.id, "bap", "2025-05-13");
      await dokumen(tx, k, "lhp", { tanggal: "2025-05-19", tahap: "lhp", sesiId: s });
      await selesai(tx, k.id, "lhp", "2025-05-19");
      await dokumen(tx, k, "nota_dinas_kewenangan", { tanggal: "2025-05-21", nomor: "2711/UN32/KP/2025", tahap: "nota_dinas_kewenangan" });
      await selesai(tx, k.id, "nota_dinas_kewenangan", "2025-05-21");
      await hukuman(tx, k, { jenisKode: "tukin_25_6", nomorSk: "3012/UN32/KP/2025", tanggalSk: "2025-06-02", pejabat: "Rektor" });
      await dokumen(tx, k, "sk_hukdis", { tanggal: "2025-06-02", nomor: "3012/UN32/KP/2025", tahap: "penetapan_sk" });
      await selesai(tx, k.id, "penetapan_sk", "2025-06-02");
      await berkas(tx, k.id, "SK Rektor hukuman disiplin sedang (ditandatangani).pdf", pdf("KEPUTUSAN REKTOR (PINDAIAN)", ["Nomor 3012/UN32/KP/2025 tanggal 2 Juni 2025", `Hukuman disiplin sedang kepada ${t.nama_lengkap_gelar}, NIP ${t.nip}.`, "", "[pindaian dokumen bertanda tangan]"]), "application/pdf", "dokumen_terbit", { tanggal: "2025-06-02" });
      const h = await hukuman(tx, k, { jenisKode: "tukin_25_6", nomorSk: "3012/UN32/KP/2025", tanggalSk: "2025-06-02", pejabat: "Rektor", tanggalDiterima: "2025-06-04" });
      await selesai(tx, k.id, "penyampaian_sk", "2025-06-04");
      await aturTahap(tx, k.id, "pengiriman_sk", "dilewati", "Keputusan diterima langsung oleh terperiksa.");
      await selesai(tx, k.id, "berlaku", h.mulai!);
      if (await adaTahap(tx, k.id, "menjalani")) await selesai(tx, k.id, "menjalani", h.selesai ?? h.mulai!);
    },
  },
  {
    kode: "S4", kelompok: "Sedang", judul: "Sedang — masih draf", ringkas: "Kendaraan dinas dipakai pribadi (temuan SPI). Terperiksa mangkir Panggilan I → BA ketidakhadiran; Surat Panggilan II masih DRAF dan sudah lewat tenggat.",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["III/a", "III/b", "III/c"], dosen: false });
      const tm = await timTiga(tx, t, ["IV/a", "IV/b", "IV/c"]);
      terperiksaLog(t);
      const inf = await informasi(tx, "S4", { judul: "Temuan SPI: kendaraan dinas dipakai di luar kedinasan", ringkasan: `Satuan Pengawasan Internal menemukan kendaraan dinas yang dikuasai ${t.nama_lengkap_gelar} dipakai untuk kepentingan pribadi ke luar kota pada akhir pekan.`, tanggal: "2026-08-24", peristiwa: "2026-08-09", pegawai: t, sumber: "temuan_spi", pelapor: "Satuan Pengawasan Internal" });
      const k = await kasus(tx, "S4", inf, {
        judul: "Menggunakan kendaraan dinas untuk kepentingan pribadi", tanggal: "2026-08-26", peristiwa: "2026-08-09", pegawai: t, tingkat: "sedang", sumber: "temuan_spi", pelapor: "Satuan Pengawasan Internal",
        ringkasan: `Berdasarkan Laporan Hasil Audit SPI, kendaraan dinas N 1234 AB yang dikuasai ${t.nama_lengkap_gelar} dipakai untuk keperluan pribadi ke Surabaya pada 8–9 Agustus 2026 tanpa surat tugas, termasuk penggunaan kartu BBM dinas.`,
        pelanggaran: [{ pasal: { jenis: "kewajiban", cari: "memelihara barang milik negara" }, uraian: "Menggunakan kendaraan dinas dan kartu BBM dinas untuk keperluan pribadi tanpa surat tugas.", dampak: "instansi", waktu: "8–9 Agustus 2026", tempat: "Malang – Surabaya" }],
        isian: { ...atasan(tm.ketua, "Kepala Biro Umum dan Keuangan"), faktor_memberatkan: "Menggunakan kartu BBM dinas.", faktor_meringankan: "-" },
      });
      await berkas(tx, k.id, "LHA SPI - penggunaan kendaraan dinas.pdf", pdf("LAPORAN HASIL AUDIT SATUAN PENGAWASAN INTERNAL", ["Nomor: 112/UN32.SPI/PW/2026", "", `Temuan: kendaraan dinas N 1234 AB yang dikuasai ${t.nama_lengkap_gelar} tercatat GPS berada di Surabaya pada 8-9 Agustus 2026 (Sabtu-Minggu) tanpa surat tugas.`, "Transaksi kartu BBM dinas: Rp 450.000 pada 8 Agustus 2026 di SPBU Waru.", "", "Rekomendasi: diproses sesuai ketentuan disiplin pegawai."]), "application/pdf", "bukti", { tanggal: "2026-08-24" });
      await berkas(tx, k.id, "Riwayat GPS dan transaksi BBM.xlsx", await xlsx("RIWAYAT GPS KENDARAAN N 1234 AB & KARTU BBM", ["Waktu", "Lokasi", "Keterangan"], [["2026-08-08 06:10", "Malang (kampus)", "Kendaraan keluar"], ["2026-08-08 08:02", "SPBU Waru, Sidoarjo", "Isi BBM Rp 450.000 (kartu dinas)"], ["2026-08-08 09:15", "Surabaya", "Parkir 2 hari"], ["2026-08-09 18:40", "Malang (kampus)", "Kendaraan kembali"]]), MIME_XLSX, "bukti", { tanggal: "2026-08-24" });
      await dokumen(tx, k, "kronologi", { tanggal: "2026-08-28", tahap: "telaah" });
      await selesai(tx, k.id, "telaah", "2026-08-31");
      await tim(tx, k.id, { nomorSk: "5802/UN32/KP/2026", tanggalSk: "2026-09-07", anggota: tm.anggota });
      await dokumen(tx, k, "sk_tim_pemeriksa", { tanggal: "2026-09-07", nomor: "5802/UN32/KP/2026", tahap: "pembentukan_tim" });
      await selesai(tx, k.id, "pembentukan_tim", "2026-09-07");
      await dokumen(tx, k, "lapor_sekjen", { tanggal: "2026-09-10", nomor: "5911/UN32/KP/2026", tahap: "lapor_sekjen" });
      await selesai(tx, k.id, "lapor_sekjen", "2026-09-10");
      await aturTahap(tx, k.id, "surat_tugas_sekretariat", "dilewati", "Tidak diperlukan.");
      const s = await jadwal(tx, k.id, { tanggal: "2026-09-28", jam: "09:00", tempat: RUANG });
      await dokumen(tx, k, "surat_panggilan", { tanggal: "2026-09-15", nomor: "6040/UN32/KP/2026", tahap: "panggilan_1", sesiId: s });
      await selesai(tx, k.id, "panggilan_1", "2026-09-16");
      await laksana(tx, k.id, s, { selesai: "10:00", hadir: false });
      await aturTahap(tx, k.id, "panggilan_2", "berjalan");
      await dokumen(tx, k, "bap_tidak_hadir", { tanggal: "2026-09-28", tahap: "panggilan_2", sesiId: s });
      const s2 = await jadwal(tx, k.id, { tanggal: "2026-10-19", jam: "09:00", tempat: RUANG });
      await dokumen(tx, k, "surat_panggilan", { tanggal: "2026-10-08", nomor: "6688/UN32/KP/2026", tahap: "panggilan_2", sesiId: s2, final: false });
    },
  },
  {
    kode: "S5", kelompok: "Berat", judul: "Berat — komplit 100%", ringkas: "Dosen TMK 22 hari kumulatif 2025 → penurunan jabatan 12 bulan oleh Menteri (usul Rektor). Punya riwayat hukuman lampau (lihat S16).",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["III/c", "III/d"], dosen: true });
      const tm = await timTiga(tx, t, ["IV/c", "IV/d", "IV/e"]);
      terperiksaLog(t);
      await kehadiran(tx, t.id, 2025, { 1: 5, 2: 7, 3: 10 });
      const inf = await informasi(tx, "S5", { judul: "Dosen tidak hadir mengajar dan tidak masuk kerja sejak Januari 2025", ringkasan: `Dekan melaporkan ${t.nama_lengkap_gelar} tidak masuk kerja dan tidak mengampu perkuliahan tanpa keterangan, total 22 hari kerja pada Januari–Maret 2025.`, tanggal: "2025-03-31", peristiwa: "2025-03-31", pegawai: t, sumber: "disposisi", pelapor: "Dekan" });
      const k = await kasus(tx, "S5", inf, {
        judul: "Tidak masuk kerja tanpa alasan sah 22 hari kerja kumulatif (Januari–Maret 2025)", tanggal: "2025-04-02", peristiwa: "2025-03-31", pegawai: t, tingkat: "berat", hariTmk: 22, sumber: "disposisi", pelapor: "Dekan",
        ringkasan: `${t.nama_lengkap_gelar} tidak masuk kerja tanpa alasan sah selama 22 hari kerja kumulatif pada Januari (5), Februari (7), dan Maret (10) 2025, sehingga perkuliahan tiga kelas tidak terlaksana.`,
        pelanggaran: [{ pasal: PASAL_HADIR, uraian: "Tidak masuk kerja tanpa alasan sah 22 hari kerja kumulatif dalam tahun 2025.", dampak: "negara", waktu: "Januari – Maret 2025", tempat: t.unit_kerja ?? "Fakultas" }],
        isian: { ...atasan(tm.ketua, "Dekan"), faktor_memberatkan: "Perkuliahan tiga kelas tidak terlaksana; pernah dijatuhi hukuman disiplin ringan pada 2019.", faktor_meringankan: "Mengakui perbuatan.", ...MENTERI },
      });
      await berkas(tx, k.id, "Rekap presensi Januari-Maret 2025.xlsx", await xlsxPresensi(t, 2025, { 1: 5, 2: 7, 3: 10 }), MIME_XLSX, "bukti", { tanggal: "2025-04-02" });
      await berkas(tx, k.id, "Nota dinas Dekan.pdf", pdf("NOTA DINAS DEKAN", [`Hal: Ketidakhadiran ${t.nama_lengkap_gelar}`, "", "Bersama ini kami laporkan ketidakhadiran yang bersangkutan sebanyak 22 hari kerja Januari-Maret 2025 dan tidak terlaksananya perkuliahan 3 kelas.", "", "Malang, 31 Maret 2025"]), "application/pdf", "bukti", { tanggal: "2025-04-02" });
      await dokumen(tx, k, "kronologi", { tanggal: "2025-04-03", tahap: "telaah" });
      await dokumen(tx, k, "rekapitulasi_tmk", { tanggal: "2025-04-03", tahap: "telaah" });
      await dokumen(tx, k, "keterangan_rekan_sejawat", { tanggal: "2025-04-04", tahap: "telaah" });
      await selesai(tx, k.id, "telaah", "2025-04-07");
      await tim(tx, k.id, { nomorSk: "1950/UN32/KP/2025", tanggalSk: "2025-04-14", anggota: tm.anggota });
      await dokumen(tx, k, "sk_tim_pemeriksa", { tanggal: "2025-04-14", nomor: "1950/UN32/KP/2025", tahap: "pembentukan_tim" });
      await selesai(tx, k.id, "pembentukan_tim", "2025-04-14");
      await dokumen(tx, k, "lapor_sekjen", { tanggal: "2025-04-16", nomor: "2002/UN32/KP/2025", tahap: "lapor_sekjen" });
      await selesai(tx, k.id, "lapor_sekjen", "2025-04-16");
      await aturTahap(tx, k.id, "surat_tugas_sekretariat", "berjalan");
      await dokumen(tx, k, "surat_tugas_sekretariat", { tanggal: "2025-04-16", nomor: "2003/UN32/KP/2025", tahap: "surat_tugas_sekretariat" });
      await selesai(tx, k.id, "surat_tugas_sekretariat", "2025-04-16");
      const s = await jadwal(tx, k.id, { tanggal: "2025-05-05", jam: "09:00", tempat: RUANG });
      await dokumen(tx, k, "surat_panggilan", { tanggal: "2025-04-21", nomor: "2105/UN32/KP/2025", tahap: "panggilan_1", sesiId: s });
      await selesai(tx, k.id, "panggilan_1", "2025-04-22");
      await aturTahap(tx, k.id, "panggilan_2", "dilewati", "Terperiksa hadir memenuhi Panggilan I.");
      await laksana(tx, k.id, s, { selesai: "11:45", hadir: true, rekam: true, jawaban: {
        9: "Benar, saya tidak masuk kerja pada hari-hari tersebut.", 10: "Januari sampai Maret 2025.", 11: "Saya mengerjakan proyek di luar kampus dan mengabaikan kewajiban mengajar.", 12: "Tidak ada." },
        tambahan: [["Apakah Saudara mendapat izin pimpinan untuk kegiatan di luar kampus tersebut?", "Tidak, saya tidak mengajukan izin."], ["Bagaimana perkuliahan kelas yang Saudara ampu selama Saudara tidak hadir?", "Tidak terlaksana; sebagian digantikan oleh rekan dosen."]] });
      await dokumen(tx, k, "persetujuan_rekam", { tanggal: "2025-05-05", tahap: "pemeriksaan", sesiId: s });
      await selesai(tx, k.id, "pemeriksaan", "2025-05-05");
      await dokumen(tx, k, "bap", { tanggal: "2025-05-05", tahap: "bap", sesiId: s });
      await selesai(tx, k.id, "bap", "2025-05-06");
      await dokumen(tx, k, "lhp", { tanggal: "2025-05-14", tahap: "lhp", sesiId: s });
      await selesai(tx, k.id, "lhp", "2025-05-14");
      await dokumen(tx, k, "nota_dinas_kewenangan", { tanggal: "2025-05-16", nomor: "2560/UN32/KP/2025", tahap: "nota_dinas_kewenangan" });
      await selesai(tx, k.id, "nota_dinas_kewenangan", "2025-05-16");
      const usul = await adaTahap(tx, k.id, "usul_menteri");
      if (usul) {
        await dokumen(tx, k, "usul_menteri", { tanggal: "2025-05-20", nomor: "2601/UN32/KP/2025", tahap: "usul_menteri" });
        await selesai(tx, k.id, "usul_menteri", "2025-05-20");
      }
      const pejabat = usul ? MENTERI.nama_pejabat_penjatuh : "Rektor";
      await hukuman(tx, k, { jenisKode: "turun_jabatan", nomorSk: "41377/M/KP.07.00/2025", tanggalSk: "2025-06-16", pejabat });
      await dokumen(tx, k, "sk_hukdis", { tanggal: "2025-06-16", nomor: "41377/M/KP.07.00/2025", tahap: "penetapan_sk" });
      await selesai(tx, k.id, "penetapan_sk", "2025-06-16");
      await berkas(tx, k.id, "Salinan SK Menteri - hukuman disiplin berat.pdf", pdf("KEPUTUSAN MENTERI (SALINAN)", ["Nomor 41377/M/KP.07.00/2025 tanggal 16 Juni 2025", `Hukuman disiplin berat berupa penurunan jabatan setingkat lebih rendah selama 12 bulan kepada ${t.nama_lengkap_gelar}, NIP ${t.nip}.`, "", "[salinan keputusan diterima dari Kementerian]"]), "application/pdf", "dokumen_terbit", { tanggal: "2025-06-20" });
      const h = await hukuman(tx, k, { jenisKode: "turun_jabatan", nomorSk: "41377/M/KP.07.00/2025", tanggalSk: "2025-06-16", pejabat, tanggalDiterima: "2025-06-23" });
      await selesai(tx, k.id, "penyampaian_sk", "2025-06-23");
      await aturTahap(tx, k.id, "pengiriman_sk", "dilewati", "Keputusan diterima langsung oleh terperiksa.");
      await selesai(tx, k.id, "berlaku", h.mulai!);
      if (await adaTahap(tx, k.id, "menjalani")) await selesai(tx, k.id, "menjalani", h.selesai ?? h.mulai!);
    },
  },
  {
    kode: "S6", kelompok: "Berat", judul: "Berat — masih draf", ringkas: "Penyalahgunaan wewenang pengadaan (kerugian Rp186 juta). Pembebasan sementara dari jabatan; BAP & LHP final; usul ke Menteri masih DRAF.",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["III/c", "III/d"], dosen: true });
      const tm = await timTiga(tx, t, ["IV/c", "IV/d", "IV/e"]);
      terperiksaLog(t);
      const inf = await informasi(tx, "S6", { judul: "Temuan SPI: pemecahan paket pengadaan laboratorium", ringkasan: `SPI menemukan dugaan pemecahan paket pengadaan alat laboratorium oleh ${t.nama_lengkap_gelar} selaku Pejabat Pembuat Komitmen kegiatan hibah, dengan kerugian sementara Rp 186.400.000.`, tanggal: "2026-07-20", peristiwa: "2026-05-15", pegawai: t, sumber: "temuan_spi", pelapor: "Satuan Pengawasan Internal" });
      const k = await kasus(tx, "S6", inf, {
        judul: "Menyalahgunakan wewenang dalam pengadaan alat laboratorium", tanggal: "2026-07-22", peristiwa: "2026-05-15", pegawai: t, tingkat: "berat", sumber: "temuan_spi", pelapor: "Satuan Pengawasan Internal",
        ringkasan: `${t.nama_lengkap_gelar} selaku Pejabat Pembuat Komitmen diduga memecah pengadaan alat laboratorium menjadi 6 paket pengadaan langsung untuk menghindari tender dan menunjuk penyedia yang sama, dengan kerugian sementara Rp 186.400.000 menurut LHA SPI.`,
        pelanggaran: [{ pasal: { jenis: "larangan", cari: "menyalahgunakan wewenang" }, uraian: "Memecah paket pengadaan untuk menghindari tender dan menunjuk penyedia tertentu.", dampak: "negara", waktu: "Maret – Mei 2026", tempat: t.unit_kerja ?? "Laboratorium" }],
        isian: { ...atasan(tm.ketua, "Dekan"), faktor_memberatkan: "Menimbulkan kerugian keuangan negara Rp 186.400.000.", faktor_meringankan: "Kooperatif selama pemeriksaan.", ...MENTERI,
          jenis_hukuman: "pembebasan dari jabatannya menjadi jabatan pelaksana selama 12 (dua belas) bulan" },
      });
      await berkas(tx, k.id, "LHA SPI - pengadaan alat laboratorium.pdf", pdf("LAPORAN HASIL AUDIT SATUAN PENGAWASAN INTERNAL", ["Nomor: 097/UN32.SPI/PW/2026", "", "Temuan 1: Pengadaan alat laboratorium senilai Rp 1.240.000.000 dipecah menjadi 6 paket pengadaan langsung (Maret-Mei 2026).", "Temuan 2: Seluruh paket dimenangkan penyedia yang sama.", "Temuan 3: Selisih harga dibanding e-katalog Rp 186.400.000.", "", "Rekomendasi: proses disiplin dan pemulihan kerugian."]), "application/pdf", "bukti", { tanggal: "2026-07-20" });
      await berkas(tx, k.id, "Daftar paket pengadaan.xlsx", await xlsx("DAFTAR PAKET PENGADAAN ALAT LABORATORIUM 2026", ["No", "Paket", "Tanggal kontrak", "Nilai (Rp)", "Penyedia"], [[1, "Mikroskop digital", "2026-03-10", 198000000, "CV Contoh Sejahtera"], [2, "Spektrofotometer", "2026-03-24", 199500000, "CV Contoh Sejahtera"], [3, "Inkubator", "2026-04-07", 197800000, "CV Contoh Sejahtera"], [4, "Sentrifus", "2026-04-21", 199000000, "CV Contoh Sejahtera"], [5, "Autoklaf", "2026-05-05", 198200000, "CV Contoh Sejahtera"], [6, "Lemari asam", "2026-05-15", 247500000, "CV Contoh Sejahtera"]]), MIME_XLSX, "bukti", { tanggal: "2026-07-20" });
      await dokumen(tx, k, "kronologi", { tanggal: "2026-07-24", tahap: "telaah" });
      await selesai(tx, k.id, "telaah", "2026-07-27");
      await tim(tx, k.id, { nomorSk: "5120/UN32/KP/2026", tanggalSk: "2026-08-03", anggota: tm.anggota });
      await dokumen(tx, k, "sk_tim_pemeriksa", { tanggal: "2026-08-03", nomor: "5120/UN32/KP/2026", tahap: "pembentukan_tim" });
      await selesai(tx, k.id, "pembentukan_tim", "2026-08-03");
      await dokumen(tx, k, "lapor_sekjen", { tanggal: "2026-08-05", nomor: "5188/UN32/KP/2026", tahap: "lapor_sekjen" });
      await selesai(tx, k.id, "lapor_sekjen", "2026-08-05");
      await aturTahap(tx, k.id, "surat_tugas_sekretariat", "dilewati", "Tidak diperlukan.");
      await tx`insert into pembebasan_sementara (entri_id, nomor_sk, tanggal_sk, tanggal_mulai, catatan, created_by, updated_by)
        values (${k.id}, '5190/UN32/KP/2026', '2026-08-06', '2026-08-07', 'Dibebaskan sementara dari jabatan PPK agar tidak mempengaruhi pemeriksaan.', ${C.P.id}, ${C.P.id})`;
      await catatAudit(C.P, { aksi: "buat", tabel: "pembebasan_sementara", entri_id: k.id, ringkasan: { nomor_sk: "5190/UN32/KP/2026", simulasi: true } }, tx);
      await dokumen(tx, k, "sk_pembebasan_sementara", { tanggal: "2026-08-06", nomor: "5190/UN32/KP/2026", tahap: null });
      const s = await jadwal(tx, k.id, { tanggal: "2026-08-24", jam: "09:00", tempat: RUANG });
      await dokumen(tx, k, "surat_panggilan", { tanggal: "2026-08-10", nomor: "5301/UN32/KP/2026", tahap: "panggilan_1", sesiId: s });
      await selesai(tx, k.id, "panggilan_1", "2026-08-11");
      await aturTahap(tx, k.id, "panggilan_2", "dilewati", "Terperiksa hadir memenuhi Panggilan I.");
      await laksana(tx, k.id, s, { selesai: "12:00", hadir: true, rekam: true, jawaban: {
        9: "Saya membagi pengadaan menjadi beberapa paket karena anggaran cair bertahap.", 10: "Maret sampai Mei 2026 di fakultas.", 11: "Agar alat segera tersedia untuk praktikum semester genap.", 12: "Pejabat pengadaan dan bendahara mengetahui." },
        tambahan: [["Mengapa seluruh paket diberikan kepada penyedia yang sama?", "Penyedia tersebut yang paling cepat menyanggupi."], ["Apakah Saudara mengetahui ketentuan larangan pemecahan paket untuk menghindari tender?", "Saya mengetahuinya, tetapi saya anggap kebutuhan mendesak."]] });
      await dokumen(tx, k, "persetujuan_rekam", { tanggal: "2026-08-24", tahap: "pemeriksaan", sesiId: s });
      await selesai(tx, k.id, "pemeriksaan", "2026-08-24");
      await dokumen(tx, k, "bap", { tanggal: "2026-08-24", tahap: "bap", sesiId: s });
      await selesai(tx, k.id, "bap", "2026-08-25");
      await dokumen(tx, k, "lhp", { tanggal: "2026-09-14", tahap: "lhp", sesiId: s });
      await selesai(tx, k.id, "lhp", "2026-09-14");
      await dokumen(tx, k, "nota_dinas_kewenangan", { tanggal: "2026-09-16", nomor: "6011/UN32/KP/2026", tahap: "nota_dinas_kewenangan" });
      await selesai(tx, k.id, "nota_dinas_kewenangan", "2026-09-16");
      if (await adaTahap(tx, k.id, "usul_menteri")) await dokumen(tx, k, "usul_menteri", { tanggal: "2026-10-05", tahap: "usul_menteri", final: false });
      else await dokumen(tx, k, "sk_hukdis", { tanggal: "2026-10-05", tahap: "penetapan_sk", final: false });
    },
  },
  {
    kode: "S7", kelompok: "Informasi", judul: "Informasi — surat kaleng", ringkas: "Pelapor anonim, terlapor belum teridentifikasi (hanya ciri-ciri). Hanya pindaian surat. Belum bisa dinaikkan menjadi kasus.",
    async jalan(tx) {
      const inf = await informasi(tx, "S7", {
        judul: "Surat kaleng: dugaan pungutan biaya legalisir di loket akademik",
        ringkasan: "Surat tanpa nama pengirim di kotak saran menyebut ada \"oknum petugas di loket akademik lantai 1\" yang meminta uang Rp 50.000 untuk mempercepat legalisir ijazah. Tidak disebut nama, hanya ciri-ciri \"bapak berkacamata yang biasa jaga sore\". Tidak ada bukti terlampir.",
        tanggal: "2026-10-02", unitBebas: "Loket layanan akademik lantai 1 (fakultas belum jelas)", sumber: "surat", pelapor: "Anonim (surat kaleng)",
        catatan: "Pelapor anonim; terlapor belum teridentifikasi. Rencana: minta Kasubbag Akademik mencocokkan jadwal petugas loket sore, lalu klarifikasi. Belum dapat dinaikkan menjadi kasus sampai terlapor teridentifikasi di master pegawai.",
      });
      await berkas(tx, inf.id, "Pindaian surat kaleng.pdf", pdf("PINDAIAN SURAT TANPA NAMA (KOTAK SARAN)", ["Kepada Bapak/Ibu pimpinan,", "", "Saya mau melapor, di loket akademik lantai 1 ada bapak berkacamata yang biasa jaga sore minta uang 50 ribu kalau mau legalisir cepat jadi. Kalau tidak bayar katanya harus antri 2 minggu. Tolong ditertibkan. Terima kasih.", "", "(tanpa nama dan tanda tangan)", "", "Ditemukan di kotak saran Gedung A2 pada 1 Oktober 2026."]), "application/pdf", "bukti", { tanggal: "2026-10-02", keterangan: "Ditemukan di kotak saran Gedung A2", teks: "surat kaleng loket akademik pungutan legalisir 50 ribu bapak berkacamata jaga sore" });
    },
  },
  {
    kode: "S8", kelompok: "Informasi", judul: "Informasi — terlapor jelas, tingkat belum ditentukan", ringkas: "Pengaduan mahasiswa atas dosen; terlapor sudah tertaut ke master pegawai, tetapi jenis/tingkat hukuman belum dapat ditentukan.",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["III/b", "III/c", "III/d"], dosen: true });
      log(`   terlapor: ${t.nama_lengkap_gelar} — ${t.golongan_ruang}, ${t.jabatan}, ${t.unit_kerja}`);
      const inf = await informasi(tx, "S8", {
        judul: "Pengaduan mahasiswa: perkataan merendahkan saat bimbingan skripsi",
        ringkasan: `Tiga mahasiswa bimbingan melaporkan bahwa ${t.nama_lengkap_gelar} beberapa kali mengeluarkan perkataan yang merendahkan saat bimbingan skripsi dan menunda tanda tangan persetujuan tanpa alasan jelas. Laporan disampaikan melalui Ketua Departemen. Perlu klarifikasi untuk menentukan apakah termasuk pelanggaran disiplin dan tingkatnya.`,
        tanggal: "2026-10-05", peristiwa: "2026-09-30", pegawai: t, sumber: "laporan_lisan", pelapor: "Ketua Departemen (meneruskan pengaduan 3 mahasiswa)", kontak: "Ekstensi 1234",
        catatan: "Terlapor sudah teridentifikasi di master pegawai. Tingkat dugaan hukuman belum dapat ditentukan: menunggu klarifikasi dan keterangan saksi.",
      });
      await berkas(tx, inf.id, "Surat pengaduan mahasiswa.pdf", pdf("SURAT PENGADUAN", ["Kepada Yth. Ketua Departemen", "", `Kami, tiga mahasiswa bimbingan skripsi ${t.nama_lengkap_gelar}, menyampaikan keberatan atas perkataan yang merendahkan saat bimbingan pada 16, 23, dan 30 September 2026, serta penundaan tanda tangan persetujuan seminar tanpa alasan.`, "", "Malang, 1 Oktober 2026", "(nama dan NIM pelapor dirahasiakan dalam salinan ini)"]), "application/pdf", "bukti", { tanggal: "2026-10-05" });
    },
  },

  // ---------------------------------------------------------------- kondisi lapangan tambahan
  {
    kode: "S9", kelompok: "Lapangan", judul: "Dihentikan — tidak terbukti", ringkas: "Dugaan pungutan di luar ketentuan; setelah diperiksa dan saksi diminta keterangan, tidak terbukti → kasus dihentikan dengan alasan tertulis.",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["II/d", "III/a", "III/b"], dosen: false });
      const tm = await timTiga(tx, t, ["IV/a", "IV/b", "IV/c"]);
      terperiksaLog(t);
      const inf = await informasi(tx, "S9", { judul: "Laporan lisan: dugaan pungutan pada layanan surat keterangan", ringkasan: `Seorang mahasiswa melapor secara lisan bahwa ${t.nama_lengkap_gelar} meminta "uang administrasi" Rp 25.000 untuk surat keterangan aktif kuliah.`, tanggal: "2026-07-06", peristiwa: "2026-07-01", pegawai: t, sumber: "laporan_lisan", pelapor: "Mahasiswa (identitas dicatat terpisah)" });
      const k = await kasus(tx, "S9", inf, {
        judul: "Dugaan melakukan pungutan di luar ketentuan pada layanan surat keterangan", tanggal: "2026-07-08", peristiwa: "2026-07-01", pegawai: t, tingkat: "sedang", sumber: "laporan_lisan",
        ringkasan: `${t.nama_lengkap_gelar} diduga meminta uang Rp 25.000 untuk penerbitan surat keterangan aktif kuliah pada 1 Juli 2026.`,
        pelanggaran: [{ pasal: { jenis: "larangan", cari: "pungutan di luar ketentuan" }, uraian: "Diduga meminta uang administrasi untuk layanan surat keterangan yang tidak dipungut biaya.", dampak: "instansi", waktu: "1 Juli 2026", tempat: t.unit_kerja ?? "Loket layanan" }],
        isian: { ...atasan(tm.ketua) },
      });
      await dokumen(tx, k, "kronologi", { tanggal: "2026-07-09", tahap: "telaah" });
      await selesai(tx, k.id, "telaah", "2026-07-13");
      await tim(tx, k.id, { nomorSk: "4710/UN32/KP/2026", tanggalSk: "2026-07-20", anggota: tm.anggota });
      await dokumen(tx, k, "sk_tim_pemeriksa", { tanggal: "2026-07-20", nomor: "4710/UN32/KP/2026", tahap: "pembentukan_tim" });
      await selesai(tx, k.id, "pembentukan_tim", "2026-07-20");
      await dokumen(tx, k, "lapor_sekjen", { tanggal: "2026-07-22", nomor: "4777/UN32/KP/2026", tahap: "lapor_sekjen" });
      await selesai(tx, k.id, "lapor_sekjen", "2026-07-22");
      await aturTahap(tx, k.id, "surat_tugas_sekretariat", "dilewati", "Tidak diperlukan.");
      const s = await jadwal(tx, k.id, { tanggal: "2026-08-10", jam: "09:00", tempat: RUANG });
      await dokumen(tx, k, "surat_panggilan", { tanggal: "2026-07-27", nomor: "4890/UN32/KP/2026", tahap: "panggilan_1", sesiId: s });
      await selesai(tx, k.id, "panggilan_1", "2026-07-28");
      await aturTahap(tx, k.id, "panggilan_2", "dilewati", "Terperiksa hadir memenuhi Panggilan I.");
      await laksana(tx, k.id, s, { selesai: "10:30", hadir: true, rekam: true, jawaban: {
        9: "Tidak benar. Uang Rp 25.000 itu titipan mahasiswa untuk fotokopi dan map legalisir yang ia minta saya belikan, dan sudah saya kembalikan kembaliannya.", 10: "1 Juli 2026 di loket layanan.", 11: "Mahasiswa meminta tolong karena koperasi tutup.", 12: "Rekan loket, Sdr. A, melihat kejadiannya." } });
      await dokumen(tx, k, "persetujuan_rekam", { tanggal: "2026-08-10", tahap: "pemeriksaan", sesiId: s });
      await selesai(tx, k.id, "pemeriksaan", "2026-08-10");
      await dokumen(tx, k, "bap", { tanggal: "2026-08-10", tahap: "bap", sesiId: s });
      await selesai(tx, k.id, "bap", "2026-08-11");
      await berkas(tx, k.id, "Keterangan saksi rekan loket.pdf", pdf("KETERANGAN SAKSI", ["Saya yang bertugas di loket yang sama menerangkan bahwa pada 1 Juli 2026 mahasiswa pelapor menitipkan uang untuk dibelikan map dan fotokopi karena koperasi tutup, dan kembalian telah diserahkan kembali.", "", "Malang, 12 Agustus 2026"]), "application/pdf", "bukti", { tanggal: "2026-08-12" });
      // Template LHP hanya berisi rekomendasi penjatuhan hukuman; LHP "tidak terbukti" disusun manual lalu diunggah.
      await berkas(tx, k.id, "LHP Tim Pemeriksa - tidak terbukti.pdf", pdf("LAPORAN HASIL PEMERIKSAAN", [`Terperiksa: ${t.nama_lengkap_gelar}, NIP ${t.nip}`, "", "Fakta: uang Rp 25.000 merupakan titipan mahasiswa untuk pembelian map dan fotokopi karena koperasi tutup; kembalian telah diserahkan (dikuatkan keterangan saksi).", "", "Kesimpulan: dugaan pelanggaran larangan melakukan pungutan di luar ketentuan TIDAK TERBUKTI.", "Rekomendasi: proses dihentikan; terperiksa diingatkan agar tidak menerima titipan uang dari pengguna layanan.", "", "Malang, 17 Agustus 2026", "Tim Pemeriksa"]), "application/pdf", "dokumen_terbit", { tanggal: "2026-08-17", keterangan: "Disusun manual (template LHP belum memiliki varian tidak terbukti)" });
      await selesai(tx, k.id, "lhp", "2026-08-17");
      const alasan = "Berdasarkan pemeriksaan dan keterangan saksi, uang tersebut adalah titipan pembelian map/fotokopi atas permintaan mahasiswa; unsur pungutan di luar ketentuan tidak terbukti.";
      await tx`update entri set status_kasus = 'dihentikan', alasan_penghentian = 'tidak_terbukti', tanggal_selesai = '2026-08-19',
          catatan_internal = trim(both from coalesce(catatan_internal, '') || ${`\n[Dihentikan] ${alasan}`}), updated_by = ${C.P.id} where id = ${k.id}`;
      await tx`update tahapan_kasus set status = 'dilewati' where entri_id = ${k.id} and status in ('belum', 'berjalan')`;
      await catatAudit(C.P, { aksi: "ubah", tabel: "entri", record_id: k.id, entri_id: k.id, alasan, ringkasan: { status_kasus: "dihentikan", alasan_penghentian: "tidak_terbukti", simulasi: true } }, tx);
      log("     ⛔ Kasus dihentikan: tidak terbukti (19 Agustus 2026)");
    },
  },
  {
    kode: "S10", kelompok: "Lapangan", judul: "Upaya administratif — keberatan", ringkas: "TMK 15 hari → SK hukuman sedang sudah diterima; terperiksa mengajukan keberatan, menunggu putusan.",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["III/a", "III/b", "III/c"], dosen: false });
      const tm = await timTiga(tx, t, ["IV/a", "IV/b", "IV/c"]);
      terperiksaLog(t);
      await kehadiran(tx, t.id, 2026, { 5: 4, 6: 5, 7: 6 });
      const inf = await informasi(tx, "S10", { judul: "Rekap presensi Mei–Juli 2026: 15 hari tanpa keterangan", ringkasan: `${t.nama_lengkap_gelar} tidak masuk kerja tanpa keterangan 15 hari kerja kumulatif Mei–Juli 2026.`, tanggal: "2026-08-03", peristiwa: "2026-07-31", pegawai: t, sumber: "presensi" });
      const k = await kasus(tx, "S10", inf, {
        judul: "Tidak masuk kerja tanpa alasan sah 15 hari kerja kumulatif (Mei–Juli 2026)", tanggal: "2026-08-04", peristiwa: "2026-07-31", pegawai: t, tingkat: "sedang", hariTmk: 15, sumber: "presensi",
        ringkasan: `${t.nama_lengkap_gelar} tidak masuk kerja tanpa alasan sah 15 hari kerja kumulatif: Mei (4), Juni (5), dan Juli (6) 2026.`,
        pelanggaran: [{ pasal: PASAL_HADIR, uraian: "Tidak masuk kerja tanpa alasan sah 15 hari kerja kumulatif tahun 2026.", dampak: "instansi", waktu: "Mei – Juli 2026", tempat: t.unit_kerja ?? "Unit kerja" }],
        isian: { ...atasan(tm.ketua), faktor_memberatkan: "Berulang selama tiga bulan.", faktor_meringankan: "-" },
      });
      await berkas(tx, k.id, "Rekap presensi Mei-Juli 2026.xlsx", await xlsxPresensi(t, 2026, { 5: 4, 6: 5, 7: 6 }), MIME_XLSX, "bukti", { tanggal: "2026-08-04" });
      await dokumen(tx, k, "rekapitulasi_tmk", { tanggal: "2026-08-05", tahap: "telaah" });
      await selesai(tx, k.id, "telaah", "2026-08-06");
      await tim(tx, k.id, { nomorSk: "5350/UN32/KP/2026", tanggalSk: "2026-08-10", anggota: tm.anggota });
      await dokumen(tx, k, "sk_tim_pemeriksa", { tanggal: "2026-08-10", nomor: "5350/UN32/KP/2026", tahap: "pembentukan_tim" });
      await selesai(tx, k.id, "pembentukan_tim", "2026-08-10");
      await dokumen(tx, k, "lapor_sekjen", { tanggal: "2026-08-12", nomor: "5401/UN32/KP/2026", tahap: "lapor_sekjen" });
      await selesai(tx, k.id, "lapor_sekjen", "2026-08-12");
      await aturTahap(tx, k.id, "surat_tugas_sekretariat", "dilewati", "Tidak diperlukan.");
      const s = await jadwal(tx, k.id, { tanggal: "2026-08-25", jam: "10:00", tempat: RUANG });
      await dokumen(tx, k, "surat_panggilan", { tanggal: "2026-08-13", nomor: "5420/UN32/KP/2026", tahap: "panggilan_1", sesiId: s });
      await selesai(tx, k.id, "panggilan_1", "2026-08-14");
      await aturTahap(tx, k.id, "panggilan_2", "dilewati", "Terperiksa hadir memenuhi Panggilan I.");
      await laksana(tx, k.id, s, { selesai: "11:15", hadir: true, rekam: true, jawaban: { 9: "Benar sebagian; beberapa hari saya sakit tetapi tidak sempat mengurus surat dokter.", 10: "Mei sampai Juli 2026.", 11: "Sakit dan urusan keluarga.", 12: "Tidak ada." } });
      await selesai(tx, k.id, "pemeriksaan", "2026-08-25");
      await dokumen(tx, k, "bap", { tanggal: "2026-08-25", tahap: "bap", sesiId: s });
      await selesai(tx, k.id, "bap", "2026-08-26");
      await dokumen(tx, k, "lhp", { tanggal: "2026-08-28", tahap: "lhp", sesiId: s });
      await selesai(tx, k.id, "lhp", "2026-08-28");
      await selesai(tx, k.id, "nota_dinas_kewenangan", "2026-08-28");
      await hukuman(tx, k, { jenisKode: "tukin_25_9", nomorSk: "5701/UN32/KP/2026", tanggalSk: "2026-08-31", pejabat: "Rektor" });
      await dokumen(tx, k, "sk_hukdis", { tanggal: "2026-08-31", nomor: "5701/UN32/KP/2026", tahap: "penetapan_sk" });
      await selesai(tx, k.id, "penetapan_sk", "2026-08-31");
      await hukuman(tx, k, { jenisKode: "tukin_25_9", nomorSk: "5701/UN32/KP/2026", tanggalSk: "2026-08-31", pejabat: "Rektor", tanggalDiterima: "2026-09-02" });
      await selesai(tx, k.id, "penyampaian_sk", "2026-09-02");
      const [e] = await tx`select regulasi_id from entri where id = ${k.id}`;
      const a = await muatAturan(e.regulasi_id, tx);
      const tg = a.tenggat.find((x) => x.kode_tahap === "upaya_administratif");
      const pengingat = tg ? hitungTanggalTenggat({ ...tg, dihitung_dari: "upaya_administratif" }, "2026-09-10", await muatKalender(tx)) : null;
      await tx`insert into upaya_administratif (entri_id, jenis, tanggal_pengajuan, diajukan_kepada, tenggat_pengingat, catatan, created_by, updated_by)
        values (${k.id}, 'keberatan', '2026-09-10', 'Rektor', ${pengingat}, 'Terperiksa menyatakan sebagian ketidakhadiran karena sakit dan melampirkan surat keterangan dokter susulan.', ${C.P.id}, ${C.P.id})`;
      await tx`update entri set status_kasus = 'upaya_administratif' where id = ${k.id}`;
      await catatAudit(C.P, { aksi: "buat", tabel: "upaya_administratif", entri_id: k.id, ringkasan: { jenis: "keberatan", tanggal_pengajuan: "2026-09-10", simulasi: true } }, tx);
      await berkas(tx, k.id, "Surat keberatan terperiksa.pdf", pdf("SURAT KEBERATAN", ["Kepada Yth. Rektor Universitas Negeri Malang", "", "Dengan hormat, saya mengajukan keberatan atas Keputusan Nomor 5701/UN32/KP/2026 karena 6 dari 15 hari ketidakhadiran saya disebabkan sakit. Terlampir surat keterangan dokter.", "", "Malang, 10 September 2026", t.nama_lengkap_gelar]), "application/pdf", "lainnya", { tanggal: "2026-09-10" });
      log("     📨 Keberatan diajukan 10 September 2026 — status kasus: upaya administratif");
    },
  },
  {
    kode: "S11", kelompok: "Lapangan", judul: "PTNA — Peraturan Rektor 70/2026", ringkas: "Pegawai PTNA otomatis memakai Pertor 70/2026 (bukan PP 94/2021): ada pemotongan insentif kinerja. Sedang berjalan, pemeriksaan dijadwalkan.",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["III/a", "III/b", "III/c", "II/c", "II/d"], dosen: false, status: "PTNA" }).catch(() => pegawai(tx, { gol: ["III/a", "III/b", "III/c"], dosen: true, status: "PTNA" }));
      terperiksaLog(t);
      await kehadiran(tx, t.id, 2026, { 9: 5 });
      const inf = await informasi(tx, "S11", { judul: "Rekap presensi September 2026: 5 hari tanpa keterangan (PTNA)", ringkasan: `${t.nama_lengkap_gelar} (PTNA) tidak masuk kerja tanpa keterangan 5 hari kerja pada September 2026.`, tanggal: "2026-10-01", peristiwa: "2026-09-30", pegawai: t, sumber: "presensi" });
      const k = await kasus(tx, "S11", inf, {
        judul: "Tidak masuk kerja tanpa alasan sah 5 hari kerja (September 2026)", tanggal: "2026-10-02", peristiwa: "2026-09-30", pegawai: t, tingkat: "ringan", hariTmk: 5, sumber: "presensi",
        ringkasan: `${t.nama_lengkap_gelar} tidak masuk kerja tanpa alasan sah 5 hari kerja pada September 2026.`,
        pelanggaran: [{ pasal: { teksBebas: "Kewajiban masuk kerja dan menaati ketentuan jam kerja (Peraturan Rektor UM Nomor 70 Tahun 2026)" }, uraian: "Tidak masuk kerja tanpa alasan sah 5 hari kerja pada September 2026.", dampak: "unit_kerja", waktu: "September 2026", tempat: t.unit_kerja ?? "Unit kerja" }],
      });
      await berkas(tx, k.id, "Rekap presensi September 2026.xlsx", await xlsxPresensi(t, 2026, { 9: 5 }), MIME_XLSX, "bukti", { tanggal: "2026-10-02" });
      await dokumen(tx, k, "rekapitulasi_tmk", { tanggal: "2026-10-02", tahap: "telaah" });
      await selesai(tx, k.id, "telaah", "2026-10-05");
      if (await adaTahap(tx, k.id, "pembentukan_tim")) {
        const tm = await timTiga(tx, t, ["III/d", "IV/a", "IV/b"]);
        await tim(tx, k.id, { nomorSk: "6650/UN32/KP/2026", tanggalSk: "2026-10-06", pembentuk: "Dekan/Pimpinan unit", anggota: tm.anggota });
        await selesai(tx, k.id, "pembentukan_tim", "2026-10-06");
      }
      const s = await jadwal(tx, k.id, { tanggal: "2026-10-19", jam: "09:00" });
      await dokumen(tx, k, "surat_panggilan", { tanggal: "2026-10-07", nomor: "6702/UN32/KP/2026", tahap: "panggilan_1", sesiId: s, isian: { nama_atasan_langsung: "[Atasan langsung]", nip_atasan_langsung: "-", jabatan_atasan_langsung: "Kepala Unit" } });
      await selesai(tx, k.id, "panggilan_1", "2026-10-08");
      log("     ⓘ Katalog pasal Pertor 70/2026 masih \"[Belum diisi]\" → pelanggaran dicatat dengan uraian pasal bebas");
    },
  },
  {
    kode: "S12", kelompok: "Lapangan", judul: "TMK 10 hari berturut-turut → penghentian gaji", ringkas: "Alur khusus: mesin aturan mendeteksi 10 hari berturut-turut → berat + checklist penghentian pembayaran gaji (belum sampai SK KPA).",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["II/c", "II/d", "III/a", "III/b"], dosen: false });
      const tm = await timTiga(tx, t, ["IV/a", "IV/b", "IV/c"]);
      terperiksaLog(t);
      await kehadiran(tx, t.id, 2026, { 9: 10 }, 10);
      const inf = await informasi(tx, "S12", { judul: "Pegawai tidak masuk sejak 14 September 2026 tanpa kabar", ringkasan: `${t.nama_lengkap_gelar} tidak masuk kerja sejak 14 September 2026 dan tidak dapat dihubungi. Per 25 September 2026 sudah 10 hari kerja berturut-turut.`, tanggal: "2026-09-28", peristiwa: "2026-09-25", pegawai: t, sumber: "laporan_lisan", pelapor: "Atasan langsung" });
      const k = await kasus(tx, "S12", inf, {
        judul: "Tidak masuk kerja 10 hari kerja berturut-turut tanpa alasan sah", tanggal: "2026-09-29", peristiwa: "2026-09-25", pegawai: t, tingkat: "berat", hariTmk: 10, hariTmkBerturut: 10, sumber: "laporan_lisan", pelapor: "Atasan langsung",
        ringkasan: `${t.nama_lengkap_gelar} tidak masuk kerja sejak 14 September 2026 (10 hari kerja berturut-turut per 25 September 2026), tidak memberi kabar, dan tidak dapat dihubungi melalui telepon maupun alamat rumah.`,
        pelanggaran: [{ pasal: PASAL_HADIR, uraian: "Tidak masuk kerja 10 hari kerja berturut-turut tanpa alasan sah.", dampak: "instansi", waktu: "14 – 25 September 2026", tempat: t.unit_kerja ?? "Unit kerja" }],
        isian: { ...atasan(tm.ketua) },
      });
      await berkas(tx, k.id, "Rekap presensi September 2026.xlsx", await xlsxPresensi(t, 2026, { 9: 10 }), MIME_XLSX, "bukti", { tanggal: "2026-09-29" });
      await berkas(tx, k.id, "Berita acara kunjungan ke rumah.pdf", pdf("BERITA ACARA KUNJUNGAN", ["Pada 26 September 2026 petugas mendatangi alamat rumah pegawai yang bersangkutan. Rumah dalam keadaan kosong; menurut tetangga, yang bersangkutan sudah dua minggu tidak terlihat.", "", "Malang, 26 September 2026"]), "application/pdf", "bukti", { tanggal: "2026-09-29" });
      await tx`insert into penghentian_gaji (entri_id, tanggal_mulai_tmk, jumlah_hari_berturut, tanggal_lapor_atasan, tanggal_verval, status, catatan, created_by, updated_by)
        values (${k.id}, '2026-09-14', 10, '2026-09-28', '2026-10-01', 'berjalan', 'Menunggu penyampaian ke KPA untuk penghentian pembayaran gaji mulai bulan berikutnya.', ${C.P.id}, ${C.P.id})`;
      await catatAudit(C.P, { aksi: "buat", tabel: "penghentian_gaji", entri_id: k.id, ringkasan: { tanggal_mulai_tmk: "2026-09-14", jumlah_hari_berturut: 10, simulasi: true } }, tx);
      await dokumen(tx, k, "rekapitulasi_tmk", { tanggal: "2026-09-30", tahap: "telaah" });
      await dokumen(tx, k, "kronologi", { tanggal: "2026-09-30", tahap: "telaah" });
      await selesai(tx, k.id, "telaah", "2026-10-01");
      await tim(tx, k.id, { nomorSk: "6590/UN32/KP/2026", tanggalSk: "2026-10-05", anggota: tm.anggota });
      await dokumen(tx, k, "sk_tim_pemeriksa", { tanggal: "2026-10-05", nomor: "6590/UN32/KP/2026", tahap: "pembentukan_tim" });
      await selesai(tx, k.id, "pembentukan_tim", "2026-10-05");
      await dokumen(tx, k, "lapor_sekjen", { tanggal: "2026-10-08", tahap: "lapor_sekjen", final: false });
      log("     💰 Checklist penghentian gaji: lapor atasan ✓, verval ✓, ke KPA … belum");
    },
  },
  {
    kode: "S13", kelompok: "Lapangan", judul: "Mendekati tenggat", ringkas: "TMK 8 hari → pernyataan tidak puas. Pemeriksaan dijadwalkan; Surat Panggilan I masih DRAF padahal harus diterima ≤ 7 hari kerja sebelum pemeriksaan.",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["III/b", "III/c", "III/d"], dosen: true });
      const ats = await pegawai(tx, { gol: ["IV/a", "IV/b", "IV/c"], dosen: true, fakultas: await fakultas(tx, t.id) });
      terperiksaLog(t);
      await kehadiran(tx, t.id, 2026, { 8: 3, 9: 5 });
      const inf = await informasi(tx, "S13", { judul: "Dosen 8 hari tidak masuk kerja (Agustus–September 2026)", ringkasan: `${t.nama_lengkap_gelar} tidak masuk kerja tanpa keterangan 8 hari kerja pada Agustus–September 2026.`, tanggal: "2026-10-01", peristiwa: "2026-09-30", pegawai: t, sumber: "presensi" });
      const k = await kasus(tx, "S13", inf, {
        judul: "Tidak masuk kerja tanpa alasan sah 8 hari kerja (Agustus–September 2026)", tanggal: "2026-10-02", peristiwa: "2026-09-30", pegawai: t, tingkat: "ringan", hariTmk: 8, sumber: "presensi",
        ringkasan: `${t.nama_lengkap_gelar} tidak masuk kerja tanpa alasan sah 8 hari kerja: Agustus (3) dan September (5) 2026.`,
        pelanggaran: [{ pasal: PASAL_HADIR, uraian: "Tidak masuk kerja tanpa alasan sah 8 hari kerja tahun 2026.", dampak: "unit_kerja", waktu: "Agustus – September 2026", tempat: t.unit_kerja ?? "Unit kerja" }],
        isian: { ...atasan(ats, "Ketua Departemen") },
      });
      await berkas(tx, k.id, "Rekap presensi 2026.xlsx", await xlsxPresensi(t, 2026, { 8: 3, 9: 5 }), MIME_XLSX, "bukti", { tanggal: "2026-10-02" });
      await dokumen(tx, k, "kronologi", { tanggal: "2026-10-05", tahap: "telaah" });
      await dokumen(tx, k, "rekapitulasi_tmk", { tanggal: "2026-10-05", tahap: "telaah" });
      await selesai(tx, k.id, "telaah", "2026-10-07");
      const s = await jadwal(tx, k.id, { tanggal: "2026-10-21", jam: "09:00" });
      await dokumen(tx, k, "surat_panggilan", { tanggal: "2026-10-09", tahap: "panggilan_1", sesiId: s, final: false });
    },
  },
  {
    kode: "S14", kelompok: "Lapangan", judul: "Informasi ditutup tanpa tindak lanjut", ringkas: "Laporan ternyata salah paham (pegawai sedang tugas luar yang sah). Informasi ditutup dengan alasan — tetap tersimpan, tidak dihitung sebagai kasus.",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["III/a", "III/b", "III/c", "III/d"], dosen: false });
      log(`   terlapor: ${t.nama_lengkap_gelar}`);
      const inf = await informasi(tx, "S14", { judul: "Laporan: pegawai sering tidak di tempat pada jam kerja", ringkasan: `Laporan melalui kanal pengaduan bahwa ${t.nama_lengkap_gelar} sering tidak berada di ruangan pada jam kerja selama minggu kedua September 2026.`, tanggal: "2026-09-15", peristiwa: "2026-09-11", pegawai: t, sumber: "surat", pelapor: "Kanal pengaduan daring" });
      await berkas(tx, inf.id, "Surat tugas luar kantor.pdf", pdf("SURAT TUGAS", [`Menugaskan ${t.nama_lengkap_gelar} untuk mendampingi kegiatan akreditasi di kampus 2 dan kampus 3 pada 7-11 September 2026.`, "", "Malang, 4 September 2026"]), "application/pdf", "bukti", { tanggal: "2026-09-18", keterangan: "Diperoleh saat klarifikasi ke atasan" });
      const alasan = "Hasil klarifikasi: yang bersangkutan sedang melaksanakan surat tugas pendampingan akreditasi di kampus 2 dan 3 pada 7–11 September 2026. Tidak ada pelanggaran.";
      await tx`update entri set status_kasus = 'tercatat', catatan_internal = ${`[Ditutup tanpa tindak lanjut] ${alasan}`}, updated_by = ${C.P.id} where id = ${inf.id}`;
      await catatAudit(C.P, { aksi: "ubah", tabel: "entri", record_id: inf.id, entri_id: inf.id, alasan, ringkasan: { status_kasus: "tercatat", simulasi: true } }, tx);
      log("     ✔ Informasi ditutup tanpa tindak lanjut (tetap tersimpan)");
    },
  },
  {
    kode: "S15", kelompok: "Lapangan", judul: "Pembinaan (bukan hukuman disiplin)", ringkas: "Keterlambatan ringan berulang ditangani dengan teguran pembinaan oleh atasan — dicatat sebagai pembinaan, bukan kasus hukdis.",
    async jalan(tx) {
      const t = await pegawai(tx, { gol: ["II/c", "II/d", "III/a", "III/b"], dosen: false });
      log(`   pegawai: ${t.nama_lengkap_gelar}`);
      const inf = await informasi(tx, "S15", { judul: "Sering terlambat masuk kerja (Agustus 2026)", ringkasan: `${t.nama_lengkap_gelar} tercatat terlambat masuk kerja 9 kali pada Agustus 2026 (15–40 menit), tanpa ketidakhadiran penuh.`, tanggal: "2026-09-02", peristiwa: "2026-08-31", pegawai: t, sumber: "presensi" });
      const nh = await entriSederhana(tx, "S15", {
        kelas: "non_hukdis", judul: "Teguran pembinaan: keterlambatan masuk kerja berulang", tanggal: "2026-09-07", peristiwa: "2026-08-31", pegawai: t, jenisNonHukdis: "teguran_pembinaan", berasalDari: inf,
        ringkasan: "Atasan langsung memberikan teguran pembinaan dan meminta komitmen tertulis untuk hadir tepat waktu. Akan dievaluasi pada akhir Oktober 2026.",
        catatan: "Data simulasi alur SIMPEL (pelatihan/uji coba).",
      });
      await berkas(tx, nh.id, "Surat pernyataan komitmen.pdf", pdf("SURAT PERNYATAAN", [`Saya, ${t.nama_lengkap_gelar}, berjanji untuk hadir tepat waktu sesuai jam kerja dan bersedia dievaluasi pada akhir Oktober 2026.`, "", "Malang, 7 September 2026"]), "application/pdf", "lainnya", { tanggal: "2026-09-07" });
    },
  },
  {
    kode: "S16", kelompok: "Lapangan", judul: "Arsip hukuman lampau", ringkas: "Dua hukuman lama (PP 53/2010) dicatat sebagai arsip: satu untuk terperiksa S5 (riwayat/residivis), satu untuk pegawai lain.",
    async jalan(tx) {
      const [s5] = await tx`select pegawai_id from entri where data_tambahan->>'simulasi' = 'S5' and kelas = 'hukdis' and diarsipkan_pada is null limit 1`;
      const p5 = s5 ? ((await tx`select id, nip, nama_lengkap_gelar, golongan_ruang, unit_kerja, jabatan_fungsional as jabatan from pegawai where id = ${s5.pegawai_id}`)[0] as unknown as Pg) : await pegawai(tx, { gol: ["III/b", "III/c"], dosen: true });
      const lain = await pegawai(tx, { gol: ["II/d", "III/a", "III/b"], dosen: false });
      const arsip = async (pg: Pg, m: { tahun: number; tanggal: string; judul: string; jenis: string; nomorSk: string; tanggalSk: string; pasal: string }) => {
        const e = await entriSederhana(tx, "S16", { kelas: "arsip", judul: m.judul, ringkasan: m.judul, tanggal: "2026-09-21", peristiwa: m.tanggalSk, tahun: m.tahun, pegawai: pg, regulasiKode: "PP_53_2010", catatan: "Dicatat dari arsip fisik (pindaian SK)." });
        const [j] = await tx`select j.id, j.kode, j.nama, j.durasi_bulan, t.nama as tingkat, t.kode as tingkat_kode from jenis_hukuman j join tingkat_hukuman t on t.id = j.tingkat_hukuman_id
          join regulasi r on r.id = j.regulasi_id where r.kode = 'PP_53_2010' and j.kode = ${m.jenis}`;
        await tx`update entri set jenis_hukuman_id = ${j.id} where id = ${e.id}`;
        await tx`insert into hukuman (entri_id, jenis_hukuman_id, snapshot_jenis_hukuman, nomor_sk, tanggal_sk, catatan, created_by, updated_by)
          values (${e.id}, ${j.id}, ${tx.json({ kode: j.kode, nama: j.nama, tingkat: j.tingkat, tingkat_kode: j.tingkat_kode, durasi_bulan: j.durasi_bulan, regulasi: "PP 53/2010", sumber: "arsip", dicatat_pada: new Date().toISOString() } as never)},
            ${m.nomorSk}, ${m.tanggalSk}, 'Data arsip kasus lampau', ${C.P.id}, ${C.P.id})`;
        await tx`insert into pelanggaran_entri (entri_id, pasal_teks_bebas, uraian_perbuatan, urutan, created_by, updated_by) values (${e.id}, ${m.pasal}, ${m.judul}, 1, ${C.P.id}, ${C.P.id})`;
        await berkas(tx, e.id, `Pindaian SK ${m.tahun}.pdf`, pdf("PINDAIAN ARSIP KEPUTUSAN", [`Nomor ${m.nomorSk} tanggal ${m.tanggalSk}`, `${j.nama} kepada ${pg.nama_lengkap_gelar}, NIP ${pg.nip}.`, "", "[pindaian arsip fisik]"]), "application/pdf", "pindaian_arsip", { tanggal: "2026-09-21" });
      };
      await arsip(p5, { tahun: 2019, tanggal: "2019-03-11", judul: "Tidak masuk kerja 8 hari kerja tanpa alasan sah (2019)", jenis: "teguran_tertulis", nomorSk: "1102/UN32/KP/2019", tanggalSk: "2019-03-11", pasal: "PP 53/2010 Pasal 3 angka 11" });
      await arsip(lain, { tahun: 2017, tanggal: "2017-10-02", judul: "Tidak menaati ketentuan jam kerja (2017)", jenis: "tunda_kgb", nomorSk: "3341/UN32/KP/2017", tanggalSk: "2017-10-02", pasal: "PP 53/2010 Pasal 3 angka 11" });
    },
  },
];

// ------------------------------------------------------------------ jalankan
export type HasilSkenario = { kode: string; ok: boolean; dilewati?: boolean; nomor?: string; status?: string; pesan?: string; log: string[] };

/** Menjalankan satu skenario di dalam satu transaksi. `simpan: false` = uji kering (dibatalkan). */
export async function jalankanSkenario(kode: string, o: { pengguna: Pengguna; simpan: boolean; penyimpanan?: Penyimpanan; salin?: Konteks["salin"]; log?: (s: string) => void }): Promise<HasilSkenario> {
  const sk = SKENARIO.find((s) => s.kode === kode);
  if (!sk) throw new GalatPengguna(`Skenario ${kode} tidak dikenal.`);
  const baris: string[] = [];
  C = { P: o.pengguna, st: o.penyimpanan ?? penyimpananSupabase, log: (s) => { baris.push(s); o.log?.(s); }, salin: o.salin, unggahan: [], template: C?.template ?? new Map() };
  dipakai.clear();
  const [ada] = await sql`select nomor_registrasi from entri where data_tambahan->>'simulasi' = ${kode} and diarsipkan_pada is null limit 1`;
  if (ada && o.simpan) return { kode, ok: true, dilewati: true, nomor: ada.nomor_registrasi, pesan: "Sudah ada", log: baris };
  log(`■ ${kode} — ${sk.judul}`);
  class Batal extends Error {}
  try {
    const r = await sql.begin(async (t) => {
      const tx = t as unknown as Sql;
      await sk.jalan(tx);
      const [ring] = await tx`select e.nomor_registrasi, s.nama as status,
          (select count(*) from tahapan_kasus where entri_id = e.id and status in ('selesai', 'dilewati'))::int as beres,
          (select count(*) from tahapan_kasus where entri_id = e.id)::int as total
        from entri e join status_kasus s on s.kode = e.status_kasus
        where e.data_tambahan->>'simulasi' = ${kode} order by (e.kelas = 'hukdis') desc, e.created_at desc limit 1`;
      log(`   ⇒ ${ring.nomor_registrasi}: status "${ring.status}"${ring.total ? `, tahapan ${ring.beres}/${ring.total} selesai/dilewati` : ""}`);
      if (!o.simpan) throw new Batal();
      return ring;
    });
    return { kode, ok: true, nomor: r.nomor_registrasi, status: r.status, log: baris };
  } catch (e) {
    if (C.unggahan.length) await C.st.hapus(C.unggahan).catch(() => {});
    if (e instanceof Batal) return { kode, ok: true, log: baris };
    const pesan = (e as Error).message;
    log(`   ✗ GAGAL: ${pesan}`);
    return { kode, ok: false, pesan, log: baris };
  }
}

/** Mengarsipkan (soft delete) semua data simulasi; tercatat di log audit. */
export async function arsipkanSimulasi(pengguna: Pengguna) {
  return sql.begin(async (t) => {
    const tx = t as unknown as Sql;
    const rows = await tx`update entri set diarsipkan_pada = now(), diarsipkan_oleh = ${pengguna.id}, alasan_diarsipkan = 'Data simulasi diarsipkan'
      where data_tambahan ? 'simulasi' and diarsipkan_pada is null returning id`;
    for (const r of rows) await catatAudit(pengguna, { aksi: "arsipkan", tabel: "entri", record_id: r.id, entri_id: r.id, alasan: "Data simulasi diarsipkan" }, tx);
    return rows.length;
  });
}

/** Ringkasan entri simulasi yang aktif, per kode skenario. */
export async function daftarSimulasi() {
  const rows = await sql`select e.id, e.kelas, e.nomor_registrasi, e.data_tambahan->>'simulasi' as kode, s.nama as status,
      (select count(*) from dokumen d where d.entri_id = e.id)::int as dokumen, (select count(*) from berkas b where b.entri_id = e.id)::int as berkas
    from entri e join status_kasus s on s.kode = e.status_kasus
    where e.data_tambahan ? 'simulasi' and e.diarsipkan_pada is null order by e.created_at`;
  return rows as unknown as { id: string; kelas: string; nomor_registrasi: string; kode: string; status: string; dokumen: number; berkas: number }[];
}
