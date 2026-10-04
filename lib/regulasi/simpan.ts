import type { Sql } from "@/lib/db";
import { GalatPengguna } from "@/lib/galat";
import { FORMAT_DEFINISI, kunciPasal, type DefinisiRegulasi } from "./definisi";

type Hasil = { regulasiId: string; peringatan: string[] };

/**
 * Menyimpan satu definisi peraturan ke tabel katalog. Hanya MENAMBAH baris —
 * tidak pernah mengubah peraturan yang sudah ada (kode sudah ada = ditolak).
 * Dipakai oleh seed, wizard "Tambah Peraturan Baru", dan impor JSON.
 */
export async function simpanDefinisi(tx: Sql, def: DefinisiRegulasi, userId: string | null = null): Promise<Hasil> {
  if (def.format !== FORMAT_DEFINISI) throw new GalatPengguna(`Format berkas tidak dikenal (${String(def.format)}).`);
  const r = def.regulasi;
  const peringatan: string[] = [];

  const ada = await tx`select id from regulasi where kode = ${r.kode}`;
  if (ada.length) throw new GalatPengguna(`Peraturan berkode ${r.kode} sudah ada. Gunakan kode lain atau buat versi baru.`);

  let menggantikanId: string | null = null;
  if (r.menggantikan_kode) {
    const m = await tx`select id from regulasi where kode = ${r.menggantikan_kode}`;
    if (m.length) menggantikanId = m[0].id;
    else peringatan.push(`Peraturan yang digantikan (${r.menggantikan_kode}) belum ada; tautan dilewati.`);
  }

  const [reg] = await tx`
    insert into regulasi (kode, jenis, nomor, tahun, judul, nama_singkat, nama_lengkap, rezim_kode, utama, status,
      berlaku_dari, berlaku_sampai, ditetapkan_pada, menggantikan_id, katalog_pasal_lengkap, catatan, peringatan,
      perlu_verifikasi, created_by, updated_by)
    values (${r.kode}, ${r.jenis}, ${r.nomor ?? null}, ${r.tahun ?? null}, ${r.judul}, ${r.nama_singkat}, ${r.nama_lengkap ?? null},
      ${r.rezim_kode ?? null}, ${r.utama ?? false}, ${r.status ?? "draf"}, ${r.berlaku_dari ?? null}, ${r.berlaku_sampai ?? null},
      ${r.ditetapkan_pada ?? null}, ${menggantikanId}, ${r.katalog_pasal_lengkap ?? true}, ${r.catatan ?? null}, ${r.peringatan ?? null},
      ${r.perlu_verifikasi ?? false}, ${userId}, ${userId})
    returning id`;
  const regId: string = reg.id;

  // Tingkat
  const tingkatId = new Map<string, string>();
  for (const t of def.tingkat ?? []) {
    const [row] = await tx`insert into tingkat_hukuman (regulasi_id, kode, nama, urutan, keterangan, created_by, updated_by)
      values (${regId}, ${t.kode}, ${t.nama}, ${t.urutan}, ${t.keterangan ?? null}, ${userId}, ${userId}) returning id`;
    tingkatId.set(t.kode, row.id);
  }
  const tId = (kode?: string | null) => {
    if (!kode) return null;
    const id = tingkatId.get(kode);
    if (!id) throw new GalatPengguna(`Tingkat "${kode}" tidak didefinisikan pada ${r.kode}.`);
    return id;
  };

  // Jenis hukuman (dua lintasan: pengganti sementara merujuk jenis lain)
  const jenisId = new Map<string, string>();
  for (const j of def.jenis_hukuman ?? []) {
    const [row] = await tx`insert into jenis_hukuman (regulasi_id, tingkat_hukuman_id, kode, nama, urutan, durasi_bulan, aktif,
        peringatan, catatan, pasal_rujukan, blokir_kgb, blokir_kenaikan_pangkat, perlu_verifikasi, created_by, updated_by)
      values (${regId}, ${tId(j.tingkat)}, ${j.kode}, ${j.nama}, ${j.urutan ?? 0}, ${j.durasi_bulan ?? null}, ${j.aktif ?? true},
        ${j.peringatan ?? null}, ${j.catatan ?? null}, ${j.pasal_rujukan ?? null}, ${j.blokir_kgb ?? false},
        ${j.blokir_kenaikan_pangkat ?? false}, ${j.perlu_verifikasi ?? false}, ${userId}, ${userId}) returning id`;
    jenisId.set(j.kode, row.id);
  }
  for (const j of def.jenis_hukuman ?? []) {
    if (!j.pengganti_sementara) continue;
    const p = jenisId.get(j.pengganti_sementara);
    if (!p) throw new GalatPengguna(`Pengganti sementara "${j.pengganti_sementara}" tidak ditemukan.`);
    await tx`update jenis_hukuman set pengganti_sementara_id = ${p} where id = ${jenisId.get(j.kode)!}`;
  }
  const jId = (kode?: string | null) => {
    if (!kode) return null;
    const id = jenisId.get(kode);
    if (!id) throw new GalatPengguna(`Jenis hukuman "${kode}" tidak didefinisikan pada ${r.kode}.`);
    return id;
  };

  // Pasal
  const pasalId = new Map<string, string>();
  let urut = 0;
  for (const p of def.pasal ?? []) {
    urut += 1;
    const [row] = await tx`insert into pasal_regulasi (regulasi_id, jenis, pasal, ayat, huruf, angka, teks, tingkat_hukuman_terkait_id,
        urutan, perlu_verifikasi, catatan, created_by, updated_by)
      values (${regId}, ${p.jenis}, ${p.pasal}, ${p.ayat ?? null}, ${p.huruf ?? null}, ${p.angka ?? null}, ${p.teks}, ${tId(p.tingkat)},
        ${urut}, ${p.perlu_verifikasi ?? false}, ${p.catatan ?? null}, ${userId}, ${userId}) returning id`;
    pasalId.set(kunciPasal(p), row.id);
  }

  let i = 0;
  for (const a of def.ambang ?? []) {
    i += 1;
    await tx`insert into ambang_kehadiran (regulasi_id, hari_min, hari_max, berturut_turut, tingkat_hukuman_id, jenis_hukuman_id,
        pasal_rujukan, akibat_tambahan, alur_khusus, urutan, perlu_verifikasi, catatan, created_by, updated_by)
      values (${regId}, ${a.hari_min}, ${a.hari_max ?? null}, ${a.berturut_turut ?? false}, ${tId(a.tingkat)}, ${jId(a.jenis)},
        ${a.pasal_rujukan ?? null}, ${a.akibat_tambahan ?? null}, ${a.alur_khusus ?? null}, ${i}, ${a.perlu_verifikasi ?? false},
        ${a.catatan ?? null}, ${userId}, ${userId})`;
  }

  for (const t of def.tenggat ?? []) {
    await tx`insert into aturan_tenggat (regulasi_id, kode, nama_tenggat, kode_tahap, dihitung_dari, acuan_tanggal, arah, jumlah, satuan,
        hitung_hari_dasar, sifat, pasal_rujukan, catatan, perlu_verifikasi, created_by, updated_by)
      values (${regId}, ${t.kode}, ${t.nama_tenggat}, ${t.kode_tahap}, ${t.dihitung_dari}, ${t.acuan_tanggal ?? "realisasi"}, ${t.arah},
        ${t.jumlah}, ${t.satuan}, ${t.hitung_hari_dasar ?? false}, ${t.sifat ?? "wajib_hukum"}, ${t.pasal_rujukan ?? null},
        ${t.catatan ?? null}, ${t.perlu_verifikasi ?? false}, ${userId}, ${userId})`;
  }

  for (const k of def.kewenangan ?? []) {
    await tx`insert into aturan_kewenangan (regulasi_id, tingkat_hukuman_id, jenis, peran_kode, nama_peran, lingkup, syarat_tambahan,
        hasil, prioritas, pasal_rujukan, catatan, perlu_verifikasi, created_by, updated_by)
      values (${regId}, ${tId(k.tingkat)}, ${k.jenis}, ${k.peran_kode}, ${k.nama_peran}, ${k.lingkup ?? null},
        ${tx.json((k.syarat_tambahan ?? {}) as never)}, ${tx.json((k.hasil ?? {}) as never)}, ${k.prioritas ?? 100},
        ${k.pasal_rujukan ?? null}, ${k.catatan ?? null}, ${k.perlu_verifikasi ?? false}, ${userId}, ${userId})`;
  }

  for (const t of def.tahapan ?? []) {
    await tx`insert into aturan_tahapan (regulasi_id, tingkat_hukuman_id, kode_tahap, nama, urutan, opsional, kondisi, status_kasus,
        pasal_rujukan, bantuan, jenis_dokumen, perlu_verifikasi, created_by, updated_by)
      values (${regId}, ${tId(t.tingkat)}, ${t.kode_tahap}, ${t.nama}, ${t.urutan}, ${t.opsional ?? false},
        ${tx.json((t.kondisi ?? {}) as never)}, ${t.status_kasus ?? null}, ${t.pasal_rujukan ?? null}, ${t.bantuan ?? null},
        ${t.jenis_dokumen ?? []}, ${t.perlu_verifikasi ?? false}, ${userId}, ${userId})`;
  }

  for (const p of def.pemetaan ?? []) {
    let pid: string | null = null;
    if (p.pasal) {
      pid = pasalId.get(p.pasal) ?? null;
      if (!pid) peringatan.push(`Pemetaan merujuk pasal "${p.pasal}" yang tidak ada; dilewati.`);
      if (!pid) continue;
    }
    await tx`insert into aturan_pemetaan_pelanggaran (regulasi_id, pasal_regulasi_id, dampak, tingkat_hukuman_id, pasal_rujukan_pemetaan,
        catatan, perlu_verifikasi, created_by, updated_by)
      values (${regId}, ${pid}, ${p.dampak}, ${tId(p.tingkat)}, ${p.pasal_rujukan_pemetaan ?? null}, ${p.catatan ?? null},
        ${p.perlu_verifikasi ?? false}, ${userId}, ${userId})`;
  }

  for (const k of def.kaidah ?? []) {
    await tx`insert into aturan_kaidah (regulasi_id, kunci, nilai, pasal_rujukan, catatan, perlu_verifikasi, created_by, updated_by)
      values (${regId}, ${k.kunci}, ${tx.json(k.nilai as never)}, ${k.pasal_rujukan ?? null}, ${k.catatan ?? null},
        ${k.perlu_verifikasi ?? false}, ${userId}, ${userId})`;
  }

  for (const f of def.fixture ?? []) {
    await tx`insert into fixture_regresi (regulasi_id, nama, masukan, harapan, catatan, created_by, updated_by)
      values (${regId}, ${f.nama}, ${tx.json(f.masukan as never)}, ${tx.json(f.harapan as never)}, ${f.catatan ?? null}, ${userId}, ${userId})`;
  }

  return { regulasiId: regId, peringatan };
}

/** Menautkan peraturan terkait (dijalankan setelah semua peraturan tersimpan). */
export async function simpanTerkait(tx: Sql, def: DefinisiRegulasi): Promise<string[]> {
  const peringatan: string[] = [];
  const [reg] = await tx`select id from regulasi where kode = ${def.regulasi.kode}`;
  if (!reg) return peringatan;
  let urutan = 0;
  for (const t of def.terkait ?? []) {
    urutan += 1;
    const [lain] = await tx`select id from regulasi where kode = ${t.kode}`;
    if (!lain) {
      peringatan.push(`Peraturan terkait ${t.kode} belum ada; dilewati.`);
      continue;
    }
    await tx`insert into regulasi_terkait (regulasi_id, terkait_id, peran, urutan, keterangan)
      values (${reg.id}, ${lain.id}, ${t.peran}, ${urutan}, ${t.keterangan ?? null})
      on conflict (regulasi_id, terkait_id) do nothing`;
  }
  return peringatan;
}

/** Mengekspor definisi peraturan dari basis data (kebalikan simpanDefinisi). */
export async function eksporDefinisi(db: Sql, regulasiId: string): Promise<DefinisiRegulasi> {
  const [r] = await db`select r.*, m.kode as menggantikan_kode from regulasi r left join regulasi m on m.id = r.menggantikan_id where r.id = ${regulasiId}`;
  if (!r) throw new GalatPengguna("Peraturan tidak ditemukan");
  const tingkat = await db`select * from tingkat_hukuman where regulasi_id = ${regulasiId} order by urutan`;
  const tk = new Map(tingkat.map((t) => [t.id, t.kode as string]));
  const jenis = await db`select * from jenis_hukuman where regulasi_id = ${regulasiId} order by urutan`;
  const jk = new Map(jenis.map((j) => [j.id, j.kode as string]));
  const pasal = await db`select * from pasal_regulasi where regulasi_id = ${regulasiId} order by urutan`;
  const pk = new Map(pasal.map((p) => [p.id, kunciPasal(p as never)]));
  const [ambang, tenggat, kewenangan, tahapan, pemetaan, kaidah, fixture, terkait] = await Promise.all([
    db`select * from ambang_kehadiran where regulasi_id = ${regulasiId} order by urutan`,
    db`select * from aturan_tenggat where regulasi_id = ${regulasiId} order by kode`,
    db`select * from aturan_kewenangan where regulasi_id = ${regulasiId} order by jenis, prioritas`,
    db`select * from aturan_tahapan where regulasi_id = ${regulasiId} order by urutan`,
    db`select * from aturan_pemetaan_pelanggaran where regulasi_id = ${regulasiId}`,
    db`select * from aturan_kaidah where regulasi_id = ${regulasiId} order by kunci`,
    db`select * from fixture_regresi where regulasi_id = ${regulasiId} order by created_at`,
    db`select t.peran, t.keterangan, r2.kode from regulasi_terkait t join regulasi r2 on r2.id = t.terkait_id where t.regulasi_id = ${regulasiId} order by t.urutan`,
  ]);
  const aktifSaja = (xs: readonly Record<string, unknown>[]) => xs.filter((x) => x.aktif !== false);

  return {
    format: FORMAT_DEFINISI,
    regulasi: {
      kode: r.kode, jenis: r.jenis, nomor: r.nomor, tahun: r.tahun, judul: r.judul, nama_singkat: r.nama_singkat,
      nama_lengkap: r.nama_lengkap, rezim_kode: r.rezim_kode, utama: r.utama, status: r.status, berlaku_dari: r.berlaku_dari,
      berlaku_sampai: r.berlaku_sampai, ditetapkan_pada: r.ditetapkan_pada, menggantikan_kode: r.menggantikan_kode,
      katalog_pasal_lengkap: r.katalog_pasal_lengkap, catatan: r.catatan, peringatan: r.peringatan, perlu_verifikasi: r.perlu_verifikasi,
    },
    terkait: terkait.map((t) => ({ kode: t.kode, peran: t.peran, keterangan: t.keterangan })),
    tingkat: aktifSaja(tingkat).map((t: Record<string, unknown>) => ({ kode: t.kode as string, nama: t.nama as string, urutan: t.urutan as number, keterangan: t.keterangan as string | null })),
    jenis_hukuman: aktifSaja(jenis).map((j: Record<string, unknown>) => ({
      kode: j.kode as string, tingkat: tk.get(j.tingkat_hukuman_id as string)!, nama: j.nama as string, urutan: j.urutan as number,
      durasi_bulan: j.durasi_bulan as number | null, pengganti_sementara: j.pengganti_sementara_id ? jk.get(j.pengganti_sementara_id as string) ?? null : null,
      peringatan: j.peringatan as string | null, catatan: j.catatan as string | null, pasal_rujukan: j.pasal_rujukan as string | null,
      blokir_kgb: j.blokir_kgb as boolean, blokir_kenaikan_pangkat: j.blokir_kenaikan_pangkat as boolean, perlu_verifikasi: j.perlu_verifikasi as boolean,
    })),
    pasal: aktifSaja(pasal).map((p: Record<string, unknown>) => ({
      jenis: p.jenis as string, pasal: p.pasal as string, ayat: p.ayat as string | null, huruf: p.huruf as string | null, angka: p.angka as string | null,
      teks: p.teks as string, tingkat: p.tingkat_hukuman_terkait_id ? tk.get(p.tingkat_hukuman_terkait_id as string) ?? null : null,
      perlu_verifikasi: p.perlu_verifikasi as boolean, catatan: p.catatan as string | null,
    })),
    ambang: aktifSaja(ambang).map((a: Record<string, unknown>) => ({
      hari_min: a.hari_min as number, hari_max: a.hari_max as number | null, berturut_turut: a.berturut_turut as boolean,
      tingkat: a.tingkat_hukuman_id ? tk.get(a.tingkat_hukuman_id as string) ?? null : null,
      jenis: a.jenis_hukuman_id ? jk.get(a.jenis_hukuman_id as string) ?? null : null,
      pasal_rujukan: a.pasal_rujukan as string | null, akibat_tambahan: a.akibat_tambahan as string | null, alur_khusus: a.alur_khusus as string | null,
      perlu_verifikasi: a.perlu_verifikasi as boolean, catatan: a.catatan as string | null,
    })),
    tenggat: aktifSaja(tenggat).map((t: Record<string, unknown>) => ({
      kode: t.kode as string, nama_tenggat: t.nama_tenggat as string, kode_tahap: t.kode_tahap as string, dihitung_dari: t.dihitung_dari as string,
      acuan_tanggal: t.acuan_tanggal as "realisasi" | "rencana", arah: t.arah as "sebelum" | "sesudah", jumlah: t.jumlah as number,
      satuan: t.satuan as "hari_kerja", hitung_hari_dasar: t.hitung_hari_dasar as boolean, sifat: t.sifat as "wajib_hukum",
      pasal_rujukan: t.pasal_rujukan as string | null, catatan: t.catatan as string | null, perlu_verifikasi: t.perlu_verifikasi as boolean,
    })),
    kewenangan: aktifSaja(kewenangan).map((k: Record<string, unknown>) => ({
      tingkat: k.tingkat_hukuman_id ? tk.get(k.tingkat_hukuman_id as string) ?? null : null, jenis: k.jenis as "penjatuh",
      peran_kode: k.peran_kode as string, nama_peran: k.nama_peran as string, lingkup: k.lingkup as string | null,
      syarat_tambahan: k.syarat_tambahan as Record<string, unknown>, hasil: k.hasil as Record<string, unknown>, prioritas: k.prioritas as number,
      pasal_rujukan: k.pasal_rujukan as string | null, catatan: k.catatan as string | null, perlu_verifikasi: k.perlu_verifikasi as boolean,
    })),
    tahapan: aktifSaja(tahapan).map((t: Record<string, unknown>) => ({
      tingkat: t.tingkat_hukuman_id ? tk.get(t.tingkat_hukuman_id as string) ?? null : null, kode_tahap: t.kode_tahap as string,
      nama: t.nama as string, urutan: t.urutan as number, opsional: t.opsional as boolean, kondisi: t.kondisi as Record<string, unknown>,
      status_kasus: t.status_kasus as string | null, pasal_rujukan: t.pasal_rujukan as string | null, bantuan: t.bantuan as string | null,
      jenis_dokumen: t.jenis_dokumen as string[], perlu_verifikasi: t.perlu_verifikasi as boolean,
    })),
    pemetaan: aktifSaja(pemetaan).map((p: Record<string, unknown>) => ({
      pasal: p.pasal_regulasi_id ? pk.get(p.pasal_regulasi_id as string) ?? null : null, dampak: p.dampak as string,
      tingkat: tk.get(p.tingkat_hukuman_id as string)!, pasal_rujukan_pemetaan: p.pasal_rujukan_pemetaan as string | null,
      catatan: p.catatan as string | null, perlu_verifikasi: p.perlu_verifikasi as boolean,
    })),
    kaidah: kaidah.map((k) => ({ kunci: k.kunci, nilai: k.nilai, pasal_rujukan: k.pasal_rujukan, catatan: k.catatan, perlu_verifikasi: k.perlu_verifikasi })),
    fixture: fixture.map((f) => ({ nama: f.nama, masukan: f.masukan, harapan: f.harapan, catatan: f.catatan })),
  };
}
