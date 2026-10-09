"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, CheckCircle2, ChevronRight, CircleDashed, FlaskConical, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Panel } from "@/components/simpel/dasar";
import { useAksi } from "@/components/simpel/interaktif";
import { arsipkanSimulasiAksi, buatSkenarioAksi } from "./_aksi";

export type BarisSkenario = {
  kode: string;
  kelompok: string;
  judul: string;
  ringkas: string;
  entri: { href: string; nomor: string; status: string; dokumen: number; berkas: number }[];
};

type Keadaan = { status: "menunggu" | "berjalan" | "berhasil" | "gagal"; pesan?: string; log?: string[] };

export function PanelSimulasi({ baris }: { baris: BarisSkenario[] }) {
  const router = useRouter();
  const { jalankan, sibuk: sibukArsip } = useAksi();
  const [keadaan, setKeadaan] = useState<Record<string, Keadaan>>({});
  const [berjalan, setBerjalan] = useState(false);
  const belum = baris.filter((b) => !b.entri.length);
  const selesaiJalan = Object.values(keadaan).filter((k) => k.status === "berhasil" || k.status === "gagal").length;
  const totalJalan = Object.keys(keadaan).length;

  async function buat(daftar: BarisSkenario[]) {
    setBerjalan(true);
    setKeadaan(Object.fromEntries(daftar.map((b) => [b.kode, { status: "menunggu" } as Keadaan])));
    let gagal = 0;
    for (const b of daftar) {
      setKeadaan((k) => ({ ...k, [b.kode]: { status: "berjalan" } }));
      try {
        const h = await buatSkenarioAksi(b.kode);
        if (h.ok) setKeadaan((k) => ({ ...k, [b.kode]: { status: "berhasil", log: h.data.log } }));
        else {
          gagal += 1;
          setKeadaan((k) => ({ ...k, [b.kode]: { status: "gagal", pesan: h.pesan } }));
        }
      } catch {
        gagal += 1;
        setKeadaan((k) => ({ ...k, [b.kode]: { status: "gagal", pesan: "Gagal terhubung ke server." } }));
      }
    }
    setBerjalan(false);
    router.refresh();
    if (gagal) toast.error(`${gagal} skenario gagal dibuat. Lihat keterangan pada daftar.`);
    else toast.success("Data simulasi selesai dibuat. Buka Beranda untuk melihat pemantauannya.");
  }

  const adaData = baris.some((b) => b.entri.length);

  return (
    <div className="space-y-6">
      <Panel
        judul={<span className="flex items-center gap-2"><FlaskConical className="size-5" aria-hidden />Skenario</span>}
        deskripsi="Setiap skenario dibuat dalam satu transaksi: bila gagal, tidak ada data yang tertinggal. Skenario yang sudah ada dilewati."
        aksi={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => buat(belum)} disabled={berjalan || !belum.length}>
              {berjalan ? <Loader2 className="animate-spin" aria-hidden /> : <FlaskConical aria-hidden />}
              {belum.length === baris.length ? "Buat semua data simulasi" : belum.length ? `Buat ${belum.length} skenario yang belum ada` : "Semua skenario sudah dibuat"}
            </Button>
            {adaData && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={berjalan || sibukArsip}><Archive aria-hidden /> Arsipkan semua data simulasi</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Arsipkan semua data simulasi?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Semua informasi, kasus, pembinaan, dan arsip simulasi disembunyikan dari daftar, Beranda, dan Laporan. Data tidak dihapus permanen
                      dan tercatat di log audit. Setelah diarsipkan, data simulasi dapat dibuat ulang dari halaman ini.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction onClick={() => jalankan(() => arsipkanSimulasiAksi())}>Arsipkan</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      >
        {totalJalan > 0 && (
          <div className="mb-4 space-y-1.5" aria-live="polite">
            <Progress value={(selesaiJalan / totalJalan) * 100} aria-label="Kemajuan pembuatan data simulasi" />
            <p className="text-sm text-muted-foreground">{berjalan ? `Membuat skenario ${Math.min(selesaiJalan + 1, totalJalan)} dari ${totalJalan}…` : `${selesaiJalan} dari ${totalJalan} skenario diproses.`}</p>
          </div>
        )}
        <ul className="divide-y rounded-lg border">
          {baris.map((b) => {
            const k = keadaan[b.kode];
            return (
              <li key={b.kode} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
                <div className="flex shrink-0 items-center gap-2 sm:w-36">
                  <IkonKeadaan ada={b.entri.length > 0} k={k} />
                  <span className="font-semibold tabular-nums">{b.kode}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{b.kelompok}</span>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium">{b.judul}</p>
                  <p className="text-sm text-muted-foreground">{b.ringkas}</p>
                  {k?.status === "gagal" && <p className="text-sm text-destructive">{k.pesan}</p>}
                  {b.entri.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {b.entri.map((e) => (
                        <Link key={e.href} href={e.href} className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-3 text-sm hover:bg-muted">
                          <span className="font-medium">{e.nomor}</span>
                          <span className="text-muted-foreground">· {e.status}{e.dokumen ? ` · ${e.dokumen} dokumen` : ""}{e.berkas ? ` · ${e.berkas} berkas` : ""}</span>
                          <ChevronRight className="size-4" aria-hidden />
                        </Link>
                      ))}
                    </div>
                  )}
                  {k?.log?.length ? (
                    <details className="pt-1 text-sm">
                      <summary className="cursor-pointer text-primary">Lihat langkah yang dijalankan</summary>
                      <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap">{k.log.join("\n")}</pre>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

function IkonKeadaan({ ada, k }: { ada: boolean; k?: Keadaan }) {
  if (k?.status === "berjalan") return <Loader2 className="size-5 animate-spin text-primary" aria-label="Sedang dibuat" />;
  if (k?.status === "gagal") return <XCircle className="size-5 text-destructive" aria-label="Gagal" />;
  if (ada || k?.status === "berhasil") return <CheckCircle2 className="size-5 text-aman" aria-label="Sudah ada" />;
  return <CircleDashed className="size-5 text-muted-foreground" aria-label="Belum dibuat" />;
}
