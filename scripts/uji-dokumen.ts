// Uji ujung-ke-ujung pembangkit dokumen terhadap basis data (PRD §7, §1, §18.3).
//
// Jalankan:
//   npx tsx --conditions=react-server --env-file=.env.local scripts/uji-dokumen.ts
//
// Semua data dibuat di dalam SATU transaksi yang di-ROLLBACK di akhir (tidak ada
// sisa data di basis data). Berkas hasil render ditulis ke templates-sumber/_uji/kasus-*.docx.
//  1. rangkaiPasal (murni): gaya "A, B, dan C" + pengelompokan pasal sama.
//  2. pegawai PNS sementara + kasus hukdis via buatKasus (2 pelanggaran katalog PP 94/2021),
//     tim 3 anggota, sesi pemeriksaan + tanya jawab.
//  3. konteksDokumen → nilai untuk SETIAP placeholder katalog.
//  4. render template `surat_panggilan` & `bap` (versi aktif, pemetaan versi) via isiTemplate:
//     tidak ada penanda tersisa, tidak ada isian wajib kosong, dan {pasal_dilanggar} hanya
//     memuat pasal dari peraturan kasus (mencegah kesalahan rujukan pasal lintas peraturan).

import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import PizZip from "pizzip";
import { sql, type Sql } from "../lib/db";
import { buatKasus } from "../lib/kasus";
import { konteksDokumen } from "../lib/dokumen/konteks";
import { BOLEH_KOSONG, DIISI_DIALOG, cariKosong, muatKatalog, siapkanDokumen, susunData, type VersiTemplate } from "../lib/dokumen/buat";
import { isiTemplate } from "../lib/dokumen/template";
import { rangkaiPasal } from "../lib/dokumen/pasal";
import { unduhBerkas } from "../lib/penyimpanan";

const ROOT = path.resolve(__dirname, "..");
const DIR_UJI = path.join(ROOT, "templates-sumber", "_uji");
class Batalkan extends Error {}

let gagal = 0;
function cek(kondisi: unknown, pesan: string) {
  if (kondisi) console.log(`  ✓ ${pesan}`);
  else {
    gagal += 1;
    console.log(`  ✗ ${pesan}`);
  }
}

function ujiRangkaiPasal() {
  console.log("1. rangkaiPasal");
  const sama = (a: string, b: string) => cek(a === b, `"${a}"${a === b ? "" : `  (harapan: "${b}")`}`);
  sama(rangkaiPasal([{ pasal: "5", huruf: "f" }, { pasal: "6", huruf: "j" }]), "Pasal 5 huruf f dan Pasal 6 huruf j");
  sama(rangkaiPasal([{ pasal: "3", huruf: "f" }, { pasal: "4", huruf: "c" }, { pasal: "3", huruf: "a" }]), "Pasal 3 huruf a dan huruf f, serta Pasal 4 huruf c");
  sama(rangkaiPasal([{ pasal: "10", ayat: "1", huruf: "e" }, { pasal: "10", ayat: "2", huruf: "c" }]), "Pasal 10 ayat (1) huruf e dan ayat (2) huruf c");
  sama(rangkaiPasal([{ pasal: "3", huruf: "a" }, { pasal: "4", huruf: "b" }, { pasal: "5", huruf: "c" }]), "Pasal 3 huruf a, Pasal 4 huruf b, dan Pasal 5 huruf c");
  sama(rangkaiPasal([{ pasal: "3", huruf: "a" }, { pasal: "3", huruf: "a" }]), "Pasal 3 huruf a");
  sama(rangkaiPasal([]), "");
}

function teksDocx(isi: Buffer) {
  const zip = new PizZip(isi);
  return Object.keys(zip.files)
    .filter((f) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f))
    .map((f) => zip.file(f)!.asText().replace(/<w:tab\/>/g, " ").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, ""))
    .join("\n");
}

async function berkasTemplate(filePath: string, kode: string) {
  try {
    return await unduhBerkas(filePath);
  } catch {
    console.log(`  · berkas ${filePath} tidak dapat diunduh dari storage — memakai templates-sumber/${kode}.docx`);
    return fs.readFileSync(path.join(ROOT, "templates-sumber", `${kode}.docx`));
  }
}

async function render(tx: Sql, entri: { id: string; nomor: string }, kode: string, sesiId: string, harus: string[], pasalReg: Set<string>) {
  console.log(`\n· template ${kode}`);
  const [t] = await tx`select id, versi_aktif_id from template_dokumen where kode = ${kode}`;
  if (!t?.versi_aktif_id) return cek(false, `template ${kode} memiliki versi aktif`);
  const [v] = await tx`select id, versi, file_path, placeholder, pemetaan from template_versi where id = ${t.versi_aktif_id}`;
  const versi = v as unknown as VersiTemplate;
  const persiapan = await siapkanDokumen({ entriId: entri.id, templateId: t.id, sesiId, penggunaNama: "Penguji SIMPEL", db: tx });
  console.log(`  isian kosong yang ditanyakan: ${persiapan.kosong.map((k) => k.kode).join(", ") || "(tidak ada)"}`);
  const isian = Object.fromEntries(persiapan.kosong.map((k) => [k.kode, k.jenis === "loop" ? "Butir uji pertama\nButir uji kedua" : `Isian uji ${k.label}`]));
  const katalog = await muatKatalog(tx);
  const konteks = await konteksDokumen(entri.id, { sesiId, tahapanId: persiapan.tahapanId, penggunaNama: "Penguji SIMPEL", db: tx });
  const data = susunData(versi, konteks, katalog, isian, { nomor: "UJI/001/UN32/KP/2026", tanggal: "2026-10-05" });

  const masihKosong = versi.placeholder.filter((p) => {
    const nilai = data[p.kode];
    const kosong = nilai === "" || nilai === null || nilai === undefined || (Array.isArray(nilai) && !nilai.length);
    return kosong && !BOLEH_KOSONG.has(p.kode) && !DIISI_DIALOG.has(p.kode);
  });
  cek(!masihKosong.length, `semua placeholder terisi${masihKosong.length ? ` (kosong: ${masihKosong.map((p) => p.kode).join(", ")})` : ""}`);
  cek(cariKosong(versi, { ...konteks, ...Object.fromEntries(Object.entries(data).filter(([, x]) => x !== "")) }, katalog).every((k) => isian[k.kode]), "isian manual menutup semua isian kosong");

  const isi = isiTemplate(await berkasTemplate(versi.file_path, kode), data);
  fs.mkdirSync(DIR_UJI, { recursive: true });
  const keluar = path.join(DIR_UJI, `kasus-${kode}.docx`);
  fs.writeFileSync(keluar, isi);
  const teks = teksDocx(isi);
  const sisa = teks.match(/\{[#/^]?[A-Za-z_][A-Za-z0-9_.]*\}/g);
  cek(!sisa, `tidak ada penanda tersisa${sisa ? ` (${[...new Set(sisa)].join(" ")})` : ""}`);
  for (const h of harus) cek(teks.includes(h), `dokumen memuat "${h.length > 60 ? `${h.slice(0, 57)}…` : h}"`);

  const pasal = String(data.pasal_dilanggar ?? "");
  const nomorPasal = [...pasal.matchAll(/Pasal (\d+[A-Z]?)/g)].map((m) => m[1]);
  cek(nomorPasal.every((n) => pasalReg.has(n)), `pasal_dilanggar hanya memuat pasal peraturan kasus: ${pasal || "(kosong)"}`);
  console.log(`  → ${path.relative(ROOT, keluar)}`);
}

async function ujiBasisData() {
  console.log("\n2. Kasus sementara (transaksi di-ROLLBACK)");
  try {
    await sql.begin(async (txAsli) => {
      const tx = txAsli as unknown as Sql;
      const [admin] = await tx`select id from app_users order by created_at limit 1`;
      if (!admin) throw new Error("Belum ada app_users — jalankan npm run db:seed lebih dulu.");
      const [reg] = await tx`select id, nama_singkat, nama_lengkap from regulasi where kode = 'PP_94_2021'`;
      if (!reg) throw new Error("Katalog PP 94/2021 belum di-seed.");
      const pasalKatalog = await tx`select id, pasal, ayat, huruf, angka, jenis from pasal_regulasi
        where regulasi_id = ${reg.id} and aktif and jenis in ('kewajiban', 'larangan') order by jenis, urutan`;
      const p1 = pasalKatalog.find((p) => p.jenis === "kewajiban");
      const p2 = pasalKatalog.find((p) => p.jenis === "larangan") ?? pasalKatalog[1];
      if (!p1 || !p2) throw new Error("Katalog pasal PP 94/2021 belum lengkap.");
      const semuaPasalReg = new Set((await tx`select distinct pasal from pasal_regulasi where regulasi_id = ${reg.id}`).map((r) => String(r.pasal)));
      const sufiks = randomUUID().slice(0, 6);

      const pegawai = async (nama: string, gol: string, pangkat: string, jabatan: string, nipPenilai: string | null = null) => {
        const nip = `19${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`.slice(0, 18);
        const [r] = await tx`insert into pegawai (nip, nama_lengkap_gelar, nama_tanpa_gelar, status_pegawai, golongan_ruang, pangkat, jabatan_fungsional,
            unit_kerja, direktorat_fakultas, tempat_lahir, tanggal_lahir, rezim_kode, pejabat_penilai_nip, sumber)
          values (${nip}, ${nama}, ${nama.replace(/^(Dr\.|Prof\.)\s*/g, "").replace(/,.*$/, "")}, 'PNS', ${gol}, ${pangkat}, ${jabatan},
            'Departemen Uji Coba', 'Fakultas Uji Coba', 'Malang', '1985-03-12', 'A', ${nipPenilai}, 'manual')
          returning id, nip, nama_lengkap_gelar`;
        return r as { id: string; nip: string; nama_lengkap_gelar: string };
      };
      const ketua = await pegawai(`Prof. Dr. Ketua Uji ${sufiks}, M.Pd.`, "IV/c", "Pembina Utama Muda", "Guru Besar");
      const sekretaris = await pegawai(`Dr. Sekretaris Uji ${sufiks}, M.Si.`, "IV/a", "Pembina", "Lektor Kepala");
      const anggota = await pegawai(`Anggota Uji ${sufiks}, S.H., M.H.`, "IV/a", "Pembina", "Lektor Kepala");
      const terperiksa = await pegawai(`Drs. Terperiksa Uji ${sufiks}, M.Pd.`, "III/b", "Penata Muda Tingkat I", "Lektor", ketua.nip);

      const kasus = await buatKasus(tx, {
        pegawaiId: terperiksa.id, tanggalPeristiwa: "2026-08-03", tingkatKode: "sedang",
        judul: "Uji dokumen: dugaan pelanggaran kewajiban dan larangan",
        ringkasan: "Terperiksa diduga tidak melaksanakan tugas kedinasan dan menyalahgunakan wewenang (data uji otomatis).",
        pelanggaran: [
          { pasalRegulasiId: p1.id, uraian: "Tidak melaksanakan tugas kedinasan yang diberikan.", dampak: "unit_kerja", waktu: "Agustus 2026", tempat: "Fakultas Uji Coba" },
          { pasalRegulasiId: p2.id, uraian: "Menyalahgunakan wewenang.", dampak: "unit_kerja", waktu: "Agustus 2026", tempat: "Fakultas Uji Coba" },
        ],
      }, admin.id);
      console.log(`  kasus ${kasus.nomor} dibuat untuk ${terperiksa.nama_lengkap_gelar} (${reg.nama_singkat})`);

      const [tim] = await tx`insert into tim_pemeriksa (entri_id, jenis, nomor_sk, tanggal_sk, pejabat_pembentuk, created_by)
        values (${kasus.id}, 'um', 'UJI/SK-TIM/2026', '2026-09-01', 'Rektor', ${admin.id}) returning id`;
      for (const [i, [pg, unsur, jab]] of ([[ketua, "atasan_langsung", "ketua"], [sekretaris, "kepegawaian", "sekretaris"], [anggota, "pengawasan", "anggota"]] as const).entries()) {
        await tx`insert into anggota_tim (tim_id, pegawai_id, unsur, jabatan_dalam_tim, urutan, pernyataan_bebas_konflik)
          values (${tim.id}, ${pg.id}, ${unsur}, ${jab}, ${i + 1}, true)`;
      }
      const [sesi] = await tx`insert into sesi_pemeriksaan (entri_id, urutan, status, tanggal, jam_mulai, jam_selesai, tempat, terperiksa_hadir, persetujuan_ditolak)
        values (${kasus.id}, 1, 'selesai', '2026-10-12', '09:00', '11:30', 'Ruang Rapat Direktorat SDM, Gedung A3', true, true) returning id`;
      const tanyaJawab = [
        ["Apakah Saudara dalam keadaan sehat jasmani dan rohani?", "Ya, saya sehat."],
        ["Apakah Saudara mengetahui alasan Saudara diperiksa?", "Ya, terkait tugas kedinasan bulan Agustus 2026."],
        ["Apakah ada keterangan lain yang ingin Saudara sampaikan?", "Tidak ada."],
      ];
      for (const [i, [q, j]] of tanyaJawab.entries()) {
        await tx`insert into qa_pemeriksaan (sesi_id, urutan, pertanyaan, jawaban) values (${sesi.id}, ${i + 1}, ${q}, ${j})`;
      }

      console.log("\n3. konteksDokumen");
      const konteks = await konteksDokumen(kasus.id, { sesiId: sesi.id, db: tx });
      const katalog = await muatKatalog(tx);
      const tanpaNilai = [...katalog.keys()].filter((k) => !(k in konteks));
      cek(!tanpaNilai.length, `nilai tersedia untuk semua ${katalog.size} placeholder katalog${tanpaNilai.length ? ` (tanpa nilai: ${tanpaNilai.join(", ")})` : ""}`);
      const harapanPasal = rangkaiPasal([p1, p2] as never);
      cek(konteks.pasal_dilanggar === harapanPasal, `pasal_dilanggar = "${konteks.pasal_dilanggar}"`);
      cek(String(konteks.nama_regulasi).includes("94"), `nama_regulasi dari salinan beku: "${konteks.nama_regulasi}"`);
      cek((konteks.anggota_tim as unknown[]).length === 3, "anggota_tim berisi 3 baris");
      cek((konteks.qa as unknown[]).length === 3, "qa berisi 3 baris");
      cek((konteks.mengingat as unknown[]).length > 0, "mengingat diambil dari kaidah konsideran_mengingat peraturan kasus");
      cek(konteks.nama_ketua_tim === ketua.nama_lengkap_gelar, "nama_ketua_tim dari anggota berjabatan ketua");
      cek(konteks.nama_atasan_langsung === ketua.nama_lengkap_gelar, "atasan langsung dari pejabat penilai pegawai");
      cek(konteks.tanggal_pemeriksaan_terbilang === "tanggal dua belas bulan Oktober tahun dua ribu dua puluh enam", `tanggal terbilang: ${konteks.tanggal_pemeriksaan_terbilang}`);

      console.log("\n4. Render template");
      await render(tx, kasus, "surat_panggilan", sesi.id, [terperiksa.nama_lengkap_gelar, terperiksa.nip, "Senin", "12 Oktober 2026", "09.00 WIB", "UJI/001/UN32/KP/2026", "5 Oktober 2026", ketua.nama_lengkap_gelar], semuaPasalReg);
      await render(tx, kasus, "bap", sesi.id, [terperiksa.nama_lengkap_gelar, kasus.nomor, tanyaJawab[1][1], sekretaris.nama_lengkap_gelar, anggota.nama_lengkap_gelar, "UJI/SK-TIM/2026"], semuaPasalReg);
      await render(tx, kasus, "sk_hukdis", sesi.id, [harapanPasal, String(reg.nama_lengkap ?? "Peraturan Pemerintah Nomor 94 Tahun 2021")], semuaPasalReg);

      throw new Batalkan();
    });
  } catch (e) {
    if (!(e instanceof Batalkan)) throw e;
    console.log("\n  · transaksi di-ROLLBACK — tidak ada data uji yang tersisa");
  }
}

async function main() {
  ujiRangkaiPasal();
  await ujiBasisData();
  await sql.end({ timeout: 5 });
  console.log(gagal ? `\n✗ ${gagal} pemeriksaan gagal` : "\n✓ Semua pemeriksaan lulus");
  process.exit(gagal ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
