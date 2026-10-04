import Link from "next/link";
import { JudulHalaman, Catatan } from "@/components/simpel/dasar";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { cn } from "@/lib/utils";
import { KalenderLibur, type BarisLibur } from "./hari_libur_klien";

export const metadata = { title: "Hari libur" };

const BATAS_LENGKAP = 10;

export default async function HalamanHariLibur({ searchParams }: { searchParams: Promise<{ tahun?: string }> }) {
  await wajibHalamanHak("kelola_pengaturan");
  const sp = await searchParams;
  const kini = new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear();
  const tahun = Math.min(2100, Math.max(2000, Number(sp.tahun) || kini));
  const tahunDepan = kini + 1;

  const [rows, rekap] = await Promise.all([
    sql`select id, tanggal, nama, jenis, keterangan from hari_libur
        where tanggal between ${`${tahun}-01-01`} and ${`${tahun}-12-31`} order by tanggal`,
    sql`select extract(year from tanggal)::int as tahun, count(*)::int as n from hari_libur group by 1 order by 1`,
  ]);
  const jumlah = new Map(rekap.map((r) => [r.tahun as number, r.n as number]));
  const daftarTahun = [...new Set([kini - 1, kini, tahunDepan, tahunDepan + 1, tahun, ...rekap.map((r) => r.tahun as number)])].sort((a, b) => a - b);
  const nDepan = jumlah.get(tahunDepan) ?? 0;

  return (
    <>
      <JudulHalaman
        judul="Hari libur"
        deskripsi="Kalender libur nasional dan cuti bersama. Semua tenggat prosedural dihitung dalam hari kerja, jadi kalender ini harus lengkap dan sesuai SKB 3 Menteri."
        kembali={{ href: "/pengaturan", label: "Pengaturan" }}
      />

      <div className="mb-5 space-y-3">
        {nDepan < BATAS_LENGKAP && (
          <Catatan jenis="lewat" judul={`Kalender tahun ${tahunDepan} belum lengkap — perhitungan tenggat bisa keliru`}>
            Baru {nDepan} tanggal tercatat untuk {tahunDepan}. Lengkapi libur keagamaan dan cuti bersama dari SKB 3 Menteri begitu terbit.{" "}
            {tahun !== tahunDepan && <Link className="font-semibold text-primary underline underline-offset-4" href={`?tahun=${tahunDepan}`}>Buka tahun {tahunDepan}</Link>}
          </Catatan>
        )}
        <Catatan jenis="info">
          Setelah kalender diubah, tenggat kasus yang sedang berjalan dihitung ulang otomatis saat kasus tersebut dibuka atau diperbarui berikutnya.
          Tenggat yang sudah terealisasi tidak berubah.
        </Catatan>
      </div>

      <nav aria-label="Pilih tahun" className="mb-5 flex flex-wrap gap-2">
        {daftarTahun.map((t) => (
          <Link
            key={t}
            href={`?tahun=${t}`}
            aria-current={t === tahun ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium",
              t === tahun ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
            )}
          >
            {t}
            <span className={cn("rounded-full px-2 py-0.5 text-xs", t === tahun ? "bg-primary-foreground/20" : (jumlah.get(t) ?? 0) < BATAS_LENGKAP ? "bg-waspada-muda text-waspada" : "bg-secondary")}>
              {jumlah.get(t) ?? 0}
            </span>
          </Link>
        ))}
      </nav>

      <KalenderLibur tahun={tahun} libur={rows as unknown as BarisLibur[]} />
    </>
  );
}
