import { Catatan, JudulHalaman } from "@/components/simpel/dasar";
import { wajibHalamanHak } from "@/lib/auth";
import { SKENARIO, daftarSimulasi } from "@/lib/simulasi";
import { PanelSimulasi, type BarisSkenario } from "./simulasi_klien";

export const metadata = { title: "Data simulasi" };
// Satu skenario (puluhan dokumen & berkas) bisa memakan beberapa puluh detik.
export const maxDuration = 300;

const HREF: Record<string, string> = { hukdis: "/kasus", informasi: "/informasi", non_hukdis: "/pembinaan", arsip: "/arsip" };

export default async function HalamanSimulasi() {
  await wajibHalamanHak("kelola_pengaturan");
  const ada = await daftarSimulasi();
  const baris: BarisSkenario[] = SKENARIO.map((s) => ({
    kode: s.kode,
    kelompok: s.kelompok,
    judul: s.judul,
    ringkas: s.ringkas,
    entri: ada
      .filter((e) => e.kode === s.kode)
      .sort((a, b) => Number(b.kelas === "hukdis") - Number(a.kelas === "hukdis"))
      .map((e) => ({ href: `${HREF[e.kelas] ?? "/kasus"}/${e.id}`, nomor: e.nomor_registrasi, status: e.status, dokumen: e.dokumen, berkas: e.berkas })),
  }));

  return (
    <>
      <JudulHalaman
        judul="Data simulasi"
        deskripsi="Kasus contoh lengkap dengan dokumen dari template dan berkas pendukung, untuk pelatihan dan uji coba alur. Dibuat lewat fungsi yang sama dengan tombol-tombol di aplikasi dan tercatat di log audit."
        kembali={{ href: "/pengaturan", label: "Pengaturan" }}
      />
      <div className="mb-6">
        <Catatan jenis="waspada" judul="Hanya untuk latihan">
          Data simulasi memakai pegawai dari master pegawai dan ikut terhitung di Beranda serta Laporan. Sebelum SIMPEL dipakai untuk kasus sungguhan,
          tekan <strong>Arsipkan semua data simulasi</strong> (data tidak dihapus permanen, hanya disembunyikan dari daftar dan statistik).
        </Catatan>
      </div>
      <PanelSimulasi baris={baris} />
    </>
  );
}
