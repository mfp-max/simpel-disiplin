"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Check, ChevronsUpDown, CircleHelp, FileUp, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Hasil } from "@/lib/galat";

/** Tombol kirim formulir yang otomatis menampilkan "Menyimpan…". */
export function TombolKirim({ children, className, variant, label = "Menyimpan…", disabled }: { children: React.ReactNode; className?: string; variant?: "default" | "outline" | "destructive" | "secondary"; label?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className={className} disabled={pending || disabled}>
      {pending ? <><Loader2 className="animate-spin" aria-hidden /> {label}</> : children}
    </Button>
  );
}

/**
 * Menjalankan aksi server dengan notifikasi Bahasa Indonesia dan penyegaran halaman.
 * const { jalankan, sibuk } = useAksi(); jalankan(() => aksiSaya(data), { sukses: "Tersimpan" })
 */
export function useAksi() {
  const router = useRouter();
  const [sibuk, mulai] = useTransition();
  const jalankan = useCallback(
    <T,>(fn: () => Promise<Hasil<T>>, opsi: { sukses?: string; lalu?: (data: T) => void; segarkan?: boolean } = {}) =>
      new Promise<Hasil<T>>((resolve) => {
        mulai(async () => {
          try {
            const h = await fn();
            if (h.ok) {
              if (opsi.sukses ?? h.pesan) toast.success(opsi.sukses ?? h.pesan);
              opsi.lalu?.(h.data);
              if (opsi.segarkan !== false) router.refresh();
            } else {
              toast.error(h.pesan);
            }
            resolve(h);
          } catch {
            const pesan = "Gagal terhubung ke server. Periksa sambungan internet Anda lalu coba lagi.";
            toast.error(pesan);
            resolve({ ok: false, pesan });
          }
        });
      }),
    [router],
  );
  return { jalankan, sibuk };
}

/** Ikon tanda tanya yang menampilkan dasar hukum sebuah tahap (PRD §12 bantuan kontekstual). */
export function BantuanPasal({ judul, pasal, teks }: { judul: string; pasal?: string | null; teks?: string | null }) {
  if (!pasal && !teks) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Dasar hukum: ${judul}`}>
          <CircleHelp className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,26rem)] space-y-2 text-sm" align="start">
        <p className="font-semibold">{judul}</p>
        {teks && <p className="leading-relaxed text-muted-foreground">{teks}</p>}
        {pasal && <p className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">Dasar: {pasal}</p>}
      </PopoverContent>
    </Popover>
  );
}

/** Dialog yang mewajibkan alasan tertulis sebelum menjalankan aksi (arsipkan, koreksi, dsb.). */
export function DialogAlasan({
  pemicu, judul, deskripsi, labelTombol = "Lanjutkan", variant = "default", aksi, sukses,
}: {
  pemicu: React.ReactNode; judul: string; deskripsi?: React.ReactNode; labelTombol?: string; variant?: "default" | "destructive";
  aksi: (alasan: string) => Promise<Hasil<unknown>>; sukses?: string;
}) {
  const [buka, setBuka] = useState(false);
  const [alasan, setAlasan] = useState("");
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open={buka} onOpenChange={setBuka}>
      <DialogTrigger asChild>{pemicu}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{judul}</DialogTitle>
          {deskripsi && <DialogDescription>{deskripsi}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="alasan">Alasan (wajib, tercatat di log audit)</Label>
          <Textarea id="alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={3} placeholder="Tuliskan alasannya…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBuka(false)}>Batal</Button>
          <Button
            variant={variant}
            disabled={alasan.trim().length < 5 || sibuk}
            onClick={() => jalankan(() => aksi(alasan.trim()), { sukses, lalu: () => { setBuka(false); setAlasan(""); } })}
          >
            {sibuk && <Loader2 className="animate-spin" />} {labelTombol}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Pemilih pegawai (pencarian ke server)
// ---------------------------------------------------------------------------
export type PegawaiRingkas = {
  id: string; nip: string | null; nama_lengkap_gelar: string; unit_kerja: string | null; status_pegawai: string | null;
  golongan_ruang: string | null; jabatan: string | null; rezim_kode: string | null;
};

export function PilihPegawai({
  nilai, onPilih, placeholder = "Cari nama atau NIP pegawai…", name, id,
}: { nilai: PegawaiRingkas | null; onPilih: (p: PegawaiRingkas | null) => void; placeholder?: string; name?: string; id?: string }) {
  const [buka, setBuka] = useState(false);
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<PegawaiRingkas[]>([]);
  const [memuat, setMemuat] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) { setHasil([]); return; }
    setMemuat(true);
    t.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pegawai/cari?q=${encodeURIComponent(q.trim())}`);
        setHasil(r.ok ? await r.json() : []);
      } finally {
        setMemuat(false);
      }
    }, 250);
  }, [q]);

  return (
    <>
      {name && <input type="hidden" name={name} value={nilai?.id ?? ""} />}
      <Popover open={buka} onOpenChange={setBuka}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={buka} className="h-auto min-h-11 w-full justify-between py-2 text-left font-normal">
            {nilai ? (
              <span className="min-w-0">
                <span className="block truncate font-medium" data-pii>{nilai.nama_lengkap_gelar}</span>
                <span className="block truncate text-xs text-muted-foreground" data-pii>{[nilai.nip, nilai.status_pegawai, nilai.unit_kerja].filter(Boolean).join(" · ")}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <span className="flex items-center gap-1">
              {nilai && (
                <span role="button" tabIndex={0} aria-label="Kosongkan pilihan" className="rounded p-1 hover:bg-accent" onClick={(e) => { e.stopPropagation(); onPilih(null); }} onKeyDown={(e) => { if (e.key === "Enter") onPilih(null); }}>
                  <X className="size-4" />
                </span>
              )}
              <ChevronsUpDown className="size-4 opacity-60" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(92vw,32rem)] p-0" align="start">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik nama atau NIP…" className="h-12 w-full bg-transparent text-base outline-none" />
            {memuat && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <ul className="max-h-72 overflow-y-auto p-1" role="listbox">
            {q.trim().length < 2 && <li className="px-3 py-4 text-sm text-muted-foreground">Ketik minimal 2 huruf.</li>}
            {q.trim().length >= 2 && !memuat && !hasil.length && <li className="px-3 py-4 text-sm text-muted-foreground">Pegawai tidak ditemukan di master. Pastikan data Simpega sudah diimpor.</li>}
            {hasil.map((p) => (
              <li key={p.id}>
                <button type="button" role="option" aria-selected={nilai?.id === p.id} onClick={() => { onPilih(p); setBuka(false); }} className="flex w-full items-start gap-2 rounded-md px-3 py-2.5 text-left hover:bg-accent">
                  <Check className={cn("mt-1 size-4 shrink-0", nilai?.id === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium" data-pii>{p.nama_lengkap_gelar}</span>
                    <span className="block truncate text-xs text-muted-foreground" data-pii>{[p.nip, p.status_pegawai, p.golongan_ruang, p.unit_kerja].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------------------
// Unggah berkas langsung ke bucket privat
// ---------------------------------------------------------------------------
type Siapkan = (info: { nama: string; mime: string; ukuran: number }) => Promise<Hasil<{ signedUrl: string; path: string }>>;
type Konfirmasi = (info: { path: string; nama: string; mime: string; ukuran: number }) => Promise<Hasil<unknown>>;

export async function unggahLangsung(file: File | Blob, nama: string, siapkan: Siapkan, konfirmasi?: Konfirmasi) {
  const s = await siapkan({ nama, mime: file.type || "application/octet-stream", ukuran: file.size });
  if (!s.ok) throw new Error(s.pesan);
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file, nama);
  const r = await fetch(s.data.signedUrl, { method: "PUT", body, headers: { "x-upsert": "false" } });
  if (!r.ok) throw new Error("Unggahan terputus. Periksa sambungan internet lalu coba lagi.");
  if (konfirmasi) {
    const k = await konfirmasi({ path: s.data.path, nama, mime: file.type, ukuran: file.size });
    if (!k.ok) throw new Error(k.pesan);
  }
  return s.data.path;
}

export function UnggahBerkas({
  siapkan, konfirmasi, terima, label = "Pilih atau seret berkas ke sini", keterangan, banyak = true, batasMb = 50,
}: { siapkan: Siapkan; konfirmasi: Konfirmasi; terima?: string; label?: string; keterangan?: string; banyak?: boolean; batasMb?: number }) {
  const router = useRouter();
  const [proses, setProses] = useState<{ nama: string; status: "unggah" | "selesai" | "gagal"; pesan?: string }[]>([]);
  const [seret, setSeret] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function tangani(files: FileList | null) {
    if (!files?.length) return;
    const daftar = Array.from(files);
    setProses(daftar.map((f) => ({ nama: f.name, status: "unggah" })));
    let berhasil = 0;
    for (const [i, f] of daftar.entries()) {
      if (f.size > batasMb * 1024 * 1024) {
        setProses((p) => p.map((x, j) => (j === i ? { ...x, status: "gagal", pesan: `Lebih dari ${batasMb} MB` } : x)));
        continue;
      }
      try {
        await unggahLangsung(f, f.name, siapkan, konfirmasi);
        berhasil += 1;
        setProses((p) => p.map((x, j) => (j === i ? { ...x, status: "selesai" } : x)));
      } catch (e) {
        setProses((p) => p.map((x, j) => (j === i ? { ...x, status: "gagal", pesan: (e as Error).message } : x)));
      }
    }
    if (berhasil) {
      toast.success(`${berhasil} berkas terunggah`);
      router.refresh();
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => { e.preventDefault(); setSeret(true); }}
        onDragLeave={() => setSeret(false)}
        onDrop={(e) => { e.preventDefault(); setSeret(false); tangani(e.dataTransfer.files); }}
        className={cn("flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors", seret ? "border-primary bg-accent" : "border-input hover:border-primary/60 hover:bg-accent/50")}
      >
        <FileUp className="size-7 text-muted-foreground" aria-hidden />
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{keterangan ?? `PDF, gambar, Word, rekaman — maks. ${batasMb} MB per berkas`}</span>
        <input ref={input} type="file" className="sr-only" multiple={banyak} accept={terima} onChange={(e) => tangani(e.target.files)} />
      </label>
      {proses.length > 0 && (
        <ul className="space-y-1 text-sm">
          {proses.map((p, i) => (
            <li key={i} className="flex items-center gap-2">
              {p.status === "unggah" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              {p.status === "selesai" && <Check className="size-4 text-aman" />}
              {p.status === "gagal" && <X className="size-4 text-lewat" />}
              <span className="truncate">{p.nama}</span>
              {p.pesan && <span className="text-lewat">— {p.pesan}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
