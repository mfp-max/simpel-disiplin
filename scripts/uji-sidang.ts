// Uji mode sidang & rekaman (PRD §9, §9.1) terhadap basis data dan penyimpanan sungguhan.
//
// Jalankan: npx tsx --conditions=react-server --env-file=.env.local scripts/uji-sidang.ts
//
// - Semua perubahan basis data terjadi di dalam SATU transaksi yang selalu DIBATALKAN (ROLLBACK).
// - Uji penggabungan potongan memakai prefiks sementara `uji-sidang/<acak>/` di bucket privat dan
//   menghapusnya kembali di akhir.
import { randomUUID } from "node:crypto";
import { sql, type Sql } from "../lib/db";
import { daftarBerkas, hapusBerkas, unduhBerkas, unggahBerkas } from "../lib/penyimpanan";
import { gabungkanPotongan, hapusPotongan, hitungTanggalHapus, jalankanRetensi, namaPotongan, potonganTergabung, tanggalAkhirKasus } from "../lib/rekaman";
import { daftarQa, geserPertanyaan, hapusPertanyaan, isiPertanyaanAwal, simpanJawaban, sisipkanPertanyaan, ubahPertanyaan } from "../app/(app)/kasus/[id]/sidang/_qa";

let lulus = 0;
let gagal = 0;
function cek(syarat: unknown, pesan: string) {
  if (syarat) { lulus++; console.log(`  ✓ ${pesan}`); } else { gagal++; console.error(`  ✗ ${pesan}`); }
}
async function harusGagal(fn: () => Promise<unknown>, pesan: string) {
  try { await fn(); cek(false, pesan); } catch { cek(true, pesan); }
}
const urutanRapat = (d: { urutan: number }[]) => d.every((b, i) => b.urutan === i + 1);

class Batalkan extends Error {}

async function ujiBasisData() {
  try {
    await sql.begin(async (t) => {
      const tx = t as unknown as Sql;
      console.log("\n[1] Data sementara");
      const [pg] = await tx`insert into pegawai (nama_lengkap_gelar, nip) values ('Pegawai Uji Sidang', '199001012020011999') returning id`;
      const [e] = await tx`insert into entri (nomor_registrasi, kelas, judul, status_kasus, pegawai_id, snapshot_pegawai)
        values (${`UJI/SIDANG/${randomUUID().slice(0, 8)}`}, 'hukdis', 'Kasus uji mode sidang', 'pemeriksaan', ${pg.id},
          ${tx.json({ nama_lengkap_gelar: "Pegawai Uji Sidang", nip: "199001012020011999" })}) returning id`;
      const [s] = await tx`insert into sesi_pemeriksaan (entri_id, urutan, tanggal) values (${e.id}, 1, '2026-10-01') returning id`;
      cek(s.id, "pegawai, entri hukdis, dan sesi sementara dibuat");

      console.log("\n[2] Pertanyaan baku disalin saat sesi pertama dibuka");
      const [{ n: jumlahBaku }] = await tx`select count(*)::int as n from pertanyaan_baku where aktif`;
      const isi = await isiPertanyaanAwal(tx, s.id, null);
      let d = await daftarQa(tx, s.id);
      cek(isi === jumlahBaku && d.length === jumlahBaku, `${isi} pertanyaan baku tersalin (aktif: ${jumlahBaku})`);
      cek(urutanRapat(d), "penomoran 1..n");
      const blok = d.map((b) => b.kategori).join(",");
      cek(/^(pembuka,)*(substansi,)*(penutup,?)*$/.test(blok + ","), "urutan blok pembuka → substansi → penutup");
      cek(d.every((b) => b.sumber === "baku"), "semua bertanda sumber = baku");
      cek((await isiPertanyaanAwal(tx, s.id, null)) === 0, "pembukaan kedua tidak menyalin ulang");

      console.log("\n[3] Sisipkan pertanyaan substansi di tengah");
      const lama9 = d.find((b) => b.urutan === 9)!;
      const lama10 = d.find((b) => b.urutan === 10)!;
      const r = await sisipkanPertanyaan(tx, s.id, 9, ["Pertanyaan sisipan uji?"], "tambahan", null);
      d = await daftarQa(tx, s.id);
      const baru = d.find((b) => b.id === r.ids[0])!;
      cek(baru.urutan === 10 && baru.kategori === "substansi" && baru.sumber === "tambahan", "pertanyaan baru menjadi nomor 10 (substansi, tambahan)");
      cek(d.find((b) => b.id === lama9.id)!.urutan === 9, "nomor 9 tetap");
      cek(d.find((b) => b.id === lama10.id)!.urutan === 11, "nomor 10 lama bergeser menjadi 11");
      cek(urutanRapat(d) && d.length === jumlahBaku + 1, "penomoran tetap rapat");

      const r2 = await sisipkanPertanyaan(tx, s.id, null, ["Bank A?", "Bank B?"], "bank", null);
      d = await daftarQa(tx, s.id);
      const a = d.find((b) => b.id === r2.ids[0])!;
      const pertamaPenutup = d.find((b) => b.kategori === "penutup");
      cek(a.urutan === r2.mulaiNomor && (!pertamaPenutup || pertamaPenutup.urutan === a.urutan + 2), "posisi bawaan: di akhir blok substansi, sebelum penutup");
      cek(urutanRapat(d), "penomoran rapat setelah sisip dari bank");

      console.log("\n[4] Sunting, geser, hapus");
      await harusGagal(() => ubahPertanyaan(tx, s.id, lama9.id, "ubah baku", null), "pertanyaan baku tidak bisa disunting");
      await harusGagal(() => hapusPertanyaan(tx, s.id, lama9.id), "pertanyaan baku tidak bisa dihapus");
      await ubahPertanyaan(tx, s.id, baru.id, "Pertanyaan sisipan uji (disunting)?", null);
      cek((await daftarQa(tx, s.id)).find((b) => b.id === baru.id)!.pertanyaan.includes("disunting"), "pertanyaan tambahan bisa disunting");
      cek(await geserPertanyaan(tx, s.id, baru.id, -1), "geser naik di dalam blok substansi");
      d = await daftarQa(tx, s.id);
      cek(d.find((b) => b.id === baru.id)!.urutan === 9 && d.find((b) => b.id === lama9.id)!.urutan === 10, "nomor 9 ↔ 10 bertukar");
      const pembukaTerakhir = d.filter((b) => b.kategori === "pembuka").at(-1)!;
      const subsPertama = d.find((b) => b.kategori === "substansi")!;
      cek(subsPertama.urutan === pembukaTerakhir.urutan + 1 && !(await geserPertanyaan(tx, s.id, subsPertama.id, -1)), "tidak bisa digeser keluar blok substansi");
      const jumlahSebelum = d.length;
      await hapusPertanyaan(tx, s.id, baru.id);
      d = await daftarQa(tx, s.id);
      cek(d.length === jumlahSebelum - 1 && urutanRapat(d), "hapus pertanyaan tambahan → nomor sesudahnya naik, tetap rapat");

      console.log("\n[5] Simpan jawaban (hanya yang berubah)");
      const dua = d.slice(0, 2);
      const simpan = await simpanJawaban(tx, s.id, dua.map((b, i) => ({ id: b.id, jawaban: `Jawaban uji ${i + 1}` })), null);
      d = await daftarQa(tx, s.id);
      cek(simpan.length === 2 && d[0].jawaban === "Jawaban uji 1" && d[1].jawaban === "Jawaban uji 2", "dua jawaban tersimpan");
      cek(!!d[0].terakhir_disimpan && !d[2].terakhir_disimpan, "terakhir_disimpan hanya pada butir yang dikirim");
      cek((await simpanJawaban(tx, randomUUID(), [{ id: d[0].id, jawaban: "x" }], null)).length === 0, "butir sesi lain tidak bisa ditimpa");

      console.log("\n[6] Retensi rekaman");
      cek(hitungTanggalHapus("2026-01-15", 90) === "2026-04-15", "15 Jan 2026 + 90 hari = 15 Apr 2026");
      cek(hitungTanggalHapus("2024-12-31", 60) === "2025-03-01", "31 Des 2024 + 60 hari = 1 Mar 2025");
      cek(hitungTanggalHapus("2026-01-15", 0) === "2026-04-15", "retensi tidak valid → bawaan 90 hari");
      cek((await tanggalAkhirKasus(e.id, tx)) === null, "kasus berjalan → belum ada tanggal akhir");
      await tx`update entri set status_kasus = 'selesai', tanggal_selesai = '2026-01-01' where id = ${e.id}`;
      cek((await tanggalAkhirKasus(e.id, tx)) === "2026-01-01", "kasus selesai → tanggal akhir = tanggal_selesai");

      const prefiksPalsu = `uji-sidang/${randomUUID()}`;
      await tx`update sesi_pemeriksaan set rekaman_path = ${`${prefiksPalsu}/rekaman-00002.webm`}, rekaman_jumlah_potongan = 2 where id = ${s.id}`;
      const [{ n: lain }] = await tx`select count(*)::int as n from sesi_pemeriksaan where id <> ${s.id} and rekaman_dihapus_pada is null
        and (rekaman_path is not null or rekaman_jumlah_potongan > 0)`;
      if (lain === 0) {
        const h = await jalankanRetensi(tx, 90);
        const [x] = await tx`select rekaman_hapus_pada, rekaman_dihapus_pada, rekaman_path from sesi_pemeriksaan where id = ${s.id}`;
        cek(x.rekaman_hapus_pada === "2026-04-01", "tugas harian menetapkan rekaman_hapus_pada = 1 Apr 2026");
        cek(!!x.rekaman_dihapus_pada && x.rekaman_path === null && h.dihapus >= 1, "lewat tanggal → rekaman dihapus, path dikosongkan");
        const [au] = await tx`select email from audit_log where record_id = ${s.id} and aksi = 'hapus' order by id desc limit 1`;
        cek(au?.email === "sistem", "penghapusan tercatat di audit log oleh 'sistem'");
      } else {
        console.log(`  · jalankanRetensi dilewati: ada ${lain} sesi lain berekaman (agar uji tidak menghapus berkas sungguhan)`);
      }
      throw new Batalkan();
    });
  } catch (e) {
    if (!(e instanceof Batalkan)) throw e;
    console.log("\n  (transaksi dibatalkan — tidak ada data yang tertinggal)");
  }
}

async function ujiPenggabungan() {
  console.log("\n[7] Penggabungan potongan rekaman (penyimpanan sungguhan, prefiks sementara)");
  const dasar = `uji-sidang/${randomUUID()}`;
  const folder = `${dasar}/rekaman`;
  const tujuan = `${dasar}/rekaman-00003.webm`;
  const tujuan2 = `${dasar}/rekaman-00005.webm`;
  try {
    const isi = ["AAA", "BB", "C"];
    for (const [i, t] of isi.entries()) await unggahBerkas(`${folder}/${namaPotongan(i + 1)}`, Buffer.from(t), "audio/webm");
    cek((await daftarBerkas(folder)).length === 3, "3 potongan terunggah (00001–00003.webm)");
    const g = await gabungkanPotongan({ folder, sampai: 3, tujuan });
    cek((await unduhBerkas(tujuan)).toString() === "AAABBC" && g.hilang.length === 0, "digabung berurutan → AAABBC");
    cek((await daftarBerkas(folder)).length === 0, "potongan dihapus setelah digabung");
    cek(potonganTergabung(tujuan) === 3, "nama hasil gabungan mencatat potongan terakhir (3)");

    // Rekam lanjutan: nomor potongan berlanjut (4, 5) — path tidak pernah dipakai ulang.
    await unggahBerkas(`${folder}/${namaPotongan(4)}`, Buffer.from("DD"), "audio/webm");
    const g2 = await gabungkanPotongan({ folder, dari: potonganTergabung(tujuan) + 1, sampai: 5, tujuan: tujuan2, awal: tujuan });
    cek((await unduhBerkas(tujuan2)).toString() === "AAABBCDD", "rekam lanjutan ditambahkan di belakang rekaman lama");
    cek(g2.hilang.length === 1 && g2.hilang[0] === 5, "potongan yang hilang dilaporkan (nomor 5)");
    const nama = (await daftarBerkas(dasar)).filter((f) => f.id).map((f) => f.name);
    cek(!nama.includes("rekaman-00003.webm") && nama.includes("rekaman-00005.webm"), "berkas gabungan lama dihapus, hanya yang terbaru tersisa");
  } finally {
    await hapusBerkas([tujuan, tujuan2]).catch(() => {});
    await hapusPotongan(folder).catch(() => {});
    const sisa = (await daftarBerkas(dasar).catch(() => [])).filter((f) => f.id);
    cek(sisa.length === 0, "prefiks uji dibersihkan");
  }
}

(async () => {
  try {
    await ujiBasisData();
    await ujiPenggabungan();
  } catch (e) {
    gagal++;
    console.error("\nGalat tak terduga:", e);
  } finally {
    await sql.end();
  }
  console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})();
