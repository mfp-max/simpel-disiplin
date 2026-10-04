// Penilai kondisi generik untuk kolom jsonb `kondisi` (aturan_tahapan) dan
// `syarat_tambahan` (aturan_kewenangan).
//
// Bentuk kondisi: { "<kunci>": nilai, "<kunci>_in": [daftar] }
//   - "<kunci>": nilai   → konteks[kunci] harus sama dengan nilai
//   - "<kunci>_in": [..] → konteks[kunci] harus salah satu anggota daftar
// Kunci yang tidak dikenal konteks dianggap TIDAK terpenuhi, kecuali nilai
// yang diminta adalah false (mis. { terperiksa_pimpinan_unit: false }).
// Penilai ini tidak tahu apa pun tentang hukum — kosakata kuncinya ditentukan
// oleh konteks yang dirakit aplikasi (lihat KONTEKS_TERSEDIA).

export type Konteks = Record<string, string | number | boolean | null | undefined>;

export const KONTEKS_TERSEDIA: Record<string, string> = {
  tingkat_kode: "Kode tingkat hukuman (mis. ringan/sedang/berat)",
  penjatuh_peran: "Kode peran pejabat penjatuh hasil mesin kewenangan",
  terperiksa_pimpinan_unit: "Terperiksa memangku jabatan pimpinan unit/Wakil Rektor (ya/tidak)",
  unit_punya_delegasi: "Pimpinan unit kerja terperiksa menerima delegasi hukuman ringan (ya/tidak)",
  status_pegawai: "Status pegawai dari Simpega (mis. PNS, PTNA)",
  kelompok_jabatan: "Kelompok jabatan dari Simpega (mis. Dosen, Tendik)",
  rezim_kode: "Kode rezim pegawai",
};

export function penuhiKondisi(kondisi: Record<string, unknown> | null | undefined, konteks: Konteks): boolean {
  if (!kondisi) return true;
  for (const [kunci, diminta] of Object.entries(kondisi)) {
    if (kunci.endsWith("_in")) {
      const k = kunci.slice(0, -"_in".length);
      const nilai = konteks[k];
      if (!Array.isArray(diminta)) return false;
      if (nilai === undefined || nilai === null) return false;
      if (!diminta.map(String).includes(String(nilai))) return false;
    } else {
      const nilai = konteks[kunci];
      if (diminta === false && (nilai === undefined || nilai === null || nilai === false)) continue;
      if (nilai === undefined || nilai === null) return false;
      if (String(nilai) !== String(diminta)) return false;
    }
  }
  return true;
}

export function uraikanKondisi(kondisi: Record<string, unknown> | null | undefined): string {
  if (!kondisi || !Object.keys(kondisi).length) return "selalu";
  return Object.entries(kondisi)
    .map(([k, v]) => {
      const nama = k.endsWith("_in") ? k.slice(0, -"_in".length) : k;
      const label = KONTEKS_TERSEDIA[nama] ?? nama;
      if (Array.isArray(v)) return `${label}: ${v.join(" / ")}`;
      if (typeof v === "boolean") return `${label}: ${v ? "ya" : "tidak"}`;
      return `${label}: ${String(v)}`;
    })
    .join("; ");
}
