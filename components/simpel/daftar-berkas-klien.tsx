"use client";

import { useState } from "react";
import { Archive, Download, ExternalLink, FileImage, FileText, Loader2, ScanText, Music } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ukuranBerkas, waktuPendek } from "@/lib/format";
import type { Hasil } from "@/lib/galat";
import { DialogAlasan, UnggahBerkas, useAksi } from "./interaktif";

type Siapkan = (info: { nama: string; mime: string; ukuran: number }) => Promise<Hasil<{ signedUrl: string; path: string }>>;
type Konfirmasi = (kategori: string, info: { path: string; nama: string; mime: string; ukuran: number }) => Promise<Hasil<unknown>>;

export function PengunggahBerkas({ kategori, kategoriBawaan, siapkan, konfirmasi }: { kategori: { kode: string; label: string }[]; kategoriBawaan: string; siapkan: Siapkan; konfirmasi: Konfirmasi }) {
  const [kat, setKat] = useState(kategoriBawaan);
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Label htmlFor="kategori-berkas" className="shrink-0">Jenis berkas</Label>
        <Select value={kat} onValueChange={setKat}>
          <SelectTrigger id="kategori-berkas" className="w-full sm:w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            {kategori.map((k) => <SelectItem key={k.kode} value={k.kode}>{k.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <UnggahBerkas siapkan={siapkan} konfirmasi={(info) => konfirmasi(kat, info)} />
    </div>
  );
}

type Berkas = { id: string; nama: string; mime: string | null; ukuran: number; kategori: string; keterangan: string | null; waktu: string; pengunggah: string | null; adaTeks: boolean; panjangTeks: number };

function Ikon({ mime }: { mime: string | null }) {
  if (mime?.startsWith("image/")) return <FileImage className="size-5 text-muted-foreground" aria-hidden />;
  if (mime?.startsWith("audio/")) return <Music className="size-5 text-muted-foreground" aria-hidden />;
  return <FileText className="size-5 text-muted-foreground" aria-hidden />;
}

export function BarisBerkas({
  berkas, bolehUbah, bolehArsipkan, simpanTeks, arsipkan,
}: {
  berkas: Berkas; bolehUbah: boolean; bolehArsipkan: boolean;
  simpanTeks: (id: string, teks: string, keterangan?: string | null) => Promise<Hasil<unknown>>;
  arsipkan: (id: string, alasan: string) => Promise<Hasil<unknown>>;
}) {
  const [bukaTeks, setBukaTeks] = useState(false);
  const [teks, setTeks] = useState("");
  const [keterangan, setKeterangan] = useState(berkas.keterangan ?? "");
  const [ocr, setOcr] = useState<{ jalan: boolean; persen: number }>({ jalan: false, persen: 0 });
  const { jalankan, sibuk } = useAksi();
  const gambar = berkas.mime?.startsWith("image/");

  async function jalankanOcr() {
    setOcr({ jalan: true, persen: 0 });
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("ind", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setOcr({ jalan: true, persen: Math.round(m.progress * 100) });
        },
      });
      const r = await fetch(`/api/berkas/${berkas.id}`);
      const blob = await r.blob();
      const { data } = await worker.recognize(blob);
      await worker.terminate();
      setTeks(data.text.trim());
      toast.success("Teks berhasil dibaca. Periksa lalu simpan.");
    } catch {
      toast.error("OCR gagal. Anda tetap bisa mengetik ringkasan isi berkas secara manual.");
    } finally {
      setOcr({ jalan: false, persen: 0 });
    }
  }

  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Ikon mime={berkas.mime} />
        <div className="min-w-0">
          <a href={`/api/berkas/${berkas.id}`} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">{berkas.nama}</a>
          <p className="text-sm text-muted-foreground">
            {berkas.kategori} · {ukuranBerkas(berkas.ukuran)} · {waktuPendek(berkas.waktu)}{berkas.pengunggah ? ` · ${berkas.pengunggah}` : ""}
          </p>
          {berkas.keterangan && <p className="text-sm">{berkas.keterangan}</p>}
          {berkas.adaTeks && <p className="text-xs text-aman">Isi berkas dapat dicari ({berkas.panjangTeks} karakter)</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm"><a href={`/api/berkas/${berkas.id}`} target="_blank" rel="noreferrer"><ExternalLink /> Buka</a></Button>
        <Button asChild variant="outline" size="sm"><a href={`/api/berkas/${berkas.id}?unduh=1`}><Download /> Unduh</a></Button>
        {bolehUbah && <Button variant="outline" size="sm" onClick={() => setBukaTeks(true)}><ScanText /> Teks isi</Button>}
        {bolehArsipkan && (
          <DialogAlasan
            pemicu={<Button variant="ghost" size="sm" aria-label="Arsipkan berkas"><Archive /></Button>}
            judul="Arsipkan berkas ini?"
            deskripsi="Berkas tidak dihapus permanen; hanya disembunyikan dari daftar dan tercatat di log audit."
            labelTombol="Arsipkan"
            aksi={(alasan) => arsipkan(berkas.id, alasan)}
            sukses="Berkas diarsipkan"
          />
        )}
      </div>

      <Dialog open={bukaTeks} onOpenChange={setBukaTeks}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Teks isi berkas (untuk pencarian)</DialogTitle>
            <DialogDescription>
              {gambar ? "Gunakan OCR untuk membaca teks dari pindaian secara otomatis, lalu periksa hasilnya." : "Ketik atau tempel ringkasan isi berkas agar dapat ditemukan lewat pencarian."}
            </DialogDescription>
          </DialogHeader>
          {gambar && (
            <Button variant="secondary" onClick={jalankanOcr} disabled={ocr.jalan}>
              {ocr.jalan ? <><Loader2 className="animate-spin" /> Membaca teks… {ocr.persen}%</> : <><ScanText /> Baca teks otomatis (OCR)</>}
            </Button>
          )}
          <div className="space-y-2">
            <Label htmlFor={`teks-${berkas.id}`}>Teks isi</Label>
            <Textarea id={`teks-${berkas.id}`} rows={10} value={teks} onChange={(e) => setTeks(e.target.value)} placeholder={berkas.adaTeks ? "Teks sudah tersimpan. Ketik ulang untuk mengganti." : "Belum ada teks."} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ket-${berkas.id}`}>Keterangan singkat</Label>
            <Textarea id={`ket-${berkas.id}`} rows={2} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBukaTeks(false)}>Batal</Button>
            <Button disabled={sibuk || (!teks.trim() && keterangan === (berkas.keterangan ?? ""))} onClick={() => jalankan(() => simpanTeks(berkas.id, teks, keterangan), { lalu: () => setBukaTeks(false) })}>
              {sibuk && <Loader2 className="animate-spin" />} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
