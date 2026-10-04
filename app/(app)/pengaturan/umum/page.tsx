import { JudulHalaman } from "@/components/simpel/dasar";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { waktuPendek } from "@/lib/format";
import { FormPengaturan, type BarisPengaturan } from "./umum_klien";

export const metadata = { title: "Pengaturan umum" };

const KELOMPOK: Record<string, { judul: string; deskripsi: string }> = {
  instansi: { judul: "Identitas instansi", deskripsi: "Dipakai di kop dan badan surat yang dibuat SIMPEL." },
  pejabat: { judul: "Pejabat", deskripsi: "Nama dan NIP Rektor untuk dokumen yang ditandatangani Rektor. Perbarui saat pergantian pejabat." },
  sistem: { judul: "Sistem", deskripsi: "Perilaku aplikasi: peringatan tenggat, sesi, retensi rekaman, simpan otomatis." },
  integrasi: { judul: "Integrasi", deskripsi: "Sambungan ke sistem lain. Kunci rahasia tidak disimpan di sini, melainkan di variabel lingkungan server." },
};

export default async function HalamanUmum() {
  await wajibHalamanHak("kelola_pengaturan");
  const rows = await sql`select g.kunci, g.label, g.kelompok, g.keterangan, g.nilai, g.urutan, g.updated_at, u.nama as pengubah
    from pengaturan g left join app_users u on u.id = g.updated_by order by g.urutan, g.kunci`;
  const urutKelompok = [...new Set([...Object.keys(KELOMPOK), ...rows.map((r) => r.kelompok as string)])];
  const grup = urutKelompok
    .map((k) => ({
      kode: k,
      judul: KELOMPOK[k]?.judul ?? k.charAt(0).toUpperCase() + k.slice(1),
      deskripsi: KELOMPOK[k]?.deskripsi ?? "",
      baris: rows.filter((r) => r.kelompok === k).map((r) => ({
        kunci: r.kunci, label: r.label, keterangan: r.keterangan, nilai: r.nilai,
        diubah: r.pengubah ? `Terakhir diubah ${r.pengubah}, ${waktuPendek(r.updated_at)}` : null,
      })) as BarisPengaturan[],
    }))
    .filter((g) => g.baris.length);

  return (
    <>
      <JudulHalaman judul="Pengaturan umum" deskripsi="Nilai-nilai yang dipakai di seluruh SIMPEL. Setiap perubahan tercatat di log audit." kembali={{ href: "/pengaturan", label: "Pengaturan" }} />
      <div className="space-y-6">
        {grup.map((g) => <FormPengaturan key={`${g.kode}-${g.baris.map((b) => b.diubah ?? "").join("|")}`} judul={g.judul} deskripsi={g.deskripsi} baris={g.baris} />)}
      </div>
    </>
  );
}
