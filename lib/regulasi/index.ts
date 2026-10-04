// Satu-satunya pintu masuk ke tabel `regulasi` dan katalog aturannya (PRD §18.5).
// Tidak ada bagian lain aplikasi yang boleh menyebut kode peraturan secara langsung.

import { sql, type Sql } from "@/lib/db";
import { buatKalender, type Kalender } from "@/lib/hari-kerja";
import type { AturanLengkap, RingkasRegulasi } from "@/lib/hukdis/jenis";
import { kunciPasal } from "./definisi";

export type Regulasi = RingkasRegulasi & {
  id: string;
  jenis: string;
  judul: string;
  utama: boolean;
  status: string;
  katalog_pasal_lengkap: boolean;
  peringatan: string | null;
  perlu_verifikasi: boolean;
};

export type HasilResolusi =
  | { status: "tunggal"; regulasi: Regulasi; kandidat: Regulasi[] }
  | { status: "ganda" | "tidak_ada"; regulasi: null; kandidat: Regulasi[]; pesan: string };

/** Fungsi murni: memilih peraturan utama yang berlaku untuk rezim pada tanggal tertentu. */
export function pilihRegulasi(daftar: Regulasi[], rezim: string, tanggal: string): HasilResolusi {
  const semuaRezim = daftar.filter((r) => r.utama && r.status !== "draf" && r.rezim_kode === rezim);
  const cocok = semuaRezim.filter(
    (r) => (!r.berlaku_dari || r.berlaku_dari <= tanggal) && (!r.berlaku_sampai || tanggal < r.berlaku_sampai),
  );
  if (cocok.length === 1) return { status: "tunggal", regulasi: cocok[0], kandidat: cocok };
  if (cocok.length > 1) {
    return { status: "ganda", regulasi: null, kandidat: cocok, pesan: `Ada ${cocok.length} peraturan yang sama-sama berlaku pada ${tanggal}. Pilih salah satu secara manual.` };
  }
  return { status: "tidak_ada", regulasi: null, kandidat: semuaRezim, pesan: `Tidak ada peraturan disiplin yang tercatat berlaku pada ${tanggal} untuk rezim ini. Pilih peraturan secara manual.` };
}

export async function daftarRegulasi(db: Sql = sql): Promise<Regulasi[]> {
  return (await db`select id, kode, jenis, judul, nama_singkat, nama_lengkap, rezim_kode, utama, status, berlaku_dari, berlaku_sampai,
      katalog_pasal_lengkap, peringatan, perlu_verifikasi
    from regulasi order by rezim_kode nulls last, berlaku_dari nulls first`) as unknown as Regulasi[];
}

export async function resolveRegulasi(rezim: string, tanggalPeristiwa: string, db: Sql = sql) {
  return pilihRegulasi(await daftarRegulasi(db), rezim, tanggalPeristiwa);
}

export async function ambilRegulasi(id: string, db: Sql = sql): Promise<Regulasi | null> {
  const [r] = await db`select id, kode, jenis, judul, nama_singkat, nama_lengkap, rezim_kode, utama, status, berlaku_dari, berlaku_sampai,
      katalog_pasal_lengkap, peringatan, perlu_verifikasi from regulasi where id = ${id}`;
  return (r as unknown as Regulasi) ?? null;
}

/** Salinan beku identitas peraturan untuk disimpan di entri (PRD §18.3). */
export function snapshotRegulasi(r: Regulasi) {
  return { id: r.id, kode: r.kode, nama_singkat: r.nama_singkat, nama_lengkap: r.nama_lengkap ?? r.judul, berlaku_dari: r.berlaku_dari, berlaku_sampai: r.berlaku_sampai };
}

/** Memuat seluruh katalog aturan aktif sebuah peraturan menjadi AturanLengkap. */
export async function muatAturan(regulasiId: string, db: Sql = sql): Promise<AturanLengkap> {
  const [r] = await db`select id, kode, nama_singkat, nama_lengkap, rezim_kode, berlaku_dari, berlaku_sampai from regulasi where id = ${regulasiId}`;
  if (!r) throw new Error("Peraturan tidak ditemukan");
  const [tingkat, jenis, ambang, tenggat, kewenangan, tahapan, pemetaan, kaidah] = await Promise.all([
    db`select id, kode, nama, urutan from tingkat_hukuman where regulasi_id = ${regulasiId} and aktif order by urutan`,
    db`select j.id, j.kode, j.nama, t.kode as tingkat_kode, j.urutan, j.durasi_bulan, p.kode as pengganti_kode, j.peringatan, j.catatan,
          j.pasal_rujukan, j.blokir_kgb, j.blokir_kenaikan_pangkat
        from jenis_hukuman j join tingkat_hukuman t on t.id = j.tingkat_hukuman_id
        left join jenis_hukuman p on p.id = j.pengganti_sementara_id
        where j.regulasi_id = ${regulasiId} and j.aktif order by t.urutan, j.urutan`,
    db`select a.id, a.hari_min, a.hari_max, a.berturut_turut, t.kode as tingkat_kode, j.kode as jenis_kode, a.pasal_rujukan,
          a.akibat_tambahan, a.alur_khusus, a.perlu_verifikasi
        from ambang_kehadiran a left join tingkat_hukuman t on t.id = a.tingkat_hukuman_id left join jenis_hukuman j on j.id = a.jenis_hukuman_id
        where a.regulasi_id = ${regulasiId} and a.aktif order by a.berturut_turut, a.hari_min`,
    db`select id, kode, nama_tenggat, kode_tahap, dihitung_dari, acuan_tanggal, arah, jumlah, satuan, hitung_hari_dasar, sifat, pasal_rujukan, catatan
        from aturan_tenggat where regulasi_id = ${regulasiId} and aktif`,
    db`select k.id, t.kode as tingkat_kode, k.jenis, k.peran_kode, k.nama_peran, k.lingkup, k.syarat_tambahan, k.hasil, k.prioritas,
          k.pasal_rujukan, k.catatan, k.perlu_verifikasi
        from aturan_kewenangan k left join tingkat_hukuman t on t.id = k.tingkat_hukuman_id
        where k.regulasi_id = ${regulasiId} and k.aktif order by k.prioritas`,
    db`select a.id, t.kode as tingkat_kode, a.kode_tahap, a.nama, a.urutan, a.opsional, a.kondisi, a.status_kasus, a.pasal_rujukan, a.bantuan, a.jenis_dokumen
        from aturan_tahapan a left join tingkat_hukuman t on t.id = a.tingkat_hukuman_id
        where a.regulasi_id = ${regulasiId} and a.aktif order by a.urutan`,
    db`select m.id, m.pasal_regulasi_id, p.pasal, p.ayat, p.huruf, p.angka, m.dampak, t.kode as tingkat_kode, m.pasal_rujukan_pemetaan
        from aturan_pemetaan_pelanggaran m join tingkat_hukuman t on t.id = m.tingkat_hukuman_id
        left join pasal_regulasi p on p.id = m.pasal_regulasi_id
        where m.regulasi_id = ${regulasiId} and m.aktif`,
    db`select kunci, nilai, pasal_rujukan from aturan_kaidah where regulasi_id = ${regulasiId}`,
  ]);
  return {
    regulasi: r as unknown as RingkasRegulasi,
    tingkat: tingkat as never,
    jenis: jenis as never,
    ambang: ambang as never,
    tenggat: tenggat as never,
    kewenangan: kewenangan as never,
    tahapan: tahapan as never,
    pemetaan: pemetaan.map((m) => ({
      id: m.id, pasal_regulasi_id: m.pasal_regulasi_id, pasal_kunci: m.pasal ? kunciPasal(m as never) : null, dampak: m.dampak,
      tingkat_kode: m.tingkat_kode, pasal_rujukan_pemetaan: m.pasal_rujukan_pemetaan,
    })),
    kaidah: Object.fromEntries(kaidah.map((k) => [k.kunci, k.nilai])),
    kaidahRujukan: Object.fromEntries(kaidah.map((k) => [k.kunci, k.pasal_rujukan])),
  };
}

export async function muatKalender(db: Sql = sql): Promise<Kalender> {
  const rows = await db`select tanggal from hari_libur`;
  return buatKalender(rows.map((r) => r.tanggal as string));
}
