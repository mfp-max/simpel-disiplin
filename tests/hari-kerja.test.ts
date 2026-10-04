import { describe, expect, it } from "vitest";
import { buatKalender, isHariKerja, selisihHariKerja, tambahBulan, tambahHariKerja } from "@/lib/hari-kerja";
import { HARI_LIBUR } from "@/supabase/seed/referensi";

const kal = buatKalender(HARI_LIBUR.map((h) => h.tanggal));
const kosong = buatKalender([]);

describe("kalkulator hari kerja", () => {
  it("melewati akhir pekan", () => {
    // Jumat 9 Okt 2026 + 1 hari kerja = Senin 12 Okt 2026
    expect(tambahHariKerja("2026-10-09", 1, kosong)).toBe("2026-10-12");
    expect(isHariKerja("2026-10-10", kosong)).toBe(false);
  });

  it("melewati libur nasional", () => {
    // Jumat 14 Agustus 2026 + 1 hari kerja: Senin 17 Agustus libur → Selasa 18 Agustus
    expect(tambahHariKerja("2026-08-14", 1, kal)).toBe("2026-08-18");
  });

  it("melewati cuti bersama", () => {
    // Rabu 23 Des 2026 + 1: Kamis 24 cuti bersama, Jumat 25 Natal → Senin 28 Des
    expect(tambahHariKerja("2026-12-23", 1, kal)).toBe("2026-12-28");
  });

  it("melewati pergantian tahun", () => {
    // Kamis 31 Des 2026 + 1: Jumat 1 Jan 2027 libur → Senin 4 Jan 2027
    expect(tambahHariKerja("2026-12-31", 1, kal)).toBe("2027-01-04");
    expect(tambahHariKerja("2027-01-04", -1, kal)).toBe("2026-12-31");
  });

  it("menghitung mundur (tenggat 'sebelum')", () => {
    // 7 hari kerja sebelum Senin 19 Okt 2026 = Jumat 8 Okt 2026
    expect(tambahHariKerja("2026-10-19", -7, kal)).toBe("2026-10-08");
  });

  it("kriteria 9: SK 10 Juli, diterima 14 Juli → berlaku hari kerja ke-15", () => {
    expect(tambahHariKerja("2026-07-14", 15, kal)).toBe("2026-08-04");
    expect(selisihHariKerja("2026-07-14", "2026-08-04", kal)).toBe(15);
  });

  it("hari dasar ikut dihitung bila diminta", () => {
    expect(tambahHariKerja("2026-07-14", 15, kal, true)).toBe("2026-08-03");
  });

  it("menambah bulan dengan penyesuaian akhir bulan", () => {
    expect(tambahBulan("2026-01-31", 1)).toBe("2026-02-28");
    expect(tambahBulan("2026-08-04", 12)).toBe("2027-08-04");
  });
});
