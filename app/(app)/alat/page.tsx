import type { Metadata } from "next";
import { CalendarDays, FileClock, UserRoundX } from "lucide-react";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { hariIni } from "@/lib/hari-kerja";
import { daftarRegulasiUtama } from "@/lib/laporan";
import { JudulHalaman, Panel } from "@/components/simpel/dasar";
import { KalkulatorAmbang, KalkulatorBerlaku, KalkulatorHariKerja } from "./alat_klien";

export const metadata: Metadata = { title: "Kalkulator — SIMPEL" };
export const dynamic = "force-dynamic";

export default async function HalamanAlat() {
  await wajibMasuk();
  const [libur, rezim, regulasi] = await Promise.all([
    sql`select tanggal, nama, jenis from hari_libur order by tanggal`,
    sql`select kode, nama from rezim where aktif order by urutan`,
    daftarRegulasiUtama(),
  ]);
  const hari = hariIni();
  const tahunLibur = [...new Set(libur.map((l) => String(l.tanggal).slice(0, 4)))];

  const nav = [
    { href: "#hari-kerja", label: "Hari kerja", ikon: CalendarDays },
    { href: "#mulai-berlaku", label: "Mulai berlaku SK", ikon: FileClock },
    { href: "#ambang-kehadiran", label: "Ambang kehadiran", ikon: UserRoundX },
  ];

  return (
    <div className="space-y-6">
      <JudulHalaman
        judul="Kalkulator"
        deskripsi="Alat bantu hitung yang membaca kalender libur dan katalog aturan di SIMPEL — angka tenggat dan ambang tidak ditulis di program."
      />
      <nav aria-label="Pilih kalkulator" className="flex flex-wrap gap-2">
        {nav.map((n) => (
          <a key={n.href} href={n.href} className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium hover:bg-accent">
            <n.ikon className="size-4 text-primary" aria-hidden /> {n.label}
          </a>
        ))}
      </nav>

      <Panel
        id="hari-kerja"
        judul="Kalkulator hari kerja"
        deskripsi={`Menambah atau mengurangi hari kerja; melewati Sabtu, Minggu, dan hari libur/cuti bersama di tabel kalender (tersedia: ${tahunLibur.join(", ") || "belum ada"}).`}
      >
        <KalkulatorHariKerja hariIni={hari} libur={libur.map((l) => ({ tanggal: l.tanggal as string, nama: l.nama as string }))} />
      </Panel>

      <Panel id="mulai-berlaku" judul="Kapan SK mulai berlaku?" deskripsi="Dihitung dari tanggal SK diterima pegawai memakai aturan tenggat “mulai berlaku” milik peraturan yang dipilih.">
        <KalkulatorBerlaku hariIni={hari} rezim={rezim as never} regulasi={regulasi} />
      </Panel>

      <Panel id="ambang-kehadiran" judul="Ambang pelanggaran kehadiran" deskripsi="Usulan tingkat dan jenis hukuman dari jumlah hari tidak masuk kerja tanpa alasan yang sah, menurut peraturan yang berlaku pada tanggal peristiwa.">
        <KalkulatorAmbang hariIni={hari} rezim={rezim as never} regulasi={regulasi} />
      </Panel>
    </div>
  );
}
