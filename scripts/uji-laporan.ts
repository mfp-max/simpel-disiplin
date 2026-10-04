// Uji kueri laporan & ekspor (PRD §10, §18.9).
//
// Jalankan: npx tsx --env-file=.env.local scripts/uji-laporan.ts
//
// Seluruh data contoh dibuat di DALAM satu transaksi yang selalu dibatalkan
// (rollback) di akhir — basis data tidak berubah. Yang diuji:
//  1. informasi, arsip, hitung_dalam_sla = false, dan entri diarsipkan TIDAK
//     masuk angka kasus aktif / tenggat / grafik / kepatuhan;
//  2. persentase tepat waktu dihitung benar (tepat ÷ (tepat + terlambat));
//  3. daftar "sedang menjalani" memakai nama dari snapshot_jenis_hukuman;
//  4. pegawai mendekati ambang kehadiran;
//  5. kalkulator: resolusi berbasis tanggal (kriteria 19) & tanggal mulai berlaku SK;
//  6. Excel & tampilan cetak setiap laporan dapat disusun;
//  7. ZIP ekspor penuh dapat disusun di memori (tidak diunggah).

import JSZip from "jszip";
import { sql, type Sql } from "../lib/db";
import { hariIni, tambahHariKerja } from "../lib/hari-kerja";
import { muatKalender } from "../lib/regulasi";
import {
  DAFTAR_LAPORAN, ambilBeranda, jalankanLaporan, kalkulatorAmbang, kalkulatorBerlaku, persenTepat, type Baris, type DataBeranda,
} from "../lib/laporan";
import { buatEksporPenuh, bukuExcel, htmlCetak } from "../lib/ekspor";

class Batal extends Error {}
let gagal = 0;
function cek(syarat: boolean, pesan: string) {
  console.log(`${syarat ? "  ✓" : "  ✗"} ${pesan}`);
  if (!syarat) gagal += 1;
}

const jumlahDari = (rows: Baris[]) => rows.find((r) => r.label === "Jumlah") ?? { tepat: 0, terlambat: 0, terbuka_lewat: 0 };

async function main() {
  const hari = hariIni();
  const tahun = Number(hari.slice(0, 4));

  try {
    await sql.begin(async (txRaw) => {
      const tx = txRaw as unknown as Sql;
      const kal = await muatKalender(tx);

      // --- Kondisi awal (data nyata yang mungkin sudah ada) ---------------
      const awal: DataBeranda = await ambilBeranda(tx, { hariIni: hari });
      const kepatuhanAwal = jumlahDari((await jalankanLaporan("kepatuhan-tenggat", {}, tx, { hariIni: hari }))!.lembar[1].baris);
      const menjalaniAwal = (await jalankanLaporan("menjalani-hukuman", {}, tx, { hariIni: hari }))!.lembar[0].baris.length;
      const rekapAwal = (await jalankanLaporan("rekapitulasi", {}, tx, { hariIni: hari }))!.lembar[2].baris.length;

      // --- Data contoh -----------------------------------------------------
      const [reg94] = await tx`select id from regulasi where kode = 'PP_94_2021'`;
      const [regB] = await tx`select id from regulasi where kode = 'PERTOR_70_2026'`;
      const [tSedang] = await tx`select id from tingkat_hukuman where regulasi_id = ${reg94.id} and kode = 'sedang'`;
      const [jSedang] = await tx`select id, nama from jenis_hukuman where regulasi_id = ${regB.id} order by urutan desc limit 1`;
      const [fak] = await tx`insert into unit_kerja (nama, jenis) values ('Fakultas Uji Laporan', 'fakultas') returning id`;
      const [dep] = await tx`insert into unit_kerja (nama, jenis, induk_id) values ('Departemen Uji Laporan', 'departemen', ${fak.id}) returning id`;
      const [pa] = await tx`insert into pegawai (nip, nama_lengkap_gelar, status_pegawai, rezim_kode, unit_kerja_id, unit_kerja)
        values ('199001012020011999', 'Pegawai Uji A, S.Pd.', 'PNS', 'A', ${dep.id}, 'Departemen Uji Laporan') returning id`;
      const [pb] = await tx`insert into pegawai (nip, nama_lengkap_gelar, status_pegawai, rezim_kode)
        values ('199101012021011998', 'Pegawai Uji B, M.Si.', 'PTNA', 'B') returning id`;

      let n = 0;
      const entri = async (o: Record<string, unknown>) => {
        n += 1;
        const [e] = await tx`insert into entri ${tx({ nomor_registrasi: `UJI/LAPORAN/${n}`, judul: `Entri uji ${n}`, ...o } as never)} returning id`;
        return e.id as string;
      };
      const tahap = async (entriId: string, o: Record<string, unknown>) => {
        const info = { sifat: "wajib_hukum", nama: "Tenggat uji" };
        await tx`insert into tahapan_kasus ${tx({ entri_id: entriId, urutan: 1, nama: "Tahap uji", kode_tahap: "telaah", status: "belum", ...o, tenggat_info: tx.json(info as never) } as never)}`;
      };
      const lalu = (k: number) => tambahHariKerja(hari, -k, kal);
      const nanti = (k: number) => tambahHariKerja(hari, k, kal);

      // E1: hukdis berjalan — 1 tepat, 1 terlambat, 1 berjalan, 1 lewat, 1 opsional-belum lewat (diabaikan)
      const e1 = await entri({ kelas: "hukdis", status_kasus: "pemeriksaan", pegawai_id: pa.id, unit_kerja_id: dep.id, rezim_kode: "A",
        regulasi_id: reg94.id, tingkat_hukuman_dugaan_id: tSedang.id, snapshot_pegawai: tx.json({ nama_lengkap_gelar: "Pegawai Uji A, S.Pd.", direktorat_fakultas: "Fakultas Uji Laporan" } as never) });
      await tahap(e1, { kode_tahap: "telaah", urutan: 1, nama: "Telaah", status: "selesai", tenggat: lalu(10), tanggal_realisasi: lalu(12) });
      await tahap(e1, { kode_tahap: "pembentukan_tim", urutan: 2, nama: "Pembentukan Tim", status: "selesai", tenggat: lalu(8), tanggal_realisasi: lalu(6) });
      await tahap(e1, { kode_tahap: "lapor_sekjen", urutan: 3, nama: "Lapor Sekjen", status: "belum", tenggat: lalu(3) });
      await tahap(e1, { kode_tahap: "pemeriksaan", urutan: 4, nama: "Pemeriksaan", status: "berjalan", tenggat: nanti(10) });
      await tahap(e1, { kode_tahap: "panggilan_2", urutan: 5, nama: "Panggilan II", status: "belum", opsional: true, tenggat: lalu(2) });
      // E5: hukdis berjalan — mendekati tenggat
      const e5 = await entri({ kelas: "hukdis", status_kasus: "telaah", unit_kerja_id: dep.id, rezim_kode: "A", nama_pegawai_bebas: "Pegawai Bebas" });
      await tahap(e5, { kode_tahap: "telaah", nama: "Telaah", status: "berjalan", tenggat: nanti(2) });
      // E2: hukdis selesai tahun ini dengan hukuman sedang berjalan
      const e2 = await entri({ kelas: "hukdis", status_kasus: "selesai", tanggal_selesai: hari, pegawai_id: pb.id, rezim_kode: "B", regulasi_id: regB.id });
      await tahap(e2, { kode_tahap: "penyampaian_sk", nama: "Penyampaian SK", status: "selesai", tenggat: lalu(20), tanggal_realisasi: lalu(20) });
      await tx`insert into hukuman (entri_id, jenis_hukuman_id, snapshot_jenis_hukuman, nomor_sk, tanggal_sk, tanggal_mulai_berlaku, tanggal_selesai, blokir_kgb, pemotongan_ik)
        values (${e2}, ${jSedang.id}, ${tx.json({ nama: "JENIS SNAPSHOT UJI", tingkat: "sedang", tingkat_kode: "sedang" } as never)}, 'UJI/SK/1', ${lalu(40)}, ${lalu(25)}, ${nanti(200)}, true, true)`;
      // Pengganggu yang TIDAK boleh dihitung
      const inf = await entri({ kelas: "informasi", status_kasus: "informasi" });
      await tahap(inf, { status: "selesai", tenggat: lalu(5), tanggal_realisasi: lalu(1) });
      await tahap(inf, { status: "berjalan", tenggat: lalu(5) });
      const ars = await entri({ kelas: "arsip", status_kasus: "selesai", tanggal_selesai: hari, pegawai_id: pb.id, tahun_peristiwa: 1995 });
      await tahap(ars, { status: "belum", tenggat: lalu(5) });
      await tx`insert into hukuman (entri_id, snapshot_jenis_hukuman, tanggal_sk, tanggal_mulai_berlaku, tanggal_selesai)
        values (${ars}, ${tx.json({ nama: "ARSIP", tingkat: "berat" } as never)}, ${lalu(40)}, ${lalu(30)}, ${nanti(100)})`;
      const nonSla = await entri({ kelas: "hukdis", status_kasus: "telaah", hitung_dalam_sla: false });
      await tahap(nonSla, { status: "selesai", tenggat: lalu(5), tanggal_realisasi: lalu(1) });
      await tahap(nonSla, { status: "berjalan", tenggat: lalu(5) });
      const diarsip = await entri({ kelas: "hukdis", status_kasus: "telaah", diarsipkan_pada: new Date(), alasan_diarsipkan: "uji" });
      await tahap(diarsip, { status: "berjalan", tenggat: lalu(5) });
      // Kehadiran: A 9 hari (PP 94 → ambang berikut 11, selisih 2 → muncul); B 4 hari (Pertor → 7, selisih 3 → tidak)
      await tx`insert into catatan_kehadiran (pegawai_id, tahun, bulan, jumlah_hari) values (${pa.id}, ${tahun}, 1, 5), (${pa.id}, ${tahun}, 2, 4), (${pb.id}, ${tahun}, 1, 4)`;

      // --- 1. Beranda -------------------------------------------------------
      console.log("\n1. Beranda — pengecualian informasi/arsip/non-SLA/diarsipkan");
      const b = await ambilBeranda(tx, { hariIni: hari });
      const d = (k: keyof DataBeranda["ringkasan"]) => b.ringkasan[k] - awal.ringkasan[k];
      cek(d("aktif") === 2, `Kasus aktif +2 (E1, E5) — hasil +${d("aktif")}`);
      cek(d("lewat") === 1, `Lewat tenggat +1 (E1; opsional belum diaktifkan diabaikan) — hasil +${d("lewat")}`);
      cek(d("mendekati") === 1, `Mendekati tenggat +1 (E5) — hasil +${d("mendekati")}`);
      cek(d("informasi") === 1, `Informasi belum berproses +1 (terpisah) — hasil +${d("informasi")}`);
      cek(d("arsip") === 1, `Arsip lampau +1 (statistik historis) — hasil +${d("arsip")}`);
      cek(d("selesaiTahunIni") === 1, `Selesai tahun ini +1 (E2; arsip tidak) — hasil +${d("selesaiTahunIni")}`);
      cek(b.grafik.totalKasus - awal.grafik.totalKasus === 3, `Grafik hanya menghitung 3 kasus hukdis — hasil +${b.grafik.totalKasus - awal.grafik.totalKasus}`);
      cek(b.grafik.unit.some((u) => u.label === "Fakultas Uji Laporan" && u.nilai >= 2), "Unit kerja dikelompokkan ke fakultas (salinan beku / unit induk)");
      const kanbanIds = b.kanban.flatMap((k) => k.kasus.map((c) => c.id));
      cek(kanbanIds.includes(e1) && kanbanIds.includes(e5) && !kanbanIds.includes(nonSla) && !kanbanIds.includes(diarsip) && !kanbanIds.includes(inf), "Kanban hanya memuat kasus hukdis berjalan yang dihitung");
      cek(!b.tenggat.some((t) => [inf, ars, nonSla, diarsip].includes(t.entriId)), "Daftar tenggat terdekat tanpa informasi/arsip/non-SLA");
      cek(b.tenggat.some((t) => t.entriId === e1 && t.status.warna === "lewat") && b.tenggat.some((t) => t.entriId === e5 && t.status.warna === "waspada"), "Daftar tenggat memuat tahap lewat & mendekati");
      const kA = b.kehadiran.daftar.find((x) => x.pegawaiId === pa.id);
      cek(!!kA && kA.selisih === 2 && kA.total === 9, `Pegawai A mendekati ambang kehadiran (9 hari, selisih ${kA?.selisih})`);
      cek(!b.kehadiran.daftar.some((x) => x.pegawaiId === pb.id), "Pegawai B (selisih 3 > margin 2) tidak ditampilkan");

      // --- 2. Kepatuhan tenggat ----------------------------------------------
      console.log("\n2. Rekap kepatuhan tenggat");
      const kp = (await jalankanLaporan("kepatuhan-tenggat", {}, tx, { hariIni: hari }))!;
      const j = jumlahDari(kp.lembar[1].baris);
      const tepat = Number(j.tepat) - Number(kepatuhanAwal.tepat);
      const lambat = Number(j.terlambat) - Number(kepatuhanAwal.terlambat);
      const terbuka = Number(j.terbuka_lewat) - Number(kepatuhanAwal.terbuka_lewat);
      cek(tepat === 2 && lambat === 1, `Tepat +2, terlambat +1 — hasil +${tepat}/+${lambat}`);
      cek(terbuka === 1, `Belum selesai & lewat +1 — hasil +${terbuka}`);
      const p = persenTepat(2, 1)!;
      cek(Math.abs(p - 2 / 3) < 1e-9, `persenTepat(2,1) = ${(p * 100).toFixed(1)}%`);
      if (!Number(kepatuhanAwal.tepat) && !Number(kepatuhanAwal.terlambat)) {
        cek(kp.ringkasan[0].nilai === "66,7%", `Ringkasan persentase = ${kp.ringkasan[0].nilai}`);
      }

      // --- 3. Laporan lain -----------------------------------------------------
      console.log("\n3. Laporan lain");
      const mj = (await jalankanLaporan("menjalani-hukuman", {}, tx, { hariIni: hari }))!;
      cek(mj.lembar[0].baris.length - menjalaniAwal === 1, "Sedang menjalani +1 (arsip tidak dihitung)");
      const rE2 = mj.lembar[0].baris.find((r) => r.id === e2);
      cek(rE2?.jenis === "JENIS SNAPSHOT UJI" && rE2.jenis !== jSedang.nama, "Nama jenis diambil dari snapshot, bukan katalog");
      cek(rE2?.blokir_kgb === true && rE2?.pemotongan_ik === true, "Blokir KGB & pemotongan IK terbaca");
      const mjIk = (await jalankanLaporan("menjalani-hukuman", { blokir: "kp" }, tx, { hariIni: hari }))!;
      cek(!mjIk.lembar[0].baris.some((r) => r.id === e2), "Filter blokir kenaikan pangkat menyaring");
      const rk = (await jalankanLaporan("rekapitulasi", {}, tx, { hariIni: hari }))!;
      cek(rk.lembar[2].baris.length - rekapAwal === 1, "Rekapitulasi +1 hukuman (arsip tidak)");
      const kb = (await jalankanLaporan("kasus-berjalan", {}, tx, { hariIni: hari }))!;
      const idKb = kb.lembar[0].baris.map((r) => r.id);
      cek(idKb.includes(e1) && idKb.includes(e5) && !idKb.includes(nonSla) && !idKb.includes(diarsip), "Daftar kasus berjalan benar");
      cek(kb.lembar[0].baris.find((r) => r.id === e1)?.tahap === "Pemeriksaan", "Posisi tahapan = tahap berjalan");
      const rw = (await jalankanLaporan("riwayat-pegawai", { pegawai: pb.id }, tx, { hariIni: hari }))!;
      cek(rw.lembar[0].baris.length === 2, `Riwayat pegawai B memuat kasus + arsip lampau (${rw.lembar[0].baris.length})`);

      // --- 4. Kalkulator -------------------------------------------------------
      console.log("\n4. Kalkulator (kriteria 19 & tanggal berlaku)");
      const k15 = await kalkulatorAmbang({ rezim: "A", tanggalPeristiwa: "2015-05-12", hari: 5, berturut: false }, tx);
      cek(k15.ok && k15.regulasi.nama === "PP 53/2010" && k15.tabel[0]?.rentang === "5", `12 Mei 2015 → ${k15.ok ? k15.regulasi.nama : k15.pesan}, ambang pertama ${k15.ok ? k15.tabel[0]?.rentang : "-"}`);
      const k24 = await kalkulatorAmbang({ rezim: "A", tanggalPeristiwa: "2024-05-12", hari: 15, berturut: false }, tx);
      cek(k24.ok && k24.regulasi.nama === "PP 94/2021" && k24.tabel[0]?.rentang === "3", `12 Mei 2024 → ${k24.ok ? k24.regulasi.nama : k24.pesan}, ambang pertama ${k24.ok ? k24.tabel[0]?.rentang : "-"}`);
      if (k24.ok) console.log(`     15 hari → ${k24.usulan?.tingkat} / ${k24.usulan?.jenis}${k24.usulan?.pengganti ? ` (sementara: ${k24.usulan.pengganti})` : ""} · ${k24.usulan?.pasal ?? ""}`);
      const kb10 = await kalkulatorAmbang({ rezim: "B", tanggalPeristiwa: hari, hari: 10, berturut: true }, tx);
      cek(kb10.ok && kb10.usulan?.alurKhusus === "penghentian_gaji", "10 hari berturut-turut (Pertor) → alur penghentian gaji");
      const sk = await kalkulatorBerlaku({ rezim: "A", tanggalDiterima: "2026-07-14" }, tx);
      cek(sk.ok && sk.aturan.jumlah > 0, `SK diterima 14 Juli 2026 → mulai berlaku ${sk.ok ? sk.tanggalBerlaku : sk.pesan} (hari kerja ke-${sk.ok ? sk.aturan.jumlah : "?"}, ${sk.ok ? sk.dilewati.length : 0} hari dilewati)`);

      // --- 5. Excel & cetak -----------------------------------------------------
      console.log("\n5. Excel & tampilan cetak");
      const pengunduh = { nama: "Penguji SIMPEL", email: "uji@um.ac.id" };
      for (const def of DAFTAR_LAPORAN) {
        const h = (await jalankanLaporan(def.kode, def.wajibPegawai ? { pegawai: pb.id } : {}, tx, { hariIni: hari }))!;
        const x = await bukuExcel(def.judul, h, pengunduh);
        const c = htmlCetak(def.judul, h, pengunduh);
        cek(x.length > 4000 && c.includes("RAHASIA — diunduh oleh Penguji SIMPEL"), `${def.judul}: Excel ${(x.length / 1024).toFixed(1)} KB, cetak ${(c.length / 1024).toFixed(1)} KB`);
      }

      // --- 6. Ekspor penuh ke memori --------------------------------------------
      console.log("\n6. Ekspor penuh (di memori, tidak diunggah)");
      const bagian: { nama: string; isi: Buffer }[] = [];
      const t0 = Date.now();
      const hasil = await buatEksporPenuh({ pengunduh, db: tx, simpan: async (nama, isi) => { bagian.push({ nama, isi }); } });
      let jumlahFile = 0;
      for (const bg of bagian) {
        const z = await JSZip.loadAsync(bg.isi);
        const f = Object.values(z.files).filter((x) => !x.dir);
        jumlahFile += f.length;
        console.log(`     ${bg.nama}: ${f.length} file, ${(bg.isi.length / 1024).toFixed(1)} KB`);
        if (bg === bagian[0]) {
          const entriJson = await z.file("data/entri.json")!.async("string");
          cek(entriJson.includes("UJI/LAPORAN/1") && entriJson.includes("UJI/LAPORAN/") && !entriJson.includes('"cari"'), "data/entri.json memuat seluruh baris (termasuk diarsipkan) tanpa kolom tsvector");
          cek(!!z.file("README.txt") && !!z.file("skema.sql") && !!z.file("manifest.json"), "README.txt, skema.sql, manifest.json ada");
          cek(entriJson.includes("UJI/LAPORAN/") && JSON.parse(entriJson).some((r: { diarsipkan_pada: string | null }) => r.diarsipkan_pada), "Entri diarsipkan ikut diekspor");
        }
      }
      console.log(`     ${hasil.jumlahTabel} tabel, ${hasil.jumlahBaris} baris, ${hasil.jumlahBerkas} berkas, ${hasil.berkasGagal.length} gagal, total ${jumlahFile} file dalam ${bagian.length} bagian (${((Date.now() - t0) / 1000).toFixed(1)} dtk)`);
      cek(hasil.jumlahTabel >= 40, "Seluruh tabel publik diekspor");

      throw new Batal();
    });
  } catch (e) {
    if (!(e instanceof Batal)) throw e;
    console.log("\nTransaksi dibatalkan — tidak ada data yang tersimpan.");
  }

  const [{ n }] = await sql`select count(*)::int as n from entri where nomor_registrasi like 'UJI/LAPORAN/%'`;
  cek(n === 0, "Data uji tidak tertinggal di basis data");
  console.log(gagal ? `\n${gagal} pemeriksaan GAGAL.` : "\nSemua pemeriksaan lulus.");
  await sql.end();
  process.exit(gagal ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await sql.end().catch(() => {});
  process.exit(1);
});
