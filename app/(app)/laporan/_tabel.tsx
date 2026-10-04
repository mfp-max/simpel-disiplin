import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Baris, Kolom, Lembar } from "@/lib/laporan";
import { teksSel } from "@/lib/ekspor";
import { Pii } from "@/components/simpel/dasar";
import { LencanaTenggat, type StatusTenggat } from "@/components/simpel/lencana";
import { cn } from "@/lib/utils";

export const PER_HALAMAN = 25;

function Sel({ k, r }: { k: Kolom; r: Baris }) {
  const v = r[k.kunci];
  if (k.jenis === "tenggat") return v ? <LencanaTenggat status={v as StatusTenggat} /> : <span className="text-muted-foreground">—</span>;
  const teks = teksSel(k, v);
  if (k.jenis === "pii" && teks !== "—") return <Pii>{teks}</Pii>;
  if (k.jenis === "ya_tidak") return <span className={cn(v ? "font-semibold text-lewat" : "text-muted-foreground")}>{teks}</span>;
  return <>{teks}</>;
}

/** Tabel pratinjau laporan: gulir mendatar hanya di dalam kotak tabel (390px aman). */
export function TabelLembar({ l, halaman, hrefHalaman }: { l: Lembar; halaman?: number; hrefHalaman?: (n: number) => string }) {
  const paginasi = !!l.utama && !!hrefHalaman && l.baris.length > PER_HALAMAN;
  const jumlahHalaman = Math.max(1, Math.ceil(l.baris.length / PER_HALAMAN));
  const hal = paginasi ? Math.min(Math.max(1, halaman ?? 1), jumlahHalaman) : 1;
  const baris = paginasi ? l.baris.slice((hal - 1) * PER_HALAMAN, hal * PER_HALAMAN) : l.baris;
  const kanan = (k: Kolom) => k.jenis === "angka" || k.jenis === "persen";

  if (!l.baris.length) {
    return <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Tidak ada data untuk filter ini.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border" role="region" aria-label={`Tabel ${l.judul}`} tabIndex={0}>
        <table className="w-full min-w-max border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              {l.kolom.map((k) => (
                <th key={k.kunci} scope="col" className={cn("border-b px-3 py-2.5 text-left font-semibold whitespace-nowrap", kanan(k) && "text-right")}>
                  {k.judul}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {baris.map((r, i) => {
              const tautan = l.tautan ? (r[l.tautan] as string | undefined) : undefined;
              return (
                <tr key={String(r.id ?? r.label ?? i) + i} className={cn("border-b last:border-0 hover:bg-accent/30", r.label === "Jumlah" && "bg-muted/40 font-semibold")}>
                  {l.kolom.map((k, j) => (
                    <td key={k.kunci} className={cn("px-3 py-2 align-top", kanan(k) && "text-right tabular-nums", k.jenis === "panjang" ? "min-w-56 max-w-md" : "whitespace-nowrap")}>
                      {j === 0 && tautan ? (
                        <Link href={tautan} className="font-medium text-primary underline-offset-2 hover:underline">
                          <Sel k={k} r={r} />
                        </Link>
                      ) : (
                        <Sel k={k} r={r} />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {paginasi && (
        <nav aria-label={`Halaman ${l.judul}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            Baris {(hal - 1) * PER_HALAMAN + 1}–{Math.min(hal * PER_HALAMAN, l.baris.length)} dari {l.baris.length}
          </span>
          <span className="flex items-center gap-2">
            {hal > 1 ? (
              <Link href={hrefHalaman!(hal - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-md border bg-background px-3 hover:bg-accent">
                <ChevronLeft className="size-4" aria-hidden /> Sebelumnya
              </Link>
            ) : null}
            <span aria-current="page" className="px-2 tabular-nums">{hal} / {jumlahHalaman}</span>
            {hal < jumlahHalaman ? (
              <Link href={hrefHalaman!(hal + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-md border bg-background px-3 hover:bg-accent">
                Berikutnya <ChevronRight className="size-4" aria-hidden />
              </Link>
            ) : null}
          </span>
        </nav>
      )}
    </div>
  );
}
