import Link from "next/link";
import type { Metadata } from "next";
import { CalendarCheck, ChevronRight, DatabaseBackup, FileSpreadsheet, History, ListChecks, ShieldAlert, type LucideIcon } from "lucide-react";
import { wajibMasuk } from "@/lib/auth";
import { DAFTAR_LAPORAN } from "@/lib/laporan";
import { Catatan, JudulHalaman } from "@/components/simpel/dasar";

export const metadata: Metadata = { title: "Laporan — SIMPEL" };

const IKON: Record<string, LucideIcon> = {
  rekapitulasi: FileSpreadsheet,
  "kasus-berjalan": ListChecks,
  "riwayat-pegawai": History,
  "menjalani-hukuman": ShieldAlert,
  "kepatuhan-tenggat": CalendarCheck,
};

export default async function HalamanLaporan() {
  const p = await wajibMasuk();
  return (
    <div className="space-y-6">
      <JudulHalaman
        judul="Laporan"
        deskripsi="Pratinjau data di layar, lalu unduh sebagai Excel atau cetak/simpan sebagai PDF. Registrasi informasi dan arsip lampau tidak dihitung dalam angka penanganan."
      />
      <Catatan jenis="waspada" judul="Dokumen rahasia">
        Setiap unduhan dan cetakan tercatat di log audit serta diberi tanda &ldquo;RAHASIA&rdquo; beserta nama, surel, dan waktu pengunduh.
      </Catatan>
      <ul className="grid gap-3 md:grid-cols-2">
        {DAFTAR_LAPORAN.map((d) => {
          const Ikon = IKON[d.kode] ?? FileSpreadsheet;
          return (
            <li key={d.kode}>
              <Link href={`/laporan/${d.kode}`} className="group flex h-full items-start gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Ikon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-semibold">{d.judul}</span>
                  <span className="block text-sm text-muted-foreground">{d.deskripsi}</span>
                </span>
                <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          );
        })}
        {p.hak.kelola_pengaturan && (
          <li className="md:col-span-2">
            <Link href="/laporan/ekspor-penuh" className="group flex items-start gap-3 rounded-xl border border-dashed bg-card/80 p-4 transition-colors hover:border-primary/40">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-info-muda text-info">
                <DatabaseBackup className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block font-semibold">Ekspor penuh (khusus admin)</span>
                <span className="block text-sm text-muted-foreground">
                  Satu tombol menghasilkan arsip ZIP berisi seluruh tabel (JSON) dan seluruh berkas — dapat dibuka tanpa aplikasi SIMPEL.
                </span>
              </span>
              <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
