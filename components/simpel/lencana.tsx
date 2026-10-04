import { AlertTriangle, CheckCircle2, Clock, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

const WARNA_STATUS: Record<string, string> = {
  informasi: "bg-arsip-muda text-arsip",
  berjalan: "bg-info-muda text-info",
  selesai: "bg-aman-muda text-aman",
  dihentikan: "bg-arsip-muda text-arsip",
};

export function LencanaStatus({ nama, kelompok, className }: { nama: string; kelompok?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", WARNA_STATUS[kelompok ?? "berjalan"] ?? WARNA_STATUS.berjalan, className)}>
      {nama}
    </span>
  );
}

export type StatusTenggat = { warna: "aman" | "waspada" | "lewat" | "selesai"; sisa: number | null; label: string };

export function LencanaTenggat({ status, className }: { status: StatusTenggat; className?: string }) {
  const gaya = {
    aman: "bg-aman-muda text-aman",
    waspada: "bg-waspada-muda text-waspada",
    lewat: "bg-lewat-muda text-lewat",
    selesai: "bg-arsip-muda text-arsip",
  }[status.warna];
  const Ikon = status.warna === "lewat" ? AlertTriangle : status.warna === "selesai" ? CheckCircle2 : Clock;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", gaya, className)}>
      <Ikon className="size-3.5" aria-hidden />
      {status.label}
    </span>
  );
}

export function LencanaVerifikasi({ className }: { className?: string }) {
  return (
    <span title="Isi ini belum dicocokkan dengan naskah resmi peraturan" className={cn("inline-flex items-center gap-1 rounded-full bg-waspada-muda px-2 py-0.5 text-xs font-semibold text-waspada whitespace-nowrap", className)}>
      <ShieldQuestion className="size-3.5" aria-hidden /> Perlu verifikasi
    </span>
  );
}

export function LencanaRezim({ kode, nama }: { kode: string | null | undefined; nama?: string | null }) {
  if (!kode) return <span className="inline-flex rounded-full bg-waspada-muda px-2.5 py-0.5 text-xs font-semibold text-waspada">Rezim perlu verifikasi</span>;
  return <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">{nama ?? `Rezim ${kode}`}</span>;
}

export function Lencana({ children, warna = "netral", className }: { children: React.ReactNode; warna?: "netral" | "aman" | "waspada" | "lewat" | "info"; className?: string }) {
  const gaya = { netral: "bg-secondary text-secondary-foreground", aman: "bg-aman-muda text-aman", waspada: "bg-waspada-muda text-waspada", lewat: "bg-lewat-muda text-lewat", info: "bg-info-muda text-info" }[warna];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", gaya, className)}>{children}</span>;
}
