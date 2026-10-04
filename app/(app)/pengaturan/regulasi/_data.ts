import "server-only";
import { sql } from "@/lib/db";
import { daftarStatusKasus, referensi } from "@/lib/pengaturan";
import { kunciPasal } from "@/lib/regulasi/definisi";
import { KAIDAH_DIKENAL, type Baris, type KonteksSkema, type Opsi } from "./_skema";

const opsiKaidah = () => Object.entries(KAIDAH_DIKENAL).map(([nilai, label]) => ({ nilai, label }));

const KOLOM_SISTEM = new Set(["created_at", "updated_at", "created_by", "updated_by"]);

/** Baris basis data → objek polos untuk komponen klien. */
export function polos(rows: readonly Record<string, unknown>[]): Baris[] {
  return rows.map((r) => {
    const o: Baris = {};
    for (const [k, v] of Object.entries(r)) {
      if (KOLOM_SISTEM.has(k)) continue;
      o[k] = v instanceof Date ? v.toISOString() : v;
    }
    return o;
  });
}

export type DataKatalog = Awaited<ReturnType<typeof muatKatalog>>;

/** Seluruh isi katalog sebuah peraturan (termasuk baris nonaktif). */
export async function muatKatalog(regulasiId: string) {
  const [reg] = await sql`select r.*, m.nama_singkat as menggantikan_nama, g.nama_singkat as digantikan_nama, z.nama as rezim_nama
    from regulasi r left join regulasi m on m.id = r.menggantikan_id left join regulasi g on g.id = r.digantikan_oleh_id
    left join rezim z on z.kode = r.rezim_kode where r.id = ${regulasiId}`;
  if (!reg) return null;
  const [tingkat, jenis, pasal, ambang, tenggat, kewenangan, tahapan, pemetaan, kaidah, terkait, fixture, [{ kasus }]] = await Promise.all([
    sql`select * from tingkat_hukuman where regulasi_id = ${regulasiId} order by aktif desc, urutan`,
    sql`select j.* from jenis_hukuman j join tingkat_hukuman t on t.id = j.tingkat_hukuman_id where j.regulasi_id = ${regulasiId} order by j.aktif desc, t.urutan, j.urutan`,
    sql`select * from pasal_regulasi where regulasi_id = ${regulasiId} order by aktif desc, jenis, urutan`,
    sql`select * from ambang_kehadiran where regulasi_id = ${regulasiId} order by aktif desc, berturut_turut, hari_min`,
    sql`select * from aturan_tenggat where regulasi_id = ${regulasiId} order by aktif desc, kode`,
    sql`select * from aturan_kewenangan where regulasi_id = ${regulasiId} order by aktif desc, jenis, prioritas`,
    sql`select * from aturan_tahapan where regulasi_id = ${regulasiId} order by aktif desc, urutan`,
    sql`select * from aturan_pemetaan_pelanggaran where regulasi_id = ${regulasiId} order by aktif desc, dampak`,
    sql`select * from aturan_kaidah where regulasi_id = ${regulasiId} order by kunci`,
    sql`select t.*, r.nama_singkat, r.judul from regulasi_terkait t join regulasi r on r.id = t.terkait_id where t.regulasi_id = ${regulasiId} order by t.urutan`,
    sql`select * from fixture_regresi where regulasi_id = ${regulasiId} order by created_at, nama`,
    sql`select count(*)::int as kasus from entri where regulasi_id = ${regulasiId}`,
  ]);
  const terpakaiBaris = await sql`select distinct pasal_regulasi_id as id from pelanggaran_entri p join pasal_regulasi r on r.id = p.pasal_regulasi_id where r.regulasi_id = ${regulasiId}
    union select distinct jenis_hukuman_id from hukuman h join jenis_hukuman j on j.id = h.jenis_hukuman_id where j.regulasi_id = ${regulasiId}
    union select distinct jenis_hukuman_id from entri e join jenis_hukuman j on j.id = e.jenis_hukuman_id where j.regulasi_id = ${regulasiId}`;
  return {
    regulasi: polos([reg])[0],
    jumlahKasus: kasus as number,
    terpakaiBaris: terpakaiBaris.map((r) => r.id as string).filter(Boolean),
    tingkat_hukuman: polos(tingkat),
    jenis_hukuman: polos(jenis),
    pasal_regulasi: polos(pasal),
    ambang_kehadiran: polos(ambang),
    aturan_tenggat: polos(tenggat),
    aturan_kewenangan: polos(kewenangan),
    aturan_tahapan: polos(tahapan),
    aturan_pemetaan_pelanggaran: polos(pemetaan),
    aturan_kaidah: polos(kaidah),
    regulasi_terkait: polos(terkait),
    fixture_regresi: polos(fixture),
  };
}

/** Pilihan isian (rujukan) untuk formulir editor. */
export async function muatOpsi(kat: NonNullable<DataKatalog>, regulasiId: string): Promise<KonteksSkema> {
  const [daftarReg, rezim, dampak, jenisDok, status] = await Promise.all([
    sql`select id, nama_singkat, judul from regulasi where id <> ${regulasiId} order by rezim_kode nulls last, berlaku_dari nulls first`,
    sql`select kode, nama from rezim where aktif order by urutan`,
    referensi("dampak"),
    referensi("jenis_dokumen"),
    daftarStatusKasus(),
  ]);
  const tahap = new Map<string, string>();
  for (const t of kat.aturan_tahapan) if (!tahap.has(String(t.kode_tahap))) tahap.set(String(t.kode_tahap), String(t.nama));
  const nonaktif = (b: Baris) => (b.aktif === false ? " (nonaktif)" : "");
  const opsi: Record<string, Opsi[]> = {
    tingkat: kat.tingkat_hukuman.map((t) => ({ nilai: String(t.id), label: `${t.nama}${nonaktif(t)}` })),
    jenis: kat.jenis_hukuman.map((j) => ({ nilai: String(j.id), label: `${j.nama}${nonaktif(j)}` })),
    pasal: kat.pasal_regulasi.map((p) => ({ nilai: String(p.id), label: `${kunciPasal(p as never)}${nonaktif(p)}` })),
    regulasi: daftarReg.map((r) => ({ nilai: r.id as string, label: `${r.nama_singkat} — ${r.judul}` })),
    rezim: rezim.map((r) => ({ nilai: r.kode as string, label: r.nama as string })),
    dampak: dampak.map((d) => ({ nilai: d.kode, label: d.label })),
    jenis_dokumen: jenisDok.map((d) => ({ nilai: d.kode, label: d.label })),
    status_kasus: status.map((s) => ({ nilai: s.kode, label: s.nama })),
    tahap: [...tahap.entries()].map(([nilai, label]) => ({ nilai, label })),
    kode_tingkat: kat.tingkat_hukuman.filter((t) => t.aktif !== false).map((t) => ({ nilai: String(t.kode), label: String(t.nama) })),
    kode_peran: [...new Set(kat.aturan_kewenangan.map((k) => String(k.peran_kode)))].map((k) => ({ nilai: k, label: k })),
    kaidah: opsiKaidah(),
  };
  return { opsi };
}

/** Pilihan umum (tanpa katalog peraturan tertentu) — untuk wizard. */
export async function muatOpsiUmum(): Promise<KonteksSkema> {
  const [rezim, dampak, jenisDok, status] = await Promise.all([
    sql`select kode, nama from rezim where aktif order by urutan`,
    referensi("dampak"),
    referensi("jenis_dokumen"),
    daftarStatusKasus(),
  ]);
  return {
    opsi: {
      rezim: rezim.map((r) => ({ nilai: r.kode as string, label: r.nama as string })),
      dampak: dampak.map((d) => ({ nilai: d.kode, label: d.label })),
      jenis_dokumen: jenisDok.map((d) => ({ nilai: d.kode, label: d.label })),
      status_kasus: status.map((s) => ({ nilai: s.kode, label: s.nama })),
      kaidah: opsiKaidah(),
    },
  };
}

export async function muatLibur(): Promise<string[]> {
  const rows = await sql`select tanggal from hari_libur order by tanggal`;
  return rows.map((r) => r.tanggal as string);
}

export async function muatRiwayat(regulasiId: string) {
  const rows = await sql`select id, waktu, email, aksi, tabel, record_id, ringkasan_perubahan, alasan from audit_log
    where ringkasan_perubahan->>'regulasi_id' = ${regulasiId} or (tabel = 'regulasi' and record_id = ${regulasiId})
    order by waktu desc limit 300`;
  return rows.map((r) => ({
    id: String(r.id), waktu: (r.waktu as Date).toISOString(), email: r.email as string | null, aksi: r.aksi as string,
    tabel: r.tabel as string | null, record_id: r.record_id as string | null, ringkasan: r.ringkasan_perubahan as Record<string, unknown> | null,
    alasan: r.alasan as string | null,
  }));
}
export type BarisRiwayat = Awaited<ReturnType<typeof muatRiwayat>>[number];
