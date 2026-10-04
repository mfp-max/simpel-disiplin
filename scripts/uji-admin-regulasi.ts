// Uji lib/regulasi/admin.ts & regresi.ts terhadap basis data sungguhan, di dalam
// SATU transaksi yang selalu DIBATALKAN di akhir (tidak meninggalkan data uji).
// Pakai: npx tsx --conditions=react-server --env-file=.env.local scripts/uji-admin-regulasi.ts
import { sql, type Sql } from "../lib/db";
import { GalatPengguna } from "../lib/galat";
import { eksporDefinisi } from "../lib/regulasi/simpan";
import {
  buatVersiBaruRegulasi, daftarkanDefinisi, hapusBaris, PESAN_TERPAKAI, tambahBaris, ubahBaris, type Pelaku,
} from "../lib/regulasi/admin";
import { jalankanRegresi } from "../lib/regulasi/regresi";

const BATAL = "SENGAJA_DIBATALKAN";
const pelaku: Pelaku = { id: "00000000-0000-4000-8000-000000000001", email: "uji-otomatis@simpel.local" };
let gagal = 0;

function cek(kondisi: unknown, pesan: string) {
  if (kondisi) console.log(`  ✔ ${pesan}`);
  else {
    gagal += 1;
    console.log(`  ✘ ${pesan}`);
  }
}

async function harusGagal(tx: Sql, fn: () => Promise<unknown>, cocok: RegExp | string) {
  await tx`savepoint uji`;
  try {
    await fn();
    await tx`release savepoint uji`;
    return null;
  } catch (e) {
    await tx`rollback to savepoint uji`;
    const m = (e as Error).message;
    return typeof cocok === "string" ? (m.includes(cocok) ? m : `TIDAK COCOK: ${m}`) : cocok.test(m) ? m : `TIDAK COCOK: ${m}`;
  }
}

async function main() {
  try {
    await sql.begin(async (t) => {
      const tx = t as unknown as Sql;
      console.log("1. Daftarkan peraturan uji (salinan PP 94/2021) lewat daftarkanDefinisi");
      const [pp94] = await tx`select id from regulasi where kode = 'PP_94_2021'`;
      const def = await eksporDefinisi(tx, pp94.id);
      def.regulasi = { ...def.regulasi, kode: "UJI_ADMIN_TMP", nama_singkat: "Uji Admin", utama: false, status: "aktif", menggantikan_kode: null };
      const dobel = await harusGagal(tx, () => daftarkanDefinisi(tx, pelaku, { ...def, regulasi: { ...def.regulasi, kode: "PP_94_2021" } }, { alasan: "uji kode ganda", sumber: "impor" }), "sudah dipakai");
      cek(dobel && !dobel.startsWith("TIDAK"), `kode yang sudah ada ditolak dengan saran: "${dobel}"`);
      const { regulasiId } = await daftarkanDefinisi(tx, pelaku, def, { alasan: "Uji otomatis admin regulasi", sumber: "wizard" });
      cek(regulasiId, "peraturan uji tersimpan");

      console.log("2. Uji regresi awal");
      const r1 = await jalankanRegresi(tx, regulasiId);
      cek(r1.jumlah > 0 && r1.lulus === r1.jumlah, `semua fixture lulus (${r1.lulus}/${r1.jumlah})`);

      console.log("3. Jadikan peraturan 'terpakai' (entri uji)");
      await tx`insert into entri (nomor_registrasi, kelas, judul, status_kasus, regulasi_id)
        values ('UJI-ADMIN-TMP-1', 'hukdis', 'Entri uji admin regulasi', 'telaah', ${regulasiId})`;

      const [jenis] = await tx`select * from jenis_hukuman where regulasi_id = ${regulasiId} and kode = 'tukin_25_9'`;
      console.log("4. Ubah isi jenis hukuman secara langsung → harus ditolak");
      const tolak = await harusGagal(tx, () => ubahBaris(tx, pelaku, { tabel: "jenis_hukuman", id: jenis.id, data: { nama: "nama baru" }, alasan: "uji tolak" }), PESAN_TERPAKAI.slice(0, 40));
      cek(tolak && !tolak.startsWith("TIDAK"), "ubahBaris mode biasa menolak dengan pesan yang jelas");
      const trigger = await harusGagal(tx, () => tx`update jenis_hukuman set nama = 'x' where id = ${jenis.id}`, "SIMPEL_KATALOG_TERPAKAI");
      cek(trigger && !trigger.startsWith("TIDAK"), "trigger basis data juga menolak UPDATE langsung");

      console.log("5. Kolom bebas tetap bisa diubah");
      await ubahBaris(tx, pelaku, { tabel: "jenis_hukuman", id: jenis.id, data: { perlu_verifikasi: true, catatan: "dicek bagian hukum" }, alasan: "Tandai untuk verifikasi" });
      const [j2] = await tx`select perlu_verifikasi, catatan from jenis_hukuman where id = ${jenis.id}`;
      cek(j2.perlu_verifikasi === true && j2.catatan === "dicek bagian hukum", "perlu_verifikasi & catatan tersimpan");

      console.log("6. Versi baru jenis hukuman");
      const v = await ubahBaris(tx, pelaku, { tabel: "jenis_hukuman", id: jenis.id, data: { nama: "pemotongan tunjangan kinerja (versi uji)" }, alasan: "Perubahan bunyi peraturan", mode: "versi_baru" });
      const [lama] = await tx`select aktif, digantikan_oleh_id, berlaku_sampai from jenis_hukuman where id = ${jenis.id}`;
      const [baru] = await tx`select kode, versi, nama, aktif from jenis_hukuman where id = ${v.idBaru!}`;
      cek(lama.aktif === false && lama.digantikan_oleh_id === v.idBaru && lama.berlaku_sampai, "baris lama nonaktif, ditautkan, berlaku_sampai terisi");
      cek(baru.versi === 2 && baru.kode === "tukin_25_9_v2" && baru.aktif, `baris baru versi 2 berkode ${baru.kode}`);
      const ambangBaru = await tx`select 1 from ambang_kehadiran where regulasi_id = ${regulasiId} and jenis_hukuman_id = ${v.idBaru!} and aktif`;
      const ambangLama = await tx`select 1 from ambang_kehadiran where regulasi_id = ${regulasiId} and jenis_hukuman_id = ${jenis.id} and aktif`;
      cek(ambangBaru.length === 1 && ambangLama.length === 0, "ambang kehadiran ikut berpindah ke versi baru (sebagai versi baru ambang)");
      console.log("   catatan:", v.catatan.join(" | "));

      console.log("7. Regresi setelah suntingan → uji yang memakai kode lama harus terdeteksi memburuk");
      const r2 = await jalankanRegresi(tx, regulasiId);
      cek(r2.memburuk.length >= 1, `memburuk terdeteksi: ${r2.memburuk.map((m) => `${m.nama} (${m.selisih.join("; ")})`).join(" | ")}`);

      console.log("8. Versi baru pasal");
      const [pasal] = await tx`select * from pasal_regulasi where regulasi_id = ${regulasiId} and aktif order by urutan limit 1`;
      const vp = await ubahBaris(tx, pelaku, { tabel: "pasal_regulasi", id: pasal.id, data: { teks: `${pasal.teks} (perubahan)` }, alasan: "Perubahan bunyi pasal", mode: "versi_baru" });
      const [pb] = await tx`select versi, teks from pasal_regulasi where id = ${vp.idBaru!}`;
      cek(pb.versi === 2 && pb.teks.endsWith("(perubahan)"), "pasal versi 2 tersimpan");

      console.log("9. Koreksi salah ketik pada tingkat (terpakai)");
      const [tk] = await tx`select * from tingkat_hukuman where regulasi_id = ${regulasiId} and kode = 'ringan'`;
      await ubahBaris(tx, pelaku, { tabel: "tingkat_hukuman", id: tk.id, data: { nama: "ringan (koreksi)" }, alasan: "Salah ketik nama tingkat", mode: "koreksi" });
      const [tk2] = await tx`select nama from tingkat_hukuman where id = ${tk.id}`;
      cek(tk2.nama === "ringan (koreksi)", "koreksi tersimpan");
      const [ak] = await tx`select ringkasan_perubahan, alasan from audit_log where aksi = 'koreksi' and record_id = ${tk.id} order by id desc limit 1`;
      cek(ak && ak.alasan === "Salah ketik nama tingkat" && ak.ringkasan_perubahan.perubahan.nama.sebelum === "ringan", "audit 'koreksi' memuat nilai sebelum/sesudah dan alasan");
      const kunci = await harusGagal(tx, () => tx`update tingkat_hukuman set nama = 'y' where id = ${tk.id}`, "SIMPEL_KATALOG_TERPAKAI");
      cek(kunci && !kunci.startsWith("TIDAK"), "izin koreksi tidak bocor ke perintah berikutnya");

      console.log("10. Alasan wajib");
      const tanpa = await harusGagal(tx, () => ubahBaris(tx, pelaku, { tabel: "jenis_hukuman", id: v.idBaru!, data: { catatan: "x" }, alasan: "" }), "alasan");
      cek(tanpa && !tanpa.startsWith("TIDAK"), "perubahan tanpa alasan ditolak");

      console.log("11. Fixture: tambah, jalankan, hapus");
      const f = await tambahBaris(tx, pelaku, { tabel: "fixture_regresi", regulasiId, data: { nama: "Uji: 3 hari → ringan", masukan: { jenis: "kehadiran", hari: 3 }, harapan: { tingkat: "ringan" } }, alasan: "Tambah fixture uji" });
      const r3 = await jalankanRegresi(tx, regulasiId);
      cek(r3.hasil.find((h) => h.id === f.id)?.lulus === true, "fixture baru lulus dan hasilnya tersimpan");
      const [fx] = await tx`select lulus, dijalankan_pada, hasil_terakhir from fixture_regresi where id = ${f.id}`;
      cek(fx.lulus === true && fx.dijalankan_pada && fx.hasil_terakhir, "fixture_regresi.hasil_terakhir/lulus/dijalankan_pada terisi");
      await hapusBaris(tx, pelaku, { tabel: "fixture_regresi", id: f.id, alasan: "Hapus fixture uji" });
      const sisa = await tx`select 1 from fixture_regresi where id = ${f.id}`;
      cek(sisa.length === 0, "fixture terhapus (isi lama tersimpan di audit)");
      const hapusKatalog = await harusGagal(tx, () => hapusBaris(tx, pelaku, { tabel: "jenis_hukuman", id: v.idBaru!, alasan: "coba hapus" }), "Nonaktifkan");
      cek(hapusKatalog && !hapusKatalog.startsWith("TIDAK"), "baris katalog tidak dapat dihapus");

      console.log("12. Versi baru seluruh peraturan + aktivasi");
      const vr = await buatVersiBaruRegulasi(tx, pelaku, { regulasiId, kode: "UJI_ADMIN_TMP_V2", berlakuDari: "2031-01-01", alasan: "Peraturan diubah" });
      const [rb] = await tx`select versi, status, menggantikan_id from regulasi where id = ${vr.regulasiId}`;
      cek(rb.versi === 2 && rb.status === "draf" && rb.menggantikan_id === regulasiId, "versi baru tersimpan sebagai draf yang menggantikan versi lama");
      await ubahBaris(tx, pelaku, { tabel: "regulasi", id: vr.regulasiId, data: { status: "aktif" }, alasan: "Aktifkan versi baru" });
      const [rl] = await tx`select status, berlaku_sampai, digantikan_oleh_id from regulasi where id = ${regulasiId}`;
      cek(rl.status === "nonaktif" && rl.berlaku_sampai === "2031-01-01" && rl.digantikan_oleh_id === vr.regulasiId, "versi lama berakhir 2031-01-01 dan ditautkan ke versi baru");
      const tolakIdentitas = await harusGagal(tx, () => ubahBaris(tx, pelaku, { tabel: "regulasi", id: regulasiId, data: { judul: "judul lain" }, alasan: "uji ubah identitas" }), PESAN_TERPAKAI.slice(0, 40));
      cek(tolakIdentitas && !tolakIdentitas.startsWith("TIDAK"), "identitas peraturan yang terpakai tidak dapat diubah langsung");

      const [{ n }] = await tx`select count(*)::int as n from audit_log where ringkasan_perubahan->>'regulasi_id' in (${regulasiId}, ${vr.regulasiId})`;
      cek(n >= 10, `jejak audit tercatat (${n} baris)`);

      console.log("13. Kriteria 17: 'PP 99 Tahun 2030' — 4 tingkat, 12 jenis, ambang berbeda, panggilan 10 hari kerja, kewenangan sendiri");
      const t4 = ["satu", "dua", "tiga", "empat"].map((k, i) => ({ kode: k, nama: `tingkat ${k}`, urutan: i + 1 }));
      const j12 = Array.from({ length: 12 }, (_, i) => ({ kode: `j${i + 1}`, tingkat: t4[Math.floor(i / 3)].kode, nama: `jenis ${i + 1}`, urutan: i + 1 }));
      const pp99 = await eksporDefinisi(tx, pp94.id);
      pp99.regulasi = { ...pp99.regulasi, kode: "PP_99_2030_UJI", nomor: "99", tahun: 2030, nama_singkat: "PP 99/2030", status: "aktif", utama: true, berlaku_dari: "2030-01-01", menggantikan_kode: "PP_94_2021" };
      pp99.tingkat = t4;
      pp99.jenis_hukuman = j12;
      pp99.ambang = j12.map((j, i) => ({ hari_min: i * 2 + 2, hari_max: i === 11 ? null : i * 2 + 3, tingkat: j.tingkat, jenis: j.kode }));
      pp99.tenggat = (pp99.tenggat ?? []).map((t) => (t.kode === "panggilan_1" ? { ...t, jumlah: 10 } : t));
      pp99.kewenangan = t4.map((t) => ({ tingkat: t.kode, jenis: "penjatuh" as const, peran_kode: `pejabat_${t.kode}`, nama_peran: `Pejabat ${t.kode}` }));
      pp99.tahapan = (pp99.tahapan ?? []).map((t) => ({ ...t, kondisi: {} }));
      pp99.pemetaan = [];
      pp99.kaidah = (pp99.kaidah ?? []).filter((k) => k.kunci !== "tim_wajib_untuk");
      pp99.fixture = [
        { nama: "12 jenis", masukan: { jenis: "jumlah_jenis" }, harapan: { jumlah: 12 } },
        { nama: "4 tingkat", masukan: { jenis: "jumlah_tingkat" }, harapan: { jumlah: 4 } },
        { nama: "9 hari → tingkat dua, jenis ke-4", masukan: { jenis: "kehadiran", hari: 9 }, harapan: { tingkat: "dua", jenis_kode: "j4" } },
      ];
      const h99 = await daftarkanDefinisi(tx, pelaku, pp99, { alasan: "Uji kriteria penerimaan 17", sumber: "wizard" });
      const r99 = await jalankanRegresi(tx, h99.regulasiId);
      cek(r99.lulus === 3, `uji regresi PP 99 lulus (${r99.lulus}/${r99.jumlah})`);
      const { resolveRegulasi, muatAturan, muatKalender } = await import("../lib/regulasi");
      const res = await resolveRegulasi("A", "2030-06-01", tx);
      cek(res.status === "tunggal" && res.regulasi?.kode === "PP_99_2030_UJI", "kasus 1 Juni 2030 otomatis memakai PP 99/2030");
      const res94 = await resolveRegulasi("A", "2024-05-12", tx);
      cek(res94.status === "tunggal" && res94.regulasi?.kode === "PP_94_2021", "kasus 12 Mei 2024 tetap memakai PP 94/2021");
      const { hitungTenggat } = await import("../lib/hukdis/mesin");
      const a99 = await muatAturan(h99.regulasiId, tx);
      const tg = hitungTenggat(a99, "panggilan_1", "2030-03-15", await muatKalender(tx));
      cek(tg?.aturan.jumlah === 10, `tenggat panggilan 10 hari kerja (Panggilan I paling lambat ${tg?.tanggal} untuk pemeriksaan 15 Maret 2030)`);

      throw new Error(BATAL);
    });
  } catch (e) {
    if ((e as Error).message !== BATAL) {
      console.error(e instanceof GalatPengguna ? `GalatPengguna: ${e.message}` : e);
      gagal += 1;
    }
  }
  const sisa = await sql`select count(*)::int as n from regulasi where kode like 'UJI_ADMIN_TMP%'`;
  cek(sisa[0].n === 0, "transaksi dibatalkan — tidak ada data uji tertinggal");
  await sql.end();
  console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : "\nSemua pemeriksaan lulus.");
  process.exit(gagal ? 1 : 0);
}

main();
