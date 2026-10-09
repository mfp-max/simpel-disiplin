import "server-only";
import { sql, type Sql } from "@/lib/db";
import { GalatPengguna } from "@/lib/galat";
import { hariIni, type Kalender } from "@/lib/hari-kerja";
import { ambilRegulasi, muatAturan, muatKalender, resolveRegulasi, snapshotRegulasi, type Regulasi } from "@/lib/regulasi";
import { kunciPasal } from "@/lib/regulasi/definisi";
import {
  cariJenis, cariTingkat, hitungAmbangKehadiran, hitungTanggalSelesai, hitungTanggalTenggat, hitungTenggatKasus,
  jenisEfektif, kenaPemotonganIk, susunTahapanKasus, type KewenanganKasus,
} from "@/lib/hukdis/mesin";
import type { AturanLengkap, Tahapan } from "@/lib/hukdis/jenis";
import { ambilPegawai, konteksPegawai, nomorRegistrasi, rezimDariStatus, snapshotPegawai, type PegawaiLengkap } from "@/lib/entri";

export type MasukanPratinjau = {
  pegawaiId: string | null;
  tanggalPeristiwa: string | null;
  regulasiId?: string | null;
  rezimKode?: string | null;
  tingkatKode?: string | null;
  hariTmk?: number | null;
  hariTmkBerturut?: number | null;
};

export type Pratinjau = {
  pegawai: PegawaiLengkap | null;
  rezimKode: string | null;
  resolusi: Awaited<ReturnType<typeof resolveRegulasi>> | null;
  regulasi: Regulasi | null;
  tingkat: { kode: string; nama: string; urutan: number }[];
  tingkatKode: string | null;
  usulanKehadiran: { tingkat: string | null; jenis: string | null; jenisEfektif: string | null; diganti: boolean; pasal: string | null; akibat: string | null; alur: string | null; peringatanJenis: string | null } | null;
  kewenangan: KewenanganKasus | null;
  tahapan: Tahapan[];
  pemotonganIk: boolean;
  peringatan: string[];
};

function ringkasKewenangan(k: KewenanganKasus | null) {
  if (!k) return null;
  const r = (x: KewenanganKasus["penjatuh"]) => (x ? { peran_kode: x.aturan.peran_kode, nama_peran: x.aturan.nama_peran, pasal_rujukan: x.aturan.pasal_rujukan, catatan: x.aturan.catatan, lingkup: x.aturan.lingkup } : null);
  return { pemeriksa: r(k.pemeriksa), pembentuk_tim: r(k.pembentuk_tim), penjatuh: r(k.penjatuh), bentuk_tim: k.bentukTim, peringatan: k.peringatan };
}

/** Menghitung semua turunan aturan untuk kasus baru — tanpa menyimpan apa pun. */
export async function pratinjauKasus(m: MasukanPratinjau, db: Sql = sql): Promise<Pratinjau> {
  const peringatan: string[] = [];
  const pegawai = m.pegawaiId ? await ambilPegawai(m.pegawaiId, db) : null;
  const rezimKode = m.rezimKode ?? pegawai?.rezim_kode ?? (pegawai ? await rezimDariStatus(pegawai.status_pegawai, db) : null);
  if (pegawai && !rezimKode) peringatan.push(`Status pegawai "${pegawai.status_pegawai ?? "-"}" belum dipetakan ke rezim mana pun. Pilih peraturan secara manual dan periksa dasar hukumnya.`);

  let resolusi: Pratinjau["resolusi"] = null;
  let regulasi: Regulasi | null = null;
  if (m.regulasiId) {
    regulasi = await ambilRegulasi(m.regulasiId, db);
  } else if (rezimKode && m.tanggalPeristiwa) {
    resolusi = await resolveRegulasi(rezimKode, m.tanggalPeristiwa, db);
    regulasi = resolusi.regulasi;
    if (resolusi.status !== "tunggal") peringatan.push(resolusi.pesan);
  }

  const kosong: Pratinjau = { pegawai, rezimKode, resolusi, regulasi, tingkat: [], tingkatKode: null, usulanKehadiran: null, kewenangan: null, tahapan: [], pemotonganIk: false, peringatan };
  if (!regulasi) return kosong;
  if (regulasi.peringatan) peringatan.push(regulasi.peringatan);

  const aturan = await muatAturan(regulasi.id, db);
  let tingkatKode = m.tingkatKode ?? null;

  let usulanKehadiran: Pratinjau["usulanKehadiran"] = null;
  if (m.hariTmk || m.hariTmkBerturut) {
    const h = hitungAmbangKehadiran(aturan, m.hariTmk ?? 0, m.hariTmkBerturut ?? null);
    if (h) {
      usulanKehadiran = {
        tingkat: h.tingkat?.kode ?? null, jenis: h.jenis?.nama ?? null, jenisEfektif: h.jenisEfektif?.nama ?? null, diganti: h.diganti,
        pasal: h.ambang.pasal_rujukan, akibat: h.ambang.akibat_tambahan, alur: h.ambang.alur_khusus, peringatanJenis: h.jenis?.peringatan ?? null,
      };
      tingkatKode ??= h.tingkat?.kode ?? null;
    } else {
      peringatan.push(`Jumlah hari tidak masuk kerja tersebut belum mencapai ambang hukuman menurut ${regulasi.nama_singkat}.`);
    }
  }

  if (!tingkatKode) return { ...kosong, tingkat: aturan.tingkat, usulanKehadiran };

  const konteks = await konteksPegawai(pegawai, db);
  const { tahapan, kewenangan } = susunTahapanKasus(aturan, tingkatKode, konteks);
  peringatan.push(...kewenangan.peringatan);
  if (!tahapan.length) peringatan.push(`Peraturan ${regulasi.nama_singkat} belum memiliki daftar tahapan. Kasus tetap bisa dicatat; tahapan ditambahkan admin di Pengaturan → Peraturan.`);

  return {
    pegawai, rezimKode, resolusi, regulasi, tingkat: aturan.tingkat, tingkatKode, usulanKehadiran, kewenangan, tahapan,
    pemotonganIk: kenaPemotonganIk(aturan, tingkatKode), peringatan: [...new Set(peringatan)],
  };
}

export type MasukanKasus = MasukanPratinjau & {
  judul: string;
  ringkasan?: string | null;
  sumberInformasi?: string | null;
  pelaporNama?: string | null;
  pelaporKontak?: string | null;
  adaBukti?: boolean;
  pelanggaran?: { pasalRegulasiId?: string | null; pasalTeksBebas?: string | null; uraian?: string | null; dampak?: string | null; waktu?: string | null; tempat?: string | null }[];
  berasalDariId?: string | null;
  picUserId?: string | null;
};

/** Membuat kasus hukdis lengkap dengan tahapan & salinan beku. Dipanggil di dalam transaksi. */
export async function buatKasus(tx: Sql, m: MasukanKasus, userId: string) {
  if (!m.judul?.trim()) throw new GalatPengguna("Judul kasus wajib diisi.");
  if (!m.pegawaiId) throw new GalatPengguna("Pegawai terlapor wajib dipilih dari master pegawai.");
  if (!m.tanggalPeristiwa) throw new GalatPengguna("Tanggal peristiwa wajib diisi — dipakai untuk menentukan peraturan yang berlaku.");
  const p = await pratinjauKasus(m, tx);
  if (!p.regulasi) throw new GalatPengguna("Peraturan dasar kasus belum ditentukan. Pilih peraturan secara manual.");
  if (!p.tingkatKode) throw new GalatPengguna("Pilih dugaan tingkat hukuman disiplin.");
  const aturan = await muatAturan(p.regulasi.id, tx);
  const tingkat = cariTingkat(aturan, p.tingkatKode)!;
  const [tingkatRow] = await tx`select id from tingkat_hukuman where regulasi_id = ${p.regulasi.id} and kode = ${p.tingkatKode}`;
  const tahun = Number(m.tanggalPeristiwa.slice(0, 4));
  const nomor = await nomorRegistrasi(tx, "hukdis", new Date().getFullYear());
  const statusAwal = p.tahapan[0]?.status_kasus ?? "telaah";

  const [e] = await tx`insert into entri (nomor_registrasi, kelas, judul, ringkasan, tanggal_peristiwa, tahun_peristiwa, pegawai_id,
      unit_kerja_id, snapshot_pegawai, regulasi_id, rezim_kode, snapshot_regulasi, status_kasus, tingkat_hukuman_dugaan_id,
      sumber_informasi, pelapor_nama, pelapor_kontak, ada_bukti, hitung_dalam_sla, pemotongan_ik, kalkulasi, berasal_dari_id,
      pic_user_id, created_by, updated_by)
    values (${nomor}, 'hukdis', ${m.judul.trim()}, ${m.ringkasan ?? null}, ${m.tanggalPeristiwa}, ${tahun}, ${p.pegawai!.id},
      ${p.pegawai!.unit_kerja_id}, ${tx.json(snapshotPegawai(p.pegawai!) as never)}, ${p.regulasi.id}, ${p.rezimKode},
      ${tx.json(snapshotRegulasi(p.regulasi) as never)}, ${statusAwal}, ${tingkatRow.id}, ${m.sumberInformasi ?? null},
      ${m.pelaporNama ?? null}, ${m.pelaporKontak ?? null}, ${m.adaBukti ?? false}, true, ${p.pemotonganIk},
      ${tx.json({ kewenangan: ringkasKewenangan(p.kewenangan), usulan_kehadiran: p.usulanKehadiran, tingkat: { kode: tingkat.kode, nama: tingkat.nama }, dihitung_pada: new Date().toISOString() } as never)},
      ${m.berasalDariId ?? null}, ${m.picUserId ?? userId}, ${userId}, ${userId})
    returning id`;

  await tulisTahapan(tx, e.id, p.tahapan, userId);
  for (const [i, x] of (m.pelanggaran ?? []).entries()) await tambahPelanggaran(tx, e.id, x, i + 1, userId);
  await segarkanTenggat(tx, e.id);
  return { id: e.id as string, nomor };
}

async function tulisTahapan(tx: Sql, entriId: string, tahapan: Tahapan[], userId: string) {
  for (const [i, t] of tahapan.entries()) {
    await tx`insert into tahapan_kasus (entri_id, kode_tahap, urutan, nama, status, opsional, snapshot_aturan, created_by, updated_by)
      values (${entriId}, ${t.kode_tahap}, ${t.urutan}, ${t.nama}, ${i === 0 ? "berjalan" : "belum"}, ${t.opsional},
        ${tx.json({ status_kasus: t.status_kasus, pasal_rujukan: t.pasal_rujukan, bantuan: t.bantuan, jenis_dokumen: t.jenis_dokumen } as never)},
        ${userId}, ${userId})`;
  }
}

/** Menambah satu pelanggaran dengan kutipan pasal utuh yang dibekukan. */
export async function tambahPelanggaran(
  tx: Sql, entriId: string,
  x: { pasalRegulasiId?: string | null; pasalTeksBebas?: string | null; uraian?: string | null; dampak?: string | null; waktu?: string | null; tempat?: string | null },
  urutan: number, userId: string,
) {
  let snapshot: Record<string, unknown> | null = null;
  if (x.pasalRegulasiId) {
    const [ps] = await tx`select p.*, r.nama_singkat, r.kode as regulasi_kode, e.regulasi_id as entri_regulasi
      from pasal_regulasi p join regulasi r on r.id = p.regulasi_id, entri e where p.id = ${x.pasalRegulasiId} and e.id = ${entriId}`;
    if (!ps) throw new GalatPengguna("Pasal tidak ditemukan.");
    if (ps.regulasi_id !== ps.entri_regulasi) throw new GalatPengguna("Pasal harus berasal dari peraturan yang sama dengan kasus. Tidak boleh ada pasal lintas peraturan.");
    snapshot = {
      kunci: kunciPasal(ps as never), pasal: ps.pasal, ayat: ps.ayat, huruf: ps.huruf, angka: ps.angka, jenis: ps.jenis, teks: ps.teks,
      regulasi: ps.nama_singkat, dicatat_pada: new Date().toISOString(),
    };
  } else if (!x.pasalTeksBebas?.trim() && !x.uraian?.trim()) {
    throw new GalatPengguna("Pilih pasal atau tuliskan uraian pelanggaran.");
  }
  await tx`insert into pelanggaran_entri (entri_id, pasal_regulasi_id, pasal_teks_bebas, snapshot_pasal, uraian_perbuatan, dampak, waktu, tempat, urutan, created_by, updated_by)
    values (${entriId}, ${x.pasalRegulasiId ?? null}, ${x.pasalTeksBebas ?? null}, ${snapshot ? tx.json(snapshot as never) : null}, ${x.uraian ?? null},
      ${x.dampak ?? null}, ${x.waktu ?? null}, ${x.tempat ?? null}, ${urutan}, ${userId}, ${userId})`;
}

/** Menghitung ulang tenggat setiap tahap dari aturan peraturan kasus & kalender libur. */
export async function segarkanTenggat(tx: Sql, entriId: string, kal?: Kalender) {
  const [e] = await tx`select regulasi_id, hitung_dalam_sla from entri where id = ${entriId}`;
  if (!e?.regulasi_id || !e.hitung_dalam_sla) return;
  const aturan = await muatAturan(e.regulasi_id, tx);
  const kalender = kal ?? (await muatKalender(tx));
  const tahap = await tx`select id, kode_tahap, tanggal_rencana, tanggal_realisasi from tahapan_kasus where entri_id = ${entriId}`;
  const hasil = hitungTenggatKasus(aturan, tahap as never, kalender);
  for (const t of tahap) {
    const h = hasil.get(t.kode_tahap);
    await tx`update tahapan_kasus set tenggat = ${h?.tanggal ?? null},
        tenggat_info = ${h ? tx.json({ nama: h.aturan.nama_tenggat, sifat: h.aturan.sifat, pasal: h.aturan.pasal_rujukan, jumlah: h.aturan.jumlah, satuan: h.aturan.satuan, arah: h.aturan.arah, dari: h.aturan.dihitung_dari, dasar: h.dasar } as never) : null}
      where id = ${t.id} and (tenggat is distinct from ${h?.tanggal ?? null} or tenggat_info is null)`;
  }
}

/** Status kasus mengikuti tahap yang sedang berjalan. */
export async function selaraskanStatus(tx: Sql, entriId: string) {
  const [e] = await tx`select status_kasus from entri where id = ${entriId}`;
  if (["upaya_administratif", "dihentikan", "selesai"].includes(e.status_kasus)) return;
  const [jalan] = await tx`select snapshot_aturan from tahapan_kasus where entri_id = ${entriId} and status = 'berjalan' order by urutan limit 1`;
  const status = jalan?.snapshot_aturan?.status_kasus;
  if (status) await tx`update entri set status_kasus = ${status} where id = ${entriId}`;
}

/** Menandai tahap selesai dan membuka tahap wajib berikutnya. */
export async function selesaikanTahap(tx: Sql, tahapId: string, tanggalRealisasi: string, userId: string) {
  const [t] = await tx`update tahapan_kasus set status = 'selesai', tanggal_realisasi = ${tanggalRealisasi}, updated_by = ${userId}
    where id = ${tahapId} returning entri_id, urutan, kode_tahap`;
  if (!t) throw new GalatPengguna("Tahap tidak ditemukan.");
  const berikut = await tx`select id, kode_tahap, opsional, status from tahapan_kasus where entri_id = ${t.entri_id} and urutan > ${t.urutan} order by urutan`;
  const sedangJalan = berikut.some((b) => b.status === "berjalan");
  if (!sedangJalan) {
    const n = berikut.find((b) => b.status === "belum" && !b.opsional);
    if (n) {
      await tx`update tahapan_kasus set status = 'berjalan' where id = ${n.id}`;
      if (n.kode_tahap === "selesai") {
        await tx`update tahapan_kasus set status = 'selesai', tanggal_realisasi = ${tanggalRealisasi} where id = ${n.id}`;
        await tx`update entri set status_kasus = 'selesai', tanggal_selesai = ${tanggalRealisasi} where id = ${t.entri_id}`;
      }
    } else {
      await tx`update entri set status_kasus = 'selesai', tanggal_selesai = coalesce(tanggal_selesai, ${tanggalRealisasi}) where id = ${t.entri_id}`;
    }
  }
  await selaraskanStatus(tx, t.entri_id);
  await segarkanTenggat(tx, t.entri_id);
  return t.entri_id as string;
}

/** Mengganti dugaan tingkat (hanya selama belum ada tahap pemeriksaan yang selesai). Tahapan disusun ulang. */
export async function gantiTingkat(tx: Sql, entriId: string, tingkatKode: string, userId: string) {
  const [e] = await tx`select regulasi_id, pegawai_id from entri where id = ${entriId}`;
  const selesai = await tx`select kode_tahap from tahapan_kasus where entri_id = ${entriId} and status = 'selesai' and urutan > (
    select coalesce(min(urutan), 0) from tahapan_kasus where entri_id = ${entriId})`;
  if (selesai.length) throw new GalatPengguna("Tingkat hukuman tidak dapat diganti setelah proses melewati tahap telaah. Catat perubahan pada tahap penetapan.");
  const aturan = await muatAturan(e.regulasi_id, tx);
  const pegawai = e.pegawai_id ? await ambilPegawai(e.pegawai_id, tx) : null;
  const { tahapan, kewenangan } = susunTahapanKasus(aturan, tingkatKode, await konteksPegawai(pegawai, tx));
  const [tr] = await tx`select id, nama from tingkat_hukuman where regulasi_id = ${e.regulasi_id} and kode = ${tingkatKode}`;
  if (!tr) throw new GalatPengguna("Tingkat hukuman tidak dikenal pada peraturan kasus ini.");
  const telaah = await tx`select tanggal_rencana, tanggal_realisasi, catatan, status from tahapan_kasus where entri_id = ${entriId} order by urutan limit 1`;
  await tx`delete from tahapan_kasus where entri_id = ${entriId}`;
  await tulisTahapan(tx, entriId, tahapan, userId);
  if (telaah[0]) {
    await tx`update tahapan_kasus set tanggal_rencana = ${telaah[0].tanggal_rencana}, catatan = ${telaah[0].catatan}
      where entri_id = ${entriId} and urutan = (select min(urutan) from tahapan_kasus where entri_id = ${entriId})`;
  }
  await tx`update entri set tingkat_hukuman_dugaan_id = ${tr.id}, pemotongan_ik = ${kenaPemotonganIk(aturan, tingkatKode)},
      kalkulasi = coalesce(kalkulasi, '{}'::jsonb) || ${tx.json({ kewenangan: ringkasKewenangan(kewenangan), tingkat: { kode: tingkatKode, nama: tr.nama } } as never)},
      updated_by = ${userId}
    where id = ${entriId}`;
  await selaraskanStatus(tx, entriId);
  await segarkanTenggat(tx, entriId);
}

/** Mencatat keputusan hukuman (SK) dengan salinan beku jenis hukuman & hitung tanggal berlaku/selesai. */
export async function catatHukuman(
  tx: Sql, entriId: string,
  m: { jenisHukumanId: string; nomorSk?: string | null; tanggalSk?: string | null; pejabatPenjatuh?: string | null; tanggalDiterima?: string | null; catatan?: string | null },
  userId: string,
) {
  const [e] = await tx`select regulasi_id from entri where id = ${entriId}`;
  const aturan = await muatAturan(e.regulasi_id, tx);
  const [j] = await tx`select j.kode, j.regulasi_id from jenis_hukuman j where j.id = ${m.jenisHukumanId}`;
  if (!j || j.regulasi_id !== e.regulasi_id) throw new GalatPengguna("Jenis hukuman harus berasal dari peraturan kasus ini.");
  const jenis = cariJenis(aturan, j.kode);
  const ef = jenisEfektif(aturan, jenis);
  const tingkat = cariTingkat(aturan, jenis?.tingkat_kode);
  const kal = await muatKalender(tx);

  let mulai: string | null = null;
  const aturanBerlaku = aturan.tenggat.find((t) => t.kode_tahap === "berlaku");
  if (m.tanggalDiterima && aturanBerlaku) mulai = hitungTanggalTenggat(aturanBerlaku, m.tanggalDiterima, kal);
  // Masa transisi: yang dijalani adalah hukuman pengganti, jadi masanya mengikuti hukuman pengganti.
  const jenisDijalani = ef.diganti && ef.jenis ? ef.jenis : jenis;
  const selesai = hitungTanggalSelesai(mulai, jenisDijalani);
  const ik = kenaPemotonganIk(aturan, tingkat?.kode);
  const snapshot = {
    kode: jenis?.kode, nama: jenis?.nama, tingkat: tingkat?.nama, tingkat_kode: tingkat?.kode, durasi_bulan: jenis?.durasi_bulan ?? null,
    pengganti_sementara: ef.diganti ? { kode: ef.jenis?.kode, nama: ef.jenis?.nama, durasi_bulan: ef.jenis?.durasi_bulan ?? null } : null, pasal_rujukan: jenis?.pasal_rujukan ?? null,
    regulasi: aturan.regulasi.nama_singkat, dicatat_pada: new Date().toISOString(),
  };

  const [ada] = await tx`select id, snapshot_jenis_hukuman from hukuman where entri_id = ${entriId}`;
  if (ada) {
    await tx`update hukuman set nomor_sk = ${m.nomorSk ?? null}, tanggal_sk = ${m.tanggalSk ?? null}, pejabat_penjatuh = ${m.pejabatPenjatuh ?? null},
        tanggal_diterima_pegawai = ${m.tanggalDiterima ?? null}, tanggal_mulai_berlaku = ${mulai}, tanggal_selesai = ${selesai},
        catatan = ${m.catatan ?? null}, updated_by = ${userId}
        ${ada.snapshot_jenis_hukuman ? tx`` : tx`, jenis_hukuman_id = ${m.jenisHukumanId}, snapshot_jenis_hukuman = ${tx.json(snapshot as never)}, pemotongan_ik = ${ik}, blokir_kgb = ${ef.jenis?.blokir_kgb ?? false}, blokir_kenaikan_pangkat = ${ef.jenis?.blokir_kenaikan_pangkat ?? false}`}
      where id = ${ada.id}`;
  } else {
    await tx`insert into hukuman (entri_id, jenis_hukuman_id, snapshot_jenis_hukuman, nomor_sk, tanggal_sk, pejabat_penjatuh, tanggal_diterima_pegawai,
        tanggal_mulai_berlaku, tanggal_selesai, pemotongan_ik, blokir_kgb, blokir_kenaikan_pangkat, catatan, created_by, updated_by)
      values (${entriId}, ${m.jenisHukumanId}, ${tx.json(snapshot as never)}, ${m.nomorSk ?? null}, ${m.tanggalSk ?? null}, ${m.pejabatPenjatuh ?? null},
        ${m.tanggalDiterima ?? null}, ${mulai}, ${selesai}, ${ik}, ${ef.jenis?.blokir_kgb ?? false}, ${ef.jenis?.blokir_kenaikan_pangkat ?? false},
        ${m.catatan ?? null}, ${userId}, ${userId})`;
    await tx`update entri set jenis_hukuman_id = ${m.jenisHukumanId}, pemotongan_ik = ${ik} where id = ${entriId}`;
  }

  // Selaraskan tanggal tahap terkait bila tahapnya ada
  if (m.tanggalSk) await tx`update tahapan_kasus set tanggal_realisasi = coalesce(tanggal_realisasi, ${m.tanggalSk}) where entri_id = ${entriId} and kode_tahap = 'penetapan_sk'`;
  if (mulai) await tx`update tahapan_kasus set tanggal_rencana = ${mulai} where entri_id = ${entriId} and kode_tahap = 'berlaku'`;
  if (selesai) await tx`update tahapan_kasus set tanggal_rencana = ${selesai} where entri_id = ${entriId} and kode_tahap = 'menjalani'`;
  if (!jenisDijalani?.durasi_bulan) await tx`update tahapan_kasus set status = 'dilewati' where entri_id = ${entriId} and kode_tahap = 'menjalani' and status = 'belum'`;
  await segarkanTenggat(tx, entriId);
  return { mulai, selesai, pemotonganIk: ik, diganti: ef.diganti };
}

export { hariIni };
export type { AturanLengkap };
