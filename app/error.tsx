"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

// Ditampilkan bila halaman gagal dimuat di server (mis. basis data tidak merespons),
// menggantikan layar kosong/berputar.
export default function Galat({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-waspada-muda text-waspada">
          <TriangleAlert className="size-7" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold">Halaman gagal dimuat</h1>
        <p className="mt-2 text-muted-foreground">
          Server sedang tidak dapat menjangkau basis data atau terjadi gangguan sementara. Silakan coba lagi beberapa saat lagi.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Kode: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Coba lagi</Button>
          <Button variant="outline" onClick={() => window.location.assign("/beranda")}>
            Ke Beranda
          </Button>
        </div>
      </div>
    </main>
  );
}
