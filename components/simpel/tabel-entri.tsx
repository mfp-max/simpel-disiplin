import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pii } from "./dasar";

export type KolomEntri<T> = {
  judul: string;
  isi: (r: T) => React.ReactNode;
  kelas?: string;
  /** tampil juga di kartu ponsel */
  ponsel?: boolean;
};

/** Daftar responsif: tabel di layar lebar, kartu di ponsel (tanpa gulir mendatar). */
export function TabelEntri<T extends { id: string }>({
  rows, kolom, href, judulKartu, subKartu, kananKartu,
}: {
  rows: T[];
  kolom: KolomEntri<T>[];
  href: (r: T) => string;
  judulKartu: (r: T) => React.ReactNode;
  subKartu?: (r: T) => React.ReactNode;
  kananKartu?: (r: T) => React.ReactNode;
}) {
  return (
    <>
      <ul className="divide-y rounded-xl border bg-card md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={href(r)} className="flex items-start gap-3 px-4 py-3 active:bg-accent">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-medium leading-snug">{judulKartu(r)}</div>
                {subKartu && <div className="text-sm text-muted-foreground">{subKartu(r)}</div>}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {kolom.filter((k) => k.ponsel).map((k) => <span key={k.judul}>{k.isi(r)}</span>)}
                </div>
              </div>
              {kananKartu?.(r)}
              <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-[13px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {kolom.map((k) => <th key={k.judul} scope="col" className={cn("px-4 py-3 font-semibold", k.kelas)}>{k.judul}</th>)}
              <th className="w-10" aria-hidden />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className="group hover:bg-accent/50">
                {kolom.map((k, i) => (
                  <td key={k.judul} className={cn("px-4 py-3 align-top", k.kelas)}>
                    {i === 0 ? <Link href={href(r)} className="font-medium hover:underline">{k.isi(r)}</Link> : k.isi(r)}
                  </td>
                ))}
                <td className="px-2 py-3 align-top">
                  <Link href={href(r)} aria-label="Buka" className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground group-hover:text-foreground">
                    <ChevronRight className="size-5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function NamaPegawai({ nama, nip }: { nama: string | null; nip?: string | null }) {
  if (!nama) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="block min-w-0">
      <Pii className="block truncate">{nama}</Pii>
      {nip && <Pii className="block text-xs text-muted-foreground">{nip}</Pii>}
    </span>
  );
}

/** Navigasi halaman sederhana berbasis searchParams. */
export function Halaman({ total, halaman, perHalaman, dasar }: { total: number; halaman: number; perHalaman: number; dasar: (h: number) => string }) {
  const jumlah = Math.max(1, Math.ceil(total / perHalaman));
  if (jumlah <= 1) return <p className="mt-3 text-sm text-muted-foreground">{total} data</p>;
  return (
    <nav aria-label="Halaman" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">Halaman {halaman} dari {jumlah} · {total} data</p>
      <div className="flex gap-2">
        {halaman > 1 ? <Link className="inline-flex h-11 items-center rounded-md border bg-card px-4 text-sm font-medium hover:bg-accent" href={dasar(halaman - 1)}>Sebelumnya</Link> : null}
        {halaman < jumlah ? <Link className="inline-flex h-11 items-center rounded-md border bg-card px-4 text-sm font-medium hover:bg-accent" href={dasar(halaman + 1)}>Berikutnya</Link> : null}
      </div>
    </nav>
  );
}
