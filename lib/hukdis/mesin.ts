// MESIN ATURAN GENERIK (PRD §18.5).
// Setiap fungsi menerima objek AturanLengkap — isi tabel katalog satu peraturan —
// dan tidak memuat satu pun angka, nama jenis hukuman, atau kode peraturan.
// Yang boleh ada di sini hanyalah BENTUK proses: mencari baris yang cocok,
// menghitung tanggal dari aturan, memilih yang terberat.

import { tambahBulan, tambahHariKalender, tambahHariKerja, type Kalender } from "@/lib/hari-kerja";
import { penuhiKondisi, type Konteks } from "./kondisi";
import type { Ambang, AturanLengkap, JenisHukuman, Kewenangan, Tahapan, Tenggat, Tingkat } from "./jenis";

// ---------------------------------------------------------------------------
// Bantu
// ---------------------------------------------------------------------------
export function cariTingkat(a: AturanLengkap, kode: string | null | undefined): Tingkat | null {
  return a.tingkat.find((t) => t.kode === kode) ?? null;
}

export function cariJenis(a: AturanLengkap, kode: string | null | undefined): JenisHukuman | null {
  return a.jenis.find((j) => j.kode === kode) ?? null;
}

/** Jenis yang benar-benar dijatuhkan: pengganti sementara bila masih diset. */
export function jenisEfektif(a: AturanLengkap, jenis: JenisHukuman | null): { jenis: JenisHukuman | null; diganti: boolean } {
  if (!jenis) return { jenis: null, diganti: false };
  if (jenis.pengganti_kode) {
    const p = cariJenis(a, jenis.pengganti_kode);
    if (p) return { jenis: p, diganti: true };
  }
  return { jenis, diganti: false };
}

function bobot(a: AturanLengkap, j: JenisHukuman) {
  const t = cariTingkat(a, j.tingkat_kode);
  return [t?.urutan ?? -Infinity, j.urutan] as const;
}

/** Satu pemeriksaan atas beberapa pelanggaran → hanya satu, yang terberat. */
export function pilihTerberat(a: AturanLengkap, daftar: (JenisHukuman | null)[]): JenisHukuman | null {
  let terberat: JenisHukuman | null = null;
  for (const j of daftar) {
    if (!j) continue;
    if (!terberat) { terberat = j; continue; }
    const [t1, u1] = bobot(a, j);
    const [t2, u2] = bobot(a, terberat);
    if (t1 > t2 || (t1 === t2 && u1 > u2)) terberat = j;
  }
  return terberat;
}

export function tingkatTerberat(a: AturanLengkap, kode: (string | null | undefined)[]): Tingkat | null {
  let hasil: Tingkat | null = null;
  for (const k of kode) {
    const t = cariTingkat(a, k);
    if (t && (!hasil || t.urutan > hasil.urutan)) hasil = t;
  }
  return hasil;
}

// ---------------------------------------------------------------------------
// Ambang kehadiran
// ---------------------------------------------------------------------------
export type HasilAmbang = {
  ambang: Ambang;
  tingkat: Tingkat | null;
  jenis: JenisHukuman | null;
  jenisEfektif: JenisHukuman | null;
  diganti: boolean;
};

function cocokRentang(x: Ambang, hari: number) {
  return hari >= x.hari_min && (x.hari_max === null || hari <= x.hari_max);
}

function keHasil(a: AturanLengkap, x: Ambang): HasilAmbang {
  const jenis = cariJenis(a, x.jenis_kode);
  const ef = jenisEfektif(a, jenis);
  return { ambang: x, tingkat: cariTingkat(a, x.tingkat_kode ?? jenis?.tingkat_kode), jenis, jenisEfektif: ef.jenis, diganti: ef.diganti };
}

/**
 * Mengusulkan tingkat & jenis hukuman dari jumlah hari tidak masuk kerja.
 * `hari` = akumulasi tahun berjalan; `hariBerturut` = rentetan terpanjang (opsional).
 * Bila beberapa baris cocok (mis. kumulatif dan berturut-turut), dipilih yang terberat.
 */
export function hitungAmbangKehadiran(a: AturanLengkap, hari: number, hariBerturut?: number | null): HasilAmbang | null {
  const cocok: HasilAmbang[] = [];
  for (const x of a.ambang) {
    if (x.berturut_turut) {
      if (hariBerturut !== undefined && hariBerturut !== null && cocokRentang(x, hariBerturut)) cocok.push(keHasil(a, x));
    } else if (cocokRentang(x, hari)) {
      cocok.push(keHasil(a, x));
    }
  }
  if (!cocok.length) return null;
  return cocok.reduce((best, h) => {
    const b = [best.tingkat?.urutan ?? -Infinity, best.jenis?.urutan ?? -Infinity];
    const c = [h.tingkat?.urutan ?? -Infinity, h.jenis?.urutan ?? -Infinity];
    if (c[0] > b[0] || (c[0] === b[0] && c[1] > b[1])) return h;
    if (c[0] === b[0] && c[1] === b[1] && h.ambang.alur_khusus && !best.ambang.alur_khusus) return h;
    return best;
  });
}

/** Ambang kumulatif berikutnya di atas `hari` (untuk peringatan "mendekati ambang"). */
export function ambangBerikutnya(a: AturanLengkap, hari: number): HasilAmbang | null {
  const naik = a.ambang.filter((x) => !x.berturut_turut && x.hari_min > hari).sort((p, q) => p.hari_min - q.hari_min);
  return naik.length ? keHasil(a, naik[0]) : null;
}

// ---------------------------------------------------------------------------
// Kewenangan
// ---------------------------------------------------------------------------
export type HasilKewenangan = {
  aturan: Kewenangan;
  peringatan: string[];
};

export type KewenanganKasus = {
  pemeriksa: HasilKewenangan | null;
  pembentuk_tim: HasilKewenangan | null;
  penjatuh: HasilKewenangan | null;
  bentukTim: "tidak" | "boleh" | "wajib" | null;
  peringatan: string[];
};

function pilihKewenangan(a: AturanLengkap, jenis: Kewenangan["jenis"], tingkatKode: string, konteks: Konteks): HasilKewenangan | null {
  const kandidat = a.kewenangan
    .filter((k) => k.jenis === jenis && (k.tingkat_kode === null || k.tingkat_kode === tingkatKode))
    .sort((p, q) => p.prioritas - q.prioritas);
  for (const k of kandidat) {
    if (penuhiKondisi(k.syarat_tambahan, { ...konteks, tingkat_kode: tingkatKode })) {
      const peringatan: string[] = [];
      if (typeof k.hasil?.peringatan === "string") peringatan.push(k.hasil.peringatan);
      if (k.perlu_verifikasi) peringatan.push(`Aturan kewenangan "${k.nama_peran}" belum diverifikasi terhadap naskah resmi.`);
      return { aturan: k, peringatan };
    }
  }
  return null;
}

export function tentukanKewenangan(a: AturanLengkap, tingkatKode: string, konteks: Konteks): KewenanganKasus {
  const pemeriksa = pilihKewenangan(a, "pemeriksa", tingkatKode, konteks);
  const pembentuk_tim = pilihKewenangan(a, "pembentuk_tim", tingkatKode, konteks);
  const penjatuh = pilihKewenangan(a, "penjatuh", tingkatKode, konteks);
  const bt = pemeriksa?.aturan.hasil?.bentuk_tim;
  const peringatan = [pemeriksa, pembentuk_tim, penjatuh].flatMap((x) => x?.peringatan ?? []);
  if (!penjatuh) peringatan.push("Tidak ada aturan kewenangan penjatuhan yang cocok. Lengkapi tabel kewenangan peraturan ini.");
  return {
    pemeriksa,
    pembentuk_tim,
    penjatuh,
    bentukTim: bt === "tidak" || bt === "boleh" || bt === "wajib" ? bt : null,
    peringatan,
  };
}

// ---------------------------------------------------------------------------
// Tahapan
// ---------------------------------------------------------------------------
export function susunTahapan(a: AturanLengkap, tingkatKode: string, konteks: Konteks = {}): Tahapan[] {
  const ktx = { ...konteks, tingkat_kode: tingkatKode };
  const terpilih = a.tahapan.filter(
    (t) => (t.tingkat_kode === null || t.tingkat_kode === tingkatKode) && penuhiKondisi(t.kondisi, ktx),
  );
  // Satu baris per kode tahap (baris paling spesifik = yang punya kondisi terbanyak)
  const perKode = new Map<string, Tahapan>();
  for (const t of terpilih) {
    const lama = perKode.get(t.kode_tahap);
    if (!lama || Object.keys(t.kondisi ?? {}).length > Object.keys(lama.kondisi ?? {}).length) perKode.set(t.kode_tahap, t);
  }
  return [...perKode.values()].sort((p, q) => p.urutan - q.urutan);
}

/** Tahapan untuk sebuah kasus: kewenangan dihitung lebih dulu, lalu dipakai sebagai konteks. */
export function susunTahapanKasus(a: AturanLengkap, tingkatKode: string, konteks: Konteks = {}) {
  const kewenangan = tentukanKewenangan(a, tingkatKode, konteks);
  const ktx: Konteks = { penjatuh_peran: kewenangan.penjatuh?.aturan.peran_kode ?? null, ...konteks };
  return { tahapan: susunTahapan(a, tingkatKode, ktx), kewenangan };
}

// ---------------------------------------------------------------------------
// Tenggat
// ---------------------------------------------------------------------------
export function aturanTenggatTahap(a: AturanLengkap, kodeTahap: string): Tenggat | null {
  return a.tenggat.find((t) => t.kode_tahap === kodeTahap) ?? null;
}

/** Menghitung tanggal dari satu aturan tenggat dan tanggal dasar. */
export function hitungTanggalTenggat(t: Tenggat, tanggalDasar: string, kal: Kalender): string {
  const n = t.arah === "sebelum" ? -t.jumlah : t.jumlah;
  if (t.satuan === "hari_kerja") return tambahHariKerja(tanggalDasar, n, kal, t.hitung_hari_dasar);
  if (t.satuan === "hari_kalender") return tambahHariKalender(tanggalDasar, t.hitung_hari_dasar ? n - Math.sign(n) : n);
  return tambahBulan(tanggalDasar, n);
}

export function hitungTenggat(a: AturanLengkap, kodeTahap: string, tanggalDasar: string, kal: Kalender) {
  const t = aturanTenggatTahap(a, kodeTahap);
  if (!t) return null;
  return { tanggal: hitungTanggalTenggat(t, tanggalDasar, kal), aturan: t };
}

export type TahapRingkas = { kode_tahap: string; tanggal_rencana: string | null; tanggal_realisasi: string | null };

/** Tenggat setiap tahap kasus, dihitung dari tanggal tahap acuan (dihitung_dari). */
export function hitungTenggatKasus(a: AturanLengkap, tahap: TahapRingkas[], kal: Kalender) {
  const per = new Map(tahap.map((t) => [t.kode_tahap, t]));
  const hasil = new Map<string, { tanggal: string; aturan: Tenggat; dasar: string }>();
  for (const t of tahap) {
    const aturan = aturanTenggatTahap(a, t.kode_tahap);
    if (!aturan) continue;
    const acuan = per.get(aturan.dihitung_dari);
    if (!acuan) continue;
    const dasar = aturan.acuan_tanggal === "rencana" ? acuan.tanggal_rencana ?? acuan.tanggal_realisasi : acuan.tanggal_realisasi;
    if (!dasar) continue;
    hasil.set(t.kode_tahap, { tanggal: hitungTanggalTenggat(aturan, dasar, kal), aturan, dasar });
  }
  return hasil;
}

/** Tanggal selesai hukuman = tanggal mulai berlaku + durasi jenis hukuman (bila berdurasi). */
export function hitungTanggalSelesai(mulaiBerlaku: string | null, jenis: JenisHukuman | null): string | null {
  if (!mulaiBerlaku || !jenis?.durasi_bulan) return null;
  return tambahBulan(mulaiBerlaku, jenis.durasi_bulan);
}

// ---------------------------------------------------------------------------
// Kaidah
// ---------------------------------------------------------------------------
export function kaidah<T = unknown>(a: AturanLengkap, kunci: string): T | undefined {
  return a.kaidah[kunci] as T | undefined;
}

/** Pemotongan insentif kinerja otomatis menurut kaidah `pemotongan_insentif_otomatis`. */
export function kenaPemotonganIk(a: AturanLengkap, tingkatKode: string | null | undefined): boolean {
  const v = kaidah<unknown>(a, "pemotongan_insentif_otomatis");
  if (v === true) return true;
  if (!v || typeof v !== "object") return false;
  const daftar = (v as { tingkat?: unknown }).tingkat;
  return Array.isArray(daftar) && !!tingkatKode && daftar.map(String).includes(tingkatKode);
}

/** Usulan tingkat dari pasal + dampak (aturan_pemetaan_pelanggaran). Baris khusus pasal didahulukan. */
export function usulTingkatPelanggaran(a: AturanLengkap, pasalId: string | null, dampak: string | null) {
  if (!dampak) return null;
  const khusus = a.pemetaan.find((p) => p.pasal_regulasi_id && p.pasal_regulasi_id === pasalId && p.dampak === dampak);
  const umum = a.pemetaan.find((p) => !p.pasal_regulasi_id && p.dampak === dampak);
  const p = khusus ?? umum;
  return p ? { tingkat: cariTingkat(a, p.tingkat_kode), rujukan: p.pasal_rujukan_pemetaan } : null;
}

// ---------------------------------------------------------------------------
// Validasi Tim Pemeriksa
// ---------------------------------------------------------------------------
export type AnggotaUji = { nama: string; unsur: string; jabatan_dalam_tim: string; peringkat: number | null };

export function validasiTim(a: AturanLengkap, anggota: AnggotaUji[], peringkatTerperiksa: number | null) {
  const galat: string[] = [];
  const peringatan: string[] = [];
  const syarat = kaidah<{ tidak_boleh_lebih_rendah?: boolean }>(a, "syarat_jabatan_anggota_tim");
  const komposisi = kaidah<{ unsur_wajib?: string[]; jabatan_wajib?: string[] }>(a, "komposisi_tim");
  const rujukanSyarat = a.kaidahRujukan["syarat_jabatan_anggota_tim"] ?? undefined;

  if (syarat?.tidak_boleh_lebih_rendah) {
    for (const x of anggota) {
      if (x.peringkat === null || peringkatTerperiksa === null) {
        peringatan.push(`Jenjang jabatan/pangkat ${x.nama} atau terperiksa tidak diketahui — pastikan tidak lebih rendah dari terperiksa.`);
      } else if (x.peringkat < peringkatTerperiksa) {
        galat.push(`${x.nama} berpangkat/berjabatan lebih rendah dari pegawai yang diperiksa. Anggota Tim Pemeriksa tidak boleh lebih rendah dari terperiksa${rujukanSyarat ? ` (${rujukanSyarat})` : ""}.`);
      }
    }
  }
  for (const j of komposisi?.jabatan_wajib ?? []) {
    if (!anggota.some((x) => x.jabatan_dalam_tim === j)) peringatan.push(`Tim belum memiliki ${j}.`);
  }
  for (const u of komposisi?.unsur_wajib ?? []) {
    if (!anggota.some((x) => x.unsur === u)) peringatan.push(`Tim belum memuat unsur ${u.replace(/_/g, " ")}.`);
  }
  return { galat, peringatan };
}

// ---------------------------------------------------------------------------
// Uji regresi hukum (PRD §18.9)
// ---------------------------------------------------------------------------
export type HasilFixture = { lulus: boolean; hasil: Record<string, unknown>; selisih: string[] };

export function jalankanFixture(a: AturanLengkap, masukan: Record<string, unknown>, harapan: Record<string, unknown>, kal: Kalender): HasilFixture {
  const hasil: Record<string, unknown> = {};
  const jenis = String(masukan.jenis ?? "");
  if (jenis === "kehadiran") {
    const hari = Number(masukan.hari ?? 0);
    const h = hitungAmbangKehadiran(a, masukan.berturut_turut ? 0 : hari, masukan.berturut_turut ? hari : null);
    if (!h) hasil.tidak_ada_ambang = true;
    else {
      hasil.tingkat = h.tingkat?.kode ?? null;
      hasil.jenis_kode = h.jenis?.kode ?? null;
      if (h.ambang.alur_khusus) hasil.alur_khusus = h.ambang.alur_khusus;
    }
  } else if (jenis === "tahapan") {
    hasil.tahapan = susunTahapanKasus(a, String(masukan.tingkat), (masukan.konteks as Konteks) ?? {}).tahapan.map((t) => t.kode_tahap);
  } else if (jenis === "tenggat") {
    const t = hitungTenggat(a, String(masukan.kode), String(masukan.tanggal), kal);
    hasil.tanggal = t?.tanggal ?? null;
  } else if (jenis === "jumlah_jenis") {
    hasil.jumlah = a.jenis.filter((j) => !a.jenis.some((x) => x.pengganti_kode === j.kode)).length;
  } else if (jenis === "jumlah_tingkat") {
    hasil.jumlah = a.tingkat.length;
  } else if (jenis === "pemotongan_ik") {
    hasil.pemotongan_ik = kenaPemotonganIk(a, String(masukan.tingkat));
  } else if (jenis === "kewenangan") {
    const k = tentukanKewenangan(a, String(masukan.tingkat), (masukan.konteks as Konteks) ?? {});
    hasil.penjatuh = k.penjatuh?.aturan.peran_kode ?? null;
    hasil.pembentuk_tim = k.pembentuk_tim?.aturan.peran_kode ?? null;
  } else {
    hasil.galat = `Jenis uji "${jenis}" tidak dikenal`;
  }

  const selisih: string[] = [];
  for (const [k, v] of Object.entries(harapan)) {
    if (k === "berisi") {
      const ada = (hasil.tahapan as string[]) ?? [];
      for (const kode of v as string[]) if (!ada.includes(kode)) selisih.push(`tahap ${kode} seharusnya ada`);
    } else if (k === "tidak_berisi") {
      const ada = (hasil.tahapan as string[]) ?? [];
      for (const kode of v as string[]) if (ada.includes(kode)) selisih.push(`tahap ${kode} seharusnya tidak ada`);
    } else if (JSON.stringify(hasil[k] ?? null) !== JSON.stringify(v)) {
      selisih.push(`${k}: diharapkan ${JSON.stringify(v)}, hasil ${JSON.stringify(hasil[k] ?? null)}`);
    }
  }
  return { lulus: selisih.length === 0, hasil, selisih };
}
