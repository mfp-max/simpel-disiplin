"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, DatabaseBackup, Download, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type Bagian = { nama: string; ukuran: number; jumlahBerkas: number; url: string };
type Keadaan =
  | { fase: "diam" }
  | { fase: "jalan"; persen: number; pesan: string }
  | { fase: "selesai"; bagian: Bagian[]; ringkas: string; gagal: number }
  | { fase: "galat"; pesan: string };

function ukuran(b: number) {
  return b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function TombolEksporPenuh() {
  const router = useRouter();
  const [k, setK] = useState<Keadaan>({ fase: "diam" });

  async function mulai() {
    setK({ fase: "jalan", persen: 1, pesan: "Memulai…" });
    try {
      const r = await fetch("/api/ekspor-penuh", { method: "POST" });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.galat ?? "Gagal memulai ekspor. Periksa sambungan internet Anda lalu coba lagi.");
      }
      const baca = r.body.getReader();
      const dek = new TextDecoder();
      let sisa = "";
      let akhir = false;
      while (!akhir) {
        const { value, done } = await baca.read();
        if (done) break;
        sisa += dek.decode(value, { stream: true });
        const baris = sisa.split("\n");
        sisa = baris.pop() ?? "";
        for (const b of baris) {
          if (!b.trim()) continue;
          const m = JSON.parse(b);
          if (m.jenis === "progres") setK({ fase: "jalan", persen: m.persen, pesan: m.pesan });
          else if (m.jenis === "selesai") {
            akhir = true;
            setK({
              fase: "selesai", bagian: m.bagian, gagal: m.berkasGagal,
              ringkas: `${m.jumlahTabel} tabel, ${Number(m.jumlahBaris).toLocaleString("id-ID")} baris data, ${Number(m.jumlahBerkas).toLocaleString("id-ID")} berkas.`,
            });
            toast.success("Ekspor penuh selesai.");
            router.refresh();
          } else if (m.jenis === "galat") {
            akhir = true;
            setK({ fase: "galat", pesan: m.pesan });
          }
        }
      }
      if (!akhir) throw new Error("Sambungan terputus sebelum ekspor selesai. Periksa daftar ekspor sebelumnya atau coba lagi.");
    } catch (e) {
      setK({ fase: "galat", pesan: (e as Error).message || "Ekspor gagal. Coba lagi." });
    }
  }

  return (
    <div className="space-y-4">
      <Button size="lg" onClick={mulai} disabled={k.fase === "jalan"}>
        {k.fase === "jalan" ? <Loader2 className="animate-spin" aria-hidden /> : <DatabaseBackup aria-hidden />}
        {k.fase === "jalan" ? "Menyusun arsip…" : "Buat ekspor penuh"}
      </Button>

      <div aria-live="polite" className="space-y-3">
        {k.fase === "jalan" && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{k.pesan}</span>
              <span className="tabular-nums text-muted-foreground">{k.persen}%</span>
            </div>
            <Progress value={k.persen} aria-label="Kemajuan ekspor penuh" />
            <p className="text-xs text-muted-foreground">Jangan tutup halaman ini sampai selesai.</p>
          </div>
        )}
        {k.fase === "selesai" && (
          <div className="space-y-3 rounded-lg border border-aman/40 bg-aman-muda p-4">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="size-5 text-aman" aria-hidden /> Arsip siap diunduh
            </p>
            <p className="text-sm">{k.ringkas}{k.gagal ? ` ${k.gagal} berkas gagal diunduh dan dicantumkan di berkas-gagal.txt.` : ""}</p>
            <ul className="space-y-2">
              {k.bagian.map((b, i) => (
                <li key={b.nama}>
                  <a href={b.url} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    <Download className="size-4" aria-hidden />
                    {k.bagian.length > 1 ? `Unduh bagian ${i + 1} dari ${k.bagian.length}` : "Unduh arsip ZIP"} ({ukuran(b.ukuran)})
                  </a>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Tautan berlaku 5 menit. Setelah itu, gunakan &ldquo;Unduh ulang&rdquo; pada daftar di bawah.</p>
          </div>
        )}
        {k.fase === "galat" && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-lewat/40 bg-lewat-muda p-4 text-sm">
            <XCircle className="mt-0.5 size-5 shrink-0 text-lewat" aria-hidden /> {k.pesan}
          </p>
        )}
      </div>
    </div>
  );
}
