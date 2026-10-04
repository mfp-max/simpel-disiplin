"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Folder, Inbox, Loader2, Search, User } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";

type Hasil = { jenis: "entri" | "pegawai" | "dokumen" | "berkas"; id: string; judul: string; sub: string; href: string };

const IKON = { entri: Folder, pegawai: User, dokumen: FileText, berkas: Inbox };
const JUDUL = { entri: "Kasus, informasi & arsip", pegawai: "Pegawai", dokumen: "Dokumen & nomor surat", berkas: "Isi berkas (OCR)" };

export function PencarianGlobal() {
  const [buka, setBuka] = useState(false);
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<Hasil[]>([]);
  const [memuat, setMemuat] = useState(false);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !/input|textarea/i.test((e.target as HTMLElement)?.tagName))) {
        e.preventDefault();
        setBuka(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHasil([]);
      return;
    }
    setMemuat(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/cari?q=${encodeURIComponent(q.trim())}`);
        setHasil(r.ok ? ((await r.json()) as Hasil[]) : []);
      } catch {
        setHasil([]);
      } finally {
        setMemuat(false);
      }
    }, 250);
  }, [q]);

  const kelompok = (["entri", "pegawai", "dokumen", "berkas"] as const).map((j) => ({ j, items: hasil.filter((h) => h.jenis === j) }));

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setBuka(true)}
        className="h-11 w-11 justify-center p-0 text-muted-foreground sm:w-full sm:max-w-md sm:justify-start sm:px-3"
        aria-label="Cari nama, NIP, nomor registrasi, nomor surat"
      >
        <Search className="size-5" aria-hidden />
        <span className="hidden truncate sm:inline">Cari nama, NIP, nomor registrasi, nomor surat…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-xs md:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={buka} onOpenChange={setBuka} title="Pencarian" description="Cari di seluruh SIMPEL" shouldFilter={false}>
        <CommandInput placeholder="Ketik nama, NIP, nomor registrasi, atau nomor surat…" value={q} onValueChange={setQ} />
        <CommandList className="max-h-[60vh]">
          {memuat && (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Mencari…
            </div>
          )}
          {!memuat && q.trim().length >= 2 && <CommandEmpty>Tidak ditemukan. Coba kata kunci lain.</CommandEmpty>}
          {!memuat && q.trim().length < 2 && <div className="px-4 py-6 text-sm text-muted-foreground">Ketik minimal 2 huruf.</div>}
          {kelompok.map(({ j, items }) =>
            items.length ? (
              <CommandGroup key={j} heading={JUDUL[j]}>
                {items.map((h) => {
                  const Ikon = IKON[h.jenis];
                  return (
                    <CommandItem key={h.jenis + h.id} value={h.jenis + h.id} onSelect={() => { setBuka(false); router.push(h.href); }} className="min-h-12">
                      <Ikon className="size-5 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate font-medium" data-pii>{h.judul}</div>
                        <div className="truncate text-xs text-muted-foreground">{h.sub}</div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null,
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
