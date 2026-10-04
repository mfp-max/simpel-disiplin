import { describe, expect, it } from "vitest";
import { buatKalender } from "@/lib/hari-kerja";
import { aturanDariDefinisi } from "@/lib/hukdis/dari-definisi";
import { hitungAmbangKehadiran, jalankanFixture, jenisEfektif, kenaPemotonganIk, pilihTerberat, susunTahapan, tentukanKewenangan, validasiTim } from "@/lib/hukdis/mesin";
import { pilihRegulasi, type Regulasi } from "@/lib/regulasi";
import { DEFINISI_AWAL } from "@/supabase/seed/regulasi";
import { HARI_LIBUR } from "@/supabase/seed/referensi";
import { FORMAT_DEFINISI, type DefinisiRegulasi } from "@/lib/regulasi/definisi";

const kal = buatKalender(HARI_LIBUR.map((h) => h.tanggal));
const def = (kode: string) => DEFINISI_AWAL.find((d) => d.regulasi.kode === kode)!;
const aturan = (kode: string) => aturanDariDefinisi(def(kode));

describe("uji regresi hukum — seluruh fixture data awal", () => {
  for (const d of DEFINISI_AWAL) {
    for (const f of d.fixture ?? []) {
      it(`${d.regulasi.kode}: ${f.nama}`, () => {
        const h = jalankanFixture(aturanDariDefinisi(d), f.masukan, f.harapan, kal);
        expect(h.selisih).toEqual([]);
      });
    }
  }
});

describe("ambang kehadiran", () => {
  it("kriteria 6: 15 hari → hukuman sedang jenis ke-2, dengan rujukan pasal", () => {
    const a = aturan("PP_94_2021");
    const h = hitungAmbangKehadiran(a, 15)!;
    expect(h.tingkat?.kode).toBe("sedang");
    const sedang = a.jenis.filter((j) => j.tingkat_kode === "sedang" && !a.jenis.some((x) => x.pengganti_kode === j.kode));
    expect(sedang.indexOf(h.jenis!)).toBe(1);
    expect(h.ambang.pasal_rujukan).toBeTruthy();
  });

  it("jenis yang belum berlaku diganti pengganti sementara", () => {
    const a = aturan("PP_94_2021");
    const h = hitungAmbangKehadiran(a, 12)!;
    expect(h.diganti).toBe(true);
    expect(h.jenisEfektif?.kode).not.toBe(h.jenis?.kode);
  });

  it("berturut-turut lebih berat daripada kumulatif", () => {
    const h = hitungAmbangKehadiran(aturan("PERTOR_70_2026"), 10, 10)!;
    expect(h.ambang.alur_khusus).toBe("penghentian_gaji");
  });

  it("kriteria 19: ambang berbeda antar generasi peraturan", () => {
    expect(hitungAmbangKehadiran(aturan("PP_53_2010"), 3)).toBeNull();
    expect(hitungAmbangKehadiran(aturan("PP_94_2021"), 3)?.tingkat?.kode).toBe("ringan");
  });
});

describe("kewenangan", () => {
  it("rezim A berat: penjatuh Menteri dan usul ke Menteri", () => {
    const k = tentukanKewenangan(aturan("PP_94_2021"), "berat", {});
    expect(k.penjatuh?.aturan.peran_kode).toBe("menteri");
    expect(k.pembentuk_tim?.aturan.peran_kode).toBe("rektor");
    expect(k.bentukTim).toBe("wajib");
  });

  it("rezim A ringan: tidak membentuk Tim", () => {
    expect(tentukanKewenangan(aturan("PP_94_2021"), "ringan", {}).bentukTim).toBe("tidak");
  });

  it("rezim B ringan: unit tanpa delegasi → naik ke Rektor dengan peringatan", () => {
    const k = tentukanKewenangan(aturan("PERTOR_70_2026"), "ringan", { unit_punya_delegasi: false });
    expect(k.penjatuh?.aturan.peran_kode).toBe("rektor");
    expect(k.peringatan.join(" ")).toMatch(/belum menerima delegasi/);
  });

  it("rezim B ringan: unit berdelegasi → pimpinan unit kerja", () => {
    const k = tentukanKewenangan(aturan("PERTOR_70_2026"), "ringan", { unit_punya_delegasi: true });
    expect(k.penjatuh?.aturan.peran_kode).toBe("pimpinan_unit_kerja");
  });

  it("rezim B: pimpinan unit diperiksa → Rektor", () => {
    const k = tentukanKewenangan(aturan("PERTOR_70_2026"), "ringan", { unit_punya_delegasi: true, terperiksa_pimpinan_unit: true });
    expect(k.penjatuh?.aturan.peran_kode).toBe("rektor");
  });
});

describe("tahapan", () => {
  it("kriteria 7: ASN berat memuat pembentukan Tim oleh Rektor dan lapor Sekjen", () => {
    const kode = susunTahapan(aturan("PP_94_2021"), "berat", { penjatuh_peran: "menteri" }).map((t) => t.kode_tahap);
    expect(kode).toContain("pembentukan_tim");
    expect(kode).toContain("lapor_sekjen");
    expect(kode).toContain("usul_menteri");
    expect(new Set(kode).size).toBe(kode.length);
  });

  it("usul Menteri hanya muncul bila penjatuhnya Menteri", () => {
    const kode = susunTahapan(aturan("PP_94_2021"), "berat", { penjatuh_peran: "rektor" }).map((t) => t.kode_tahap);
    expect(kode).not.toContain("usul_menteri");
  });

  it("kriteria 5: Pertor sedang/berat otomatis pemotongan insentif kinerja", () => {
    expect(kenaPemotonganIk(aturan("PERTOR_70_2026"), "sedang")).toBe(true);
    expect(kenaPemotonganIk(aturan("PERTOR_70_2026"), "ringan")).toBe(false);
    expect(kenaPemotonganIk(aturan("PP_94_2021"), "berat")).toBe(false);
  });
});

describe("kaidah umum", () => {
  it("beberapa pelanggaran → satu hukuman terberat", () => {
    const a = aturan("PP_94_2021");
    const j = (k: string) => a.jenis.find((x) => x.kode === k)!;
    expect(pilihTerberat(a, [j("teguran_lisan"), j("turun_jabatan"), j("tukin_25_6")])?.kode).toBe("turun_jabatan");
  });

  it("kriteria 8: anggota tim lebih rendah ditolak dengan dasar aturan", () => {
    const v = validasiTim(aturan("PP_94_2021"), [{ nama: "Ani", unsur: "pengawasan", jabatan_dalam_tim: "anggota", peringkat: 9 }], 11);
    expect(v.galat[0]).toMatch(/tidak boleh lebih rendah/);
    expect(v.galat[0]).toMatch(/PerBKN/);
  });

  it("jenis tanpa pengganti tetap dirinya sendiri", () => {
    const a = aturan("PERTOR_70_2026");
    expect(jenisEfektif(a, a.jenis[0]).diganti).toBe(false);
  });
});

describe("kriteria 17: peraturan fiktif 4 tingkat, 12 jenis — tanpa ubah kode", () => {
  const fiktif: DefinisiRegulasi = {
    format: FORMAT_DEFINISI,
    regulasi: { kode: "PP_99_2030", jenis: "Peraturan Pemerintah", judul: "Disiplin Fiktif", nama_singkat: "PP 99/2030", rezim_kode: "A", utama: true, status: "aktif", berlaku_dari: "2030-01-01" },
    tingkat: [
      { kode: "t1", nama: "sangat ringan", urutan: 1 }, { kode: "t2", nama: "ringan", urutan: 2 },
      { kode: "t3", nama: "sedang", urutan: 3 }, { kode: "t4", nama: "berat", urutan: 4 },
    ],
    jenis_hukuman: Array.from({ length: 12 }, (_, i) => ({ kode: `j${i + 1}`, tingkat: `t${Math.floor(i / 3) + 1}`, nama: `jenis ${i + 1}`, urutan: i + 1 })),
    ambang: Array.from({ length: 12 }, (_, i) => ({ hari_min: i * 2 + 2, hari_max: i === 11 ? null : i * 2 + 3, jenis: `j${i + 1}`, tingkat: `t${Math.floor(i / 3) + 1}` })),
    tenggat: [{ kode: "panggilan_1", nama_tenggat: "Panggilan", kode_tahap: "panggilan_1", dihitung_dari: "pemeriksaan", acuan_tanggal: "rencana", arah: "sebelum", jumlah: 10, satuan: "hari_kerja" }],
    kewenangan: [{ jenis: "penjatuh", peran_kode: "dekan", nama_peran: "Dekan", tingkat: "t1" }, { jenis: "penjatuh", peran_kode: "rektor", nama_peran: "Rektor" , prioritas: 200 }],
    tahapan: [{ kode_tahap: "panggilan_1", nama: "Panggilan", urutan: 1 }, { kode_tahap: "pemeriksaan", nama: "Pemeriksaan", urutan: 2 }],
  };
  const a = aturanDariDefinisi(fiktif);

  it("menghasilkan tingkat ke-4 dan jenis ke-12", () => {
    const h = hitungAmbangKehadiran(a, 40)!;
    expect(h.tingkat?.kode).toBe("t4");
    expect(h.jenis?.kode).toBe("j12");
  });

  it("tenggat panggilan 10 hari kerja", () => {
    const h = jalankanFixture(a, { jenis: "tenggat", kode: "panggilan_1", tanggal: "2030-01-21" }, { tanggal: "2030-01-07" }, buatKalender([]));
    expect(h.selisih).toEqual([]);
  });

  it("matriks kewenangan sendiri", () => {
    expect(tentukanKewenangan(a, "t1", {}).penjatuh?.aturan.peran_kode).toBe("dekan");
    expect(tentukanKewenangan(a, "t3", {}).penjatuh?.aturan.peran_kode).toBe("rektor");
  });
});

describe("kriteria 19: resolver berbasis tanggal", () => {
  const daftar = DEFINISI_AWAL.map((d, i) => ({
    id: String(i), kode: d.regulasi.kode, jenis: d.regulasi.jenis, judul: d.regulasi.judul, nama_singkat: d.regulasi.nama_singkat,
    nama_lengkap: d.regulasi.nama_lengkap ?? null, rezim_kode: d.regulasi.rezim_kode ?? null, utama: d.regulasi.utama ?? false,
    status: d.regulasi.status ?? "aktif", berlaku_dari: d.regulasi.berlaku_dari ?? null, berlaku_sampai: d.regulasi.berlaku_sampai ?? null,
    katalog_pasal_lengkap: true, peringatan: null, perlu_verifikasi: false,
  })) as Regulasi[];

  it("12 Mei 2015 → PP 53/2010", () => {
    expect(pilihRegulasi(daftar, "A", "2015-05-12").regulasi?.kode).toBe("PP_53_2010");
  });
  it("12 Mei 2024 → PP 94/2021", () => {
    expect(pilihRegulasi(daftar, "A", "2024-05-12").regulasi?.kode).toBe("PP_94_2021");
  });
  it("1995 → PP 30/1980", () => {
    expect(pilihRegulasi(daftar, "A", "1995-03-01").regulasi?.kode).toBe("PP_30_1980");
  });
  it("rezim B 2026 → Pertor 70/2026; sebelum berlaku → pilih manual", () => {
    expect(pilihRegulasi(daftar, "B", "2026-09-01").regulasi?.kode).toBe("PERTOR_70_2026");
    expect(pilihRegulasi(daftar, "B", "2026-01-01").status).toBe("tidak_ada");
  });
  it("hari pergantian PP 53 → PP 94 tidak ganda", () => {
    expect(pilihRegulasi(daftar, "A", "2021-08-31").regulasi?.kode).toBe("PP_94_2021");
  });
});
