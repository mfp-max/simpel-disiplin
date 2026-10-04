// Uji alur kasus terhadap basis data asli di dalam transaksi yang DIBATALKAN.
// Pakai: npx tsx --env-file=.env.local scripts/uji-kasus.ts
import { sql } from "../lib/db";
import { buatKasus, catatHukuman, tambahPelanggaran } from "../lib/kasus";
import { muatAturan } from "../lib/regulasi";
import { validasiTim } from "../lib/hukdis/mesin";

const BATAL = new Error("__batal__");
let gagal = 0;
const cek = (nama: string, ok: boolean, info?: unknown) => {
  console.log(`${ok ? "✓" : "✗"} ${nama}${ok ? "" : ` — ${JSON.stringify(info)}`}`);
  if (!ok) gagal += 1;
};

async function main() {
  try {
    await sql.begin(async (tx0) => {
      const tx = tx0 as unknown as typeof sql;
      const [admin] = await tx`select id from app_users limit 1`;
      const [pns] = await tx`insert into pegawai (nip, nama_lengkap_gelar, status_pegawai, golongan_ruang, pangkat, rezim_kode)
        values ('UJI0000000000001', 'Uji PNS, S.Pd.', 'PNS', 'III/c', 'Penata', 'A') returning id`;
      const [ptna] = await tx`insert into pegawai (nip, nama_lengkap_gelar, status_pegawai, golongan_ruang, rezim_kode)
        values ('UJI0000000000002', 'Uji PTNA, M.Pd.', 'PTNA', 'III/b', 'B') returning id`;

      // Kriteria 4 & 7: PNS → PP 94/2021, berat → Tim oleh Rektor + lapor Sekjen
      const k1 = await buatKasus(tx, { judul: "Uji PNS berat", pegawaiId: pns.id, tanggalPeristiwa: "2026-09-01", tingkatKode: "berat" }, admin.id);
      const [e1] = await tx`select snapshot_regulasi->>'kode' as kode, regulasi_id, pemotongan_ik from entri where id = ${k1.id}`;
      cek("Kriteria 4: PNS otomatis memakai PP 94/2021", e1.kode === "PP_94_2021", e1);
      const tahap1 = (await tx`select kode_tahap from tahapan_kasus where entri_id = ${k1.id} order by urutan`).map((r) => r.kode_tahap);
      cek("Kriteria 7: berat memuat pembentukan Tim oleh Rektor & lapor Sekjen", tahap1.includes("pembentukan_tim") && tahap1.includes("lapor_sekjen"), tahap1);
      cek("Usul ke Menteri muncul (penjatuh berat = Menteri)", tahap1.includes("usul_menteri"), tahap1);

      // Pasal lintas peraturan ditolak
      const [pasalPertor] = await tx`select p.id from pasal_regulasi p join regulasi r on r.id = p.regulasi_id where r.kode = 'PERTOR_70_2026' limit 1`;
      let ditolak = false;
      try { await tx0.savepoint((sp) => tambahPelanggaran(sp as unknown as typeof sql, k1.id, { pasalRegulasiId: pasalPertor.id }, 1, admin.id)); } catch { ditolak = true; }
      cek("Pasal lintas peraturan ditolak", ditolak);
      const [pasalPP] = await tx`select p.id from pasal_regulasi p where p.regulasi_id = ${e1.regulasi_id} and p.pasal = '4' and p.huruf = 'f'`;
      await tambahPelanggaran(tx, k1.id, { pasalRegulasiId: pasalPP.id, uraian: "Tidak masuk kerja" }, 1, admin.id);
      const [pl] = await tx`select snapshot_pasal from pelanggaran_entri where entri_id = ${k1.id}`;
      cek("Kutipan pasal dibekukan", pl.snapshot_pasal?.kunci === "Pasal 4 huruf f" && !!pl.snapshot_pasal?.teks, pl.snapshot_pasal);

      // Kriteria 5: PTNA → Pertor 70/2026, sedang → pemotongan IK
      const k2 = await buatKasus(tx, { judul: "Uji PTNA sedang", pegawaiId: ptna.id, tanggalPeristiwa: "2026-09-01", tingkatKode: "sedang" }, admin.id);
      const [e2] = await tx`select snapshot_regulasi->>'kode' as kode, pemotongan_ik from entri where id = ${k2.id}`;
      cek("Kriteria 5: PTNA memakai Pertor 70/2026 + pemotongan IK", e2.kode === "PERTOR_70_2026" && e2.pemotongan_ik === true, e2);

      // Kriteria 19 (tanggal lama): PNS peristiwa 2015 → PP 53/2010
      const k3 = await buatKasus(tx, { judul: "Uji 2015", pegawaiId: pns.id, tanggalPeristiwa: "2015-05-12", tingkatKode: "ringan" }, admin.id);
      const [e3] = await tx`select snapshot_regulasi->>'kode' as kode from entri where id = ${k3.id}`;
      cek("Kriteria 19: peristiwa 12 Mei 2015 → PP 53/2010", e3.kode === "PP_53_2010", e3);

      // Kriteria 8: anggota lebih rendah ditolak dengan dasar
      const aturan = await muatAturan(e1.regulasi_id, tx);
      const v = validasiTim(aturan, [{ nama: "Anggota III/a", unsur: "pengawasan", jabatan_dalam_tim: "anggota", peringkat: 9 }], 11);
      cek("Kriteria 8: anggota lebih rendah ditolak dengan dasar aturan", v.galat.length === 1 && /PerBKN/.test(v.galat[0]), v.galat);

      // Kriteria 9: SK 10 Juli, diterima 14 Juli → berlaku hari kerja ke-15
      const k4 = await buatKasus(tx, { judul: "Uji ringan SK", pegawaiId: pns.id, tanggalPeristiwa: "2026-06-01", tingkatKode: "ringan" }, admin.id);
      const [jl] = await tx`select j.id from jenis_hukuman j join regulasi r on r.id = j.regulasi_id where r.kode = 'PP_94_2021' and j.kode = 'teguran_tertulis'`;
      const h = await catatHukuman(tx, k4.id, { jenisHukumanId: jl.id, tanggalSk: "2026-07-10", tanggalDiterima: "2026-07-14" }, admin.id);
      cek("Kriteria 9: berlaku 4 Agustus 2026", h.mulai === "2026-08-04", h);
      const [hk] = await tx`select snapshot_jenis_hukuman from hukuman where entri_id = ${k4.id}`;
      cek("Jenis hukuman dibekukan", hk.snapshot_jenis_hukuman?.nama === "teguran tertulis", hk.snapshot_jenis_hukuman);

      // Kriteria 18: katalog terpakai tidak bisa diubah substantif
      let terkunci = false;
      try { await tx0.savepoint((sp) => sp`update jenis_hukuman set nama = 'diubah' where id = ${jl.id}`); } catch { terkunci = true; }
      cek("Kriteria 18: katalog terpakai menolak perubahan substantif", terkunci);

      // Audit log tidak bisa dihapus
      let auditKekal = false;
      try { await tx0.savepoint((sp) => sp`delete from audit_log where id = (select min(id) from audit_log)`); } catch { auditKekal = true; }
      cek("Audit log tidak bisa dihapus", auditKekal);

      throw BATAL;
    });
  } catch (e) {
    if (e !== BATAL) { console.error("Galat:", e); gagal += 1; }
  } finally {
    await sql.end();
  }
  console.log(gagal ? `\n${gagal} uji GAGAL` : "\nSemua uji lulus (transaksi dibatalkan, tidak ada data tertinggal).");
  process.exitCode = gagal ? 1 : 0;
}
main();
