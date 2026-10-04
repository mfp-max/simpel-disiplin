import { kunciPasal, PRIORITAS_BAWAAN, type DefinisiRegulasi } from "@/lib/regulasi/definisi";
import type { AturanLengkap } from "./jenis";

/**
 * Mengubah berkas definisi peraturan menjadi AturanLengkap di memori —
 * dipakai wizard "Uji dengan kasus contoh" sebelum disimpan, dan uji unit.
 */
export function aturanDariDefinisi(def: DefinisiRegulasi): AturanLengkap {
  const r = def.regulasi;
  return {
    regulasi: {
      kode: r.kode, nama_singkat: r.nama_singkat, nama_lengkap: r.nama_lengkap ?? null, rezim_kode: r.rezim_kode ?? null,
      berlaku_dari: r.berlaku_dari ?? null, berlaku_sampai: r.berlaku_sampai ?? null,
    },
    tingkat: (def.tingkat ?? []).map((t) => ({ kode: t.kode, nama: t.nama, urutan: t.urutan })),
    jenis: (def.jenis_hukuman ?? []).filter((j) => j.aktif !== false).map((j) => ({
      kode: j.kode, nama: j.nama, tingkat_kode: j.tingkat, urutan: j.urutan ?? 0, durasi_bulan: j.durasi_bulan ?? null,
      pengganti_kode: j.pengganti_sementara ?? null, peringatan: j.peringatan ?? null, catatan: j.catatan ?? null,
      pasal_rujukan: j.pasal_rujukan ?? null, blokir_kgb: j.blokir_kgb ?? false, blokir_kenaikan_pangkat: j.blokir_kenaikan_pangkat ?? false,
    })),
    ambang: (def.ambang ?? []).map((x) => ({
      hari_min: x.hari_min, hari_max: x.hari_max ?? null, berturut_turut: x.berturut_turut ?? false, tingkat_kode: x.tingkat ?? null,
      jenis_kode: x.jenis ?? null, pasal_rujukan: x.pasal_rujukan ?? null, akibat_tambahan: x.akibat_tambahan ?? null,
      alur_khusus: x.alur_khusus ?? null, perlu_verifikasi: x.perlu_verifikasi ?? false,
    })),
    tenggat: (def.tenggat ?? []).map((t) => ({
      kode: t.kode, nama_tenggat: t.nama_tenggat, kode_tahap: t.kode_tahap, dihitung_dari: t.dihitung_dari,
      acuan_tanggal: t.acuan_tanggal ?? "realisasi", arah: t.arah, jumlah: t.jumlah, satuan: t.satuan,
      hitung_hari_dasar: t.hitung_hari_dasar ?? false, sifat: t.sifat ?? "wajib_hukum", pasal_rujukan: t.pasal_rujukan ?? null, catatan: t.catatan ?? null,
    })),
    kewenangan: (def.kewenangan ?? []).map((k) => ({
      tingkat_kode: k.tingkat ?? null, jenis: k.jenis, peran_kode: k.peran_kode, nama_peran: k.nama_peran, lingkup: k.lingkup ?? null,
      syarat_tambahan: k.syarat_tambahan ?? {}, hasil: k.hasil ?? {}, prioritas: k.prioritas ?? PRIORITAS_BAWAAN,
      pasal_rujukan: k.pasal_rujukan ?? null, catatan: k.catatan ?? null, perlu_verifikasi: k.perlu_verifikasi ?? false,
    })),
    tahapan: (def.tahapan ?? []).map((t) => ({
      tingkat_kode: t.tingkat ?? null, kode_tahap: t.kode_tahap, nama: t.nama, urutan: t.urutan, opsional: t.opsional ?? false,
      kondisi: t.kondisi ?? {}, status_kasus: t.status_kasus ?? null, pasal_rujukan: t.pasal_rujukan ?? null, bantuan: t.bantuan ?? null,
      jenis_dokumen: t.jenis_dokumen ?? [],
    })),
    pemetaan: (def.pemetaan ?? []).map((p) => ({
      pasal_regulasi_id: null, pasal_kunci: p.pasal ?? null, dampak: p.dampak, tingkat_kode: p.tingkat, pasal_rujukan_pemetaan: p.pasal_rujukan_pemetaan ?? null,
    })),
    kaidah: Object.fromEntries((def.kaidah ?? []).map((k) => [k.kunci, k.nilai])),
    kaidahRujukan: Object.fromEntries((def.kaidah ?? []).map((k) => [k.kunci, k.pasal_rujukan ?? null])),
  };
}

export { kunciPasal };
