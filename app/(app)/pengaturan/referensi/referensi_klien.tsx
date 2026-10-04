"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kosong, Panel } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { useAksi } from "@/components/simpel/interaktif";
import { cn } from "@/lib/utils";
import { tambahReferensi, ubahReferensi, type IsianReferensi } from "./_aksi";

export type BarisReferensi = { kode: string; label: string; urutan: number; aktif: boolean; keterangan: string | null };
type Kategori = { kode: string; label: string; ket: string; n: number };

export function DaftarReferensi({ kategori, daftarKategori, baris }: { kategori: string; daftarKategori: Kategori[]; baris: BarisReferensi[] }) {
  const router = useRouter();
  const [form, setForm] = useState<{ buka: boolean; baris: BarisReferensi | null }>({ buka: false, baris: null });
  const k = daftarKategori.find((x) => x.kode === kategori);

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
      {/* Ponsel: pilihan kategori */}
      <div className="lg:hidden">
        <Label htmlFor="pilih-kat" className="mb-1.5 block">Kategori</Label>
        <Select value={kategori} onValueChange={(v) => router.push(`?kategori=${v}`)}>
          <SelectTrigger id="pilih-kat" className="w-full bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            {daftarKategori.map((x) => <SelectItem key={x.kode} value={x.kode}>{x.label} ({x.n})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {/* Desktop: daftar kategori */}
      <nav aria-label="Kategori" className="hidden lg:block">
        <ul className="space-y-1 rounded-xl border bg-card p-2 shadow-sm">
          {daftarKategori.map((x) => (
            <li key={x.kode}>
              <Link href={`?kategori=${x.kode}`} aria-current={x.kode === kategori ? "page" : undefined}
                className={cn("flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm", x.kode === kategori ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-accent")}>
                <span>{x.label}</span>
                <span className={cn("rounded-full px-2 text-xs", x.kode === kategori ? "bg-primary-foreground/20" : "bg-secondary")}>{x.n}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Panel judul={k?.label ?? kategori} deskripsi={k?.ket} aksi={<Button onClick={() => setForm({ buka: true, baris: null })}><Plus /> Tambah pilihan</Button>}>
        {baris.length === 0 ? (
          <Kosong ikon={Tags} judul="Belum ada pilihan" />
        ) : (
          <ul className="divide-y rounded-lg border">
            {baris.map((b) => (
              <li key={b.kode} className={cn("flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between", !b.aktif && "bg-muted/40 text-muted-foreground")}>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="inline-flex size-7 items-center justify-center rounded bg-secondary text-xs">{b.urutan}</span>
                    {b.label}
                    {!b.aktif && <Lencana>Nonaktif</Lencana>}
                  </p>
                  <p className="text-sm text-muted-foreground">Kode: <code>{b.kode}</code>{b.keterangan ? ` · ${b.keterangan}` : ""}</p>
                </div>
                <Button variant="outline" size="sm" className="self-start sm:self-auto" onClick={() => setForm({ buka: true, baris: b })}><Pencil /> Ubah</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <FormReferensi key={`${form.baris?.kode ?? "baru"}-${form.buka}`} buka={form.buka} kategori={kategori} baris={form.baris}
        urutanBaru={Math.max(0, ...baris.map((b) => b.urutan)) + 1} onTutup={() => setForm({ buka: false, baris: null })} />
    </div>
  );
}

function FormReferensi({ buka, kategori, baris, urutanBaru, onTutup }: { buka: boolean; kategori: string; baris: BarisReferensi | null; urutanBaru: number; onTutup: () => void }) {
  const [kode, setKode] = useState("");
  const [d, setD] = useState<IsianReferensi>({ label: baris?.label ?? "", urutan: baris?.urutan ?? urutanBaru, aktif: baris?.aktif ?? true, keterangan: baris?.keterangan ?? "" });
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open={buka} onOpenChange={(b) => !b && onTutup()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{baris ? "Ubah pilihan" : "Tambah pilihan"}</DialogTitle>
          <DialogDescription>{baris ? <>Kode <code>{baris.kode}</code> tidak dapat diubah.</> : "Kode tidak dapat diubah setelah disimpan."}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); jalankan(() => (baris ? ubahReferensi(kategori, baris.kode, d) : tambahReferensi(kategori, kode, d)), { lalu: onTutup }); }}>
          {!baris && (
            <div className="space-y-1.5">
              <Label htmlFor="r-kode">Kode</Label>
              <Input id="r-kode" required value={kode} onChange={(e) => setKode(e.target.value)} placeholder="mis. surat_elektronik" />
              <p className="text-xs text-muted-foreground">Huruf kecil, angka, garis bawah. Dipakai sistem; pengguna melihat labelnya.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="r-label">Label</Label>
            <Input id="r-label" required value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-urut">Urutan tampil</Label>
            <Input id="r-urut" type="number" min={0} className="max-w-32" value={d.urutan} onChange={(e) => setD({ ...d, urutan: Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-ket">Keterangan (boleh kosong)</Label>
            <Textarea id="r-ket" rows={2} value={d.keterangan} onChange={(e) => setD({ ...d, keterangan: e.target.value })} />
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Switch checked={d.aktif} onCheckedChange={(v) => setD({ ...d, aktif: v })} />
            <span>Aktif (muncul sebagai pilihan di formulir)</span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onTutup}>Batal</Button>
            <Button type="submit" disabled={sibuk}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
