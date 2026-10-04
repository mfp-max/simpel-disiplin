"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Pratinjau .docx di peramban dengan docx-preview (tanpa LibreOffice — tidak
// tersedia di Vercel). Format halaman, tabel, dan kop mengikuti berkas aslinya
// sedekat yang dapat dirender peramban; berkas .docx tetap keluaran utama.

const OPSI = {
  inWrapper: true,
  breakPages: true,
  ignoreLastRenderedPageBreak: true,
  renderHeaders: true,
  renderFooters: true,
  useBase64URL: true,
  hideWrapperOnPrint: true,
} as const;

/** Pratinjau dokumen di dalam halaman/dialog; diperkecil otomatis agar muat di layar ponsel. */
export function PratinjauDocx({ data, className }: { data: Blob | ArrayBuffer | null; className?: string }) {
  const wadah = useRef<HTMLDivElement>(null);
  const isi = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"memuat" | "siap" | "galat">("memuat");

  useEffect(() => {
    let batal = false;
    const el = isi.current;
    if (!data || !el) return;
    setStatus("memuat");
    (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        if (batal) return;
        el.innerHTML = "";
        el.style.zoom = "1";
        await renderAsync(data, el, undefined, OPSI);
        if (batal) return;
        const halaman = el.querySelector<HTMLElement>("section.docx");
        const lebarWadah = wadah.current?.clientWidth ?? 0;
        if (halaman && lebarWadah) {
          const skala = Math.min(1, (lebarWadah - 8) / (halaman.offsetWidth + 40));
          el.style.zoom = String(Math.max(0.35, skala));
        }
        setStatus("siap");
      } catch {
        if (!batal) setStatus("galat");
      }
    })();
    return () => {
      batal = true;
    };
  }, [data]);

  return (
    <div ref={wadah} className={cn("relative min-h-48 overflow-auto rounded-lg border bg-muted", className)}>
      {status === "memuat" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-muted/80 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden /> Menyiapkan pratinjau…
        </div>
      )}
      {status === "galat" && (
        <p className="p-4 text-sm text-lewat">Pratinjau tidak dapat ditampilkan di peramban ini. Unduh berkas .docx untuk membukanya di Word.</p>
      )}
      <div ref={isi} className="[&_.docx-wrapper]:!bg-transparent [&_.docx-wrapper]:!p-2" />
    </div>
  );
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Membuka jendela baru berisi dokumen layar penuh dengan tombol "Cetak / Simpan PDF"
 * (window.print). Dipakai untuk cetak & PDF karena konversi LibreOffice tidak tersedia
 * di server. Audit "cetak" dicatat oleh route /api/dokumen/[id].
 */
export async function bukaJendelaCetak(url: string, judul: string) {
  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Peramban memblokir jendela baru. Izinkan pop-up untuk SIMPEL lalu coba lagi.");
    return;
  }
  w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(judul)} — RAHASIA</title>
<style>
  html,body{margin:0;background:#e5e7eb;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;color:#111}
  .bilah{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:8px 16px;background:#0f2a5c;color:#fff}
  .bilah strong{font-size:15px}.bilah small{display:block;opacity:.8;font-size:13px}
  .bilah button{min-height:44px;padding:0 18px;border:0;border-radius:8px;background:#facc15;color:#111;font-size:15px;font-weight:600;cursor:pointer}
  .bilah button.kedua{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5)}
  #pesan{padding:24px;text-align:center}
  #isi{overflow-x:auto}
  @media print{.bilah,#pesan{display:none!important}html,body{background:#fff}#isi{overflow:visible}@page{size:A4;margin:0}}
</style></head><body>
<div class="bilah"><div><strong>${esc(judul)}</strong><small>RAHASIA · pencetakan tercatat di log audit</small></div>
<div><button type="button" class="kedua" id="tutup">Tutup</button> <button type="button" id="cetak" disabled>Cetak / Simpan PDF</button></div></div>
<div id="pesan">Memuat dokumen…</div><div id="isi"></div></body></html>`);
  w.document.close();
  w.document.getElementById("tutup")?.addEventListener("click", () => w.close());
  try {
    const r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) throw new Error(await r.text());
    const buf = await r.arrayBuffer();
    const { renderAsync } = await import("docx-preview");
    await renderAsync(buf, w.document.getElementById("isi")!, w.document.head, OPSI);
    w.document.getElementById("pesan")?.remove();
    const tombol = w.document.getElementById("cetak") as HTMLButtonElement | null;
    if (tombol) {
      tombol.disabled = false;
      tombol.addEventListener("click", () => w.print());
    }
  } catch {
    const pesan = w.document.getElementById("pesan");
    if (pesan) pesan.textContent = "Dokumen tidak dapat dimuat. Tutup jendela ini lalu coba lagi, atau unduh berkas .docx.";
  }
}
