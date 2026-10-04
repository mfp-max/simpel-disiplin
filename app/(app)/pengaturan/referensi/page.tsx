import { JudulHalaman, Catatan } from "@/components/simpel/dasar";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { labelKode } from "@/lib/format";
import { DaftarReferensi, type BarisReferensi } from "./referensi_klien";

export const metadata = { title: "Kode referensi" };

const KATEGORI: Record<string, { label: string; ket: string }> = {
  sumber_informasi: { label: "Sumber informasi", ket: "Asal informasi dugaan pelanggaran (surat, laporan lisan, temuan SPI, …)." },
  dampak: { label: "Dampak perbuatan", ket: "Lingkup dampak pelanggaran: unit kerja, instansi, atau negara." },
  kategori_berkas: { label: "Kategori berkas", ket: "Pengelompokan berkas yang diunggah." },
  jenis_dokumen: { label: "Jenis dokumen", ket: "Jenis surat/dokumen yang dibuat dari template." },
  jenis_non_hukdis: { label: "Jenis pembinaan", ket: "Jenis entri pembinaan (non-hukuman disiplin)." },
  alasan_penghentian: { label: "Alasan penghentian", ket: "Alasan kasus dihentikan." },
  kelengkapan_berkas: { label: "Kelengkapan berkas", ket: "Penanda kelengkapan berkas arsip lampau." },
  unsur_tim: { label: "Unsur tim pemeriksa", ket: "Asal anggota tim pemeriksa." },
  jabatan_dalam_tim: { label: "Jabatan dalam tim", ket: "Ketua, sekretaris, anggota." },
  jenis_tim: { label: "Jenis tim pemeriksa", ket: "Atasan langsung, tim unit kerja, tim UM." },
  jenis_upaya: { label: "Jenis upaya administratif", ket: "Keberatan atau banding administratif." },
  hasil_upaya: { label: "Hasil upaya administratif", ket: "Dikuatkan, diperingan, diperberat, dibatalkan." },
  moda_pemeriksaan: { label: "Moda pemeriksaan", ket: "Tatap muka atau virtual." },
  jenis_unit: { label: "Jenis unit kerja", ket: "Fakultas, direktorat, lembaga, UPT, …" },
};

export default async function HalamanReferensi({ searchParams }: { searchParams: Promise<{ kategori?: string }> }) {
  await wajibHalamanHak("kelola_pengaturan");
  const sp = await searchParams;
  const rekap = await sql`select kategori, count(*)::int as n, count(*) filter (where aktif)::int as aktif from kode_referensi group by 1`;
  const semua = [...new Set([...Object.keys(KATEGORI), ...rekap.map((r) => r.kategori as string)])];
  const kategori = sp.kategori && semua.includes(sp.kategori) ? sp.kategori : semua[0];
  const rows = await sql`select kode, label, urutan, aktif, keterangan from kode_referensi where kategori = ${kategori} order by urutan, label`;
  const jumlah = new Map(rekap.map((r) => [r.kategori as string, r.n as number]));

  return (
    <>
      <JudulHalaman judul="Kode referensi" deskripsi="Pilihan isian yang muncul di formulir SIMPEL. Kode tidak dapat diubah setelah dibuat; label, urutan, dan status aktif boleh diubah." kembali={{ href: "/pengaturan", label: "Pengaturan" }} />
      <div className="mb-5">
        <Catatan jenis="info">Pilihan yang sudah tidak dipakai cukup <strong>dinonaktifkan</strong> — data lama yang memakainya tetap terbaca dengan labelnya.</Catatan>
      </div>
      <DaftarReferensi
        kategori={kategori}
        daftarKategori={semua.map((k) => ({ kode: k, label: KATEGORI[k]?.label ?? labelKode(k), ket: KATEGORI[k]?.ket ?? "", n: jumlah.get(k) ?? 0 }))}
        baris={rows as unknown as BarisReferensi[]}
      />
    </>
  );
}
