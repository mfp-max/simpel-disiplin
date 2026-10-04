import Link from "next/link";
import { ArrowLeft, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Judul halaman + deskripsi + tombol aksi. Responsif: aksi turun ke bawah di ponsel. */
export function JudulHalaman({
  judul, deskripsi, aksi, kembali, lencana,
}: { judul: React.ReactNode; deskripsi?: React.ReactNode; aksi?: React.ReactNode; kembali?: { href: string; label: string }; lencana?: React.ReactNode }) {
  return (
    <div className="mb-6 space-y-3">
      {kembali && (
        <Link href={kembali.href} className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {kembali.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-[1.7rem]">{judul}</h1>
            {lencana}
          </div>
          {deskripsi && <p className="max-w-3xl text-muted-foreground">{deskripsi}</p>}
        </div>
        {aksi && <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">{aksi}</div>}
      </div>
    </div>
  );
}

/** Kotak konten dengan latar kartu (menutupi pola logo agar teks mudah dibaca). */
export function Panel({ judul, deskripsi, aksi, children, className, id }: { judul?: React.ReactNode; deskripsi?: React.ReactNode; aksi?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)}>
      {(judul || aksi) && (
        <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            {judul && <h2 className="font-semibold">{judul}</h2>}
            {deskripsi && <p className="text-sm text-muted-foreground">{deskripsi}</p>}
          </div>
          {aksi && <div className="flex flex-wrap gap-2">{aksi}</div>}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Kosong({ ikon: Ikon = Info, judul, deskripsi, aksi }: { ikon?: LucideIcon; judul: string; deskripsi?: React.ReactNode; aksi?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Ikon className="size-7" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{judul}</p>
        {deskripsi && <p className="max-w-md text-sm text-muted-foreground">{deskripsi}</p>}
      </div>
      {aksi}
    </div>
  );
}

/** Data pribadi (nama/NIP) — disamarkan saat mode privasi aktif. */
export function Pii({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span data-pii className={className}>{children}</span>;
}

/** Baris "label: nilai" untuk halaman detail. */
export function Rincian({ items, kolom = 2 }: { items: { label: string; nilai: React.ReactNode; pii?: boolean; lebar?: boolean }[]; kolom?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4", kolom === 2 && "sm:grid-cols-2", kolom === 3 && "sm:grid-cols-2 lg:grid-cols-3")}>
      {items.map((it) => (
        <div key={it.label} className={cn("min-w-0", it.lebar && "sm:col-span-full")}>
          <dt className="text-sm text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 break-words font-medium">{it.pii ? <Pii>{it.nilai || "—"}</Pii> : it.nilai || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Catatan({ jenis = "info", judul, children }: { jenis?: "info" | "waspada" | "lewat" | "aman"; judul?: string; children: React.ReactNode }) {
  const gaya = {
    info: "border-info/30 bg-info-muda text-foreground",
    waspada: "border-waspada/40 bg-waspada-muda text-foreground",
    lewat: "border-lewat/40 bg-lewat-muda text-foreground",
    aman: "border-aman/40 bg-aman-muda text-foreground",
  }[jenis];
  const warnaIkon = { info: "text-info", waspada: "text-waspada", lewat: "text-lewat", aman: "text-aman" }[jenis];
  return (
    <div role={jenis === "lewat" ? "alert" : "note"} className={cn("flex gap-3 rounded-lg border p-3 text-sm sm:p-4", gaya)}>
      <Info className={cn("mt-0.5 size-5 shrink-0", warnaIkon)} aria-hidden />
      <div className="space-y-1">
        {judul && <p className="font-semibold">{judul}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
