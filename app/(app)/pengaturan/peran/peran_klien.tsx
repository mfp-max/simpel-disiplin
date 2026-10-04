"use client";

import { useState } from "react";
import { Check, Loader2, Minus, Pencil, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lencana } from "@/components/simpel/lencana";
import { useAksi } from "@/components/simpel/interaktif";
import { cn } from "@/lib/utils";
import { simpanPeran, tambahPeran, type IsianPeran } from "./_aksi";

const DAFTAR_HAK = [
  { k: "boleh_buat", label: "Mencatat data baru", ket: "Mencatat informasi, kasus, pembinaan, dan arsip baru; mengunggah berkas; membuat dokumen." },
  { k: "boleh_ubah", label: "Mengubah data", ket: "Menyunting isi informasi, kasus, pembinaan, dan arsip yang sudah ada." },
  { k: "boleh_ubah_status", label: "Mengubah status & tahapan", ket: "Menyelesaikan tahap, menaikkan informasi menjadi kasus, menghentikan kasus." },
  { k: "boleh_arsipkan", label: "Mengarsipkan", ket: "Menyembunyikan data dari daftar dengan alasan tertulis (bukan hapus permanen)." },
  { k: "boleh_lihat_audit", label: "Melihat log audit", ket: "Membuka jejak siapa membuka, mengubah, dan mengunduh apa." },
  { k: "kelola_pengaturan", label: "Mengelola pengaturan", ket: "Pengguna, peran, peraturan, template, hari libur, dan data induk." },
  { k: "boleh_musnahkan", label: "Memusnahkan data", ket: "Penghapusan permanen sesuai jadwal retensi. Sangat jarang dipakai; selalu tercatat." },
] as const;

type KunciHak = (typeof DAFTAR_HAK)[number]["k"];
export type BarisPeran = { kode: string; nama: string; urutan: number; keterangan: string | null; jumlah: number } & Record<KunciHak, boolean>;

export function DaftarPeran({ peran, peranSaya }: { peran: BarisPeran[]; peranSaya: string }) {
  const [edit, setEdit] = useState<{ buka: boolean; baris: BarisPeran | null }>({ buka: false, baris: null });
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEdit({ buka: true, baris: null })}><Plus /> Tambah peran</Button>
      </div>
      <ul className="grid gap-4 lg:grid-cols-2">
        {peran.map((r) => (
          <li key={r.kode} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                  <ShieldCheck className="size-5 text-primary" aria-hidden /> {r.nama}
                  {r.kode === peranSaya && <Lencana warna="info">Peran Anda</Lencana>}
                </p>
                <p className="text-sm text-muted-foreground">Kode: {r.kode} · {r.jumlah} pengguna aktif</p>
                {r.keterangan && <p className="mt-1 text-sm">{r.keterangan}</p>}
              </div>
              <Button variant="outline" size="sm" onClick={() => setEdit({ buka: true, baris: r })}><Pencil /> Ubah</Button>
            </div>
            <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
              {DAFTAR_HAK.map((h) => (
                <li key={h.k} className={cn("flex items-center gap-2 text-sm", !r[h.k] && "text-muted-foreground")}>
                  {r[h.k] ? <Check className="size-4 shrink-0 text-aman" aria-label="Boleh" /> : <Minus className="size-4 shrink-0" aria-label="Tidak" />}
                  {h.label}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <FormPeran key={edit.baris?.kode ?? (edit.buka ? "baru" : "tutup")} buka={edit.buka} baris={edit.baris} onTutup={() => setEdit({ buka: false, baris: null })} />
    </div>
  );
}

function FormPeran({ buka, baris, onTutup }: { buka: boolean; baris: BarisPeran | null; onTutup: () => void }) {
  const [kode, setKode] = useState("");
  const [alasan, setAlasan] = useState("");
  const [d, setD] = useState<IsianPeran>(() => ({
    nama: baris?.nama ?? "", keterangan: baris?.keterangan ?? "", urutan: baris?.urutan ?? 10,
    boleh_buat: baris?.boleh_buat ?? false, boleh_ubah: baris?.boleh_ubah ?? false, boleh_ubah_status: baris?.boleh_ubah_status ?? false,
    boleh_arsipkan: baris?.boleh_arsipkan ?? false, kelola_pengaturan: baris?.kelola_pengaturan ?? false,
    boleh_musnahkan: baris?.boleh_musnahkan ?? false, boleh_lihat_audit: baris?.boleh_lihat_audit ?? false,
  }));
  const { jalankan, sibuk } = useAksi();

  function simpan(e: React.FormEvent) {
    e.preventDefault();
    jalankan(() => (baris ? simpanPeran(baris.kode, d, alasan) : tambahPeran(kode, d)), { lalu: onTutup });
  }

  return (
    <Dialog open={buka} onOpenChange={(b) => !b && onTutup()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{baris ? `Ubah peran ${baris.nama}` : "Tambah peran baru"}</DialogTitle>
          <DialogDescription>Nyalakan hak yang boleh dimiliki pengguna dengan peran ini.</DialogDescription>
        </DialogHeader>
        <form onSubmit={simpan} className="space-y-4">
          {!baris && (
            <div className="space-y-1.5">
              <Label htmlFor="r-kode">Kode peran</Label>
              <Input id="r-kode" required value={kode} onChange={(e) => setKode(e.target.value)} placeholder="mis. sekretaris" />
              <p className="text-xs text-muted-foreground">Huruf kecil tanpa spasi. Tidak dapat diubah setelah dibuat.</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-1.5">
              <Label htmlFor="r-nama">Nama peran</Label>
              <Input id="r-nama" required value={d.nama} onChange={(e) => setD({ ...d, nama: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-urut">Urutan</Label>
              <Input id="r-urut" type="number" min={0} value={d.urutan} onChange={(e) => setD({ ...d, urutan: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-ket">Keterangan</Label>
            <Textarea id="r-ket" rows={2} value={d.keterangan} onChange={(e) => setD({ ...d, keterangan: e.target.value })} />
          </div>
          <fieldset className="space-y-1">
            <legend className="mb-1 text-sm font-semibold">Hak akses</legend>
            <p className="mb-2 text-sm text-muted-foreground">Melihat semua kasus selalu diizinkan untuk setiap peran.</p>
            {DAFTAR_HAK.map((h) => (
              <label key={h.k} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-accent">
                <Switch className="mt-1" checked={d[h.k]} onCheckedChange={(v) => setD({ ...d, [h.k]: v })} />
                <span>
                  <span className="block font-medium">{h.label}</span>
                  <span className="block text-sm text-muted-foreground">{h.ket}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {baris && (
            <div className="space-y-1.5">
              <Label htmlFor="r-alasan">Alasan perubahan (wajib, tercatat di log audit)</Label>
              <Textarea id="r-alasan" rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. Kasi kini juga boleh mengarsipkan sesuai disposisi Direktur" />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onTutup}>Batal</Button>
            <Button type="submit" disabled={sibuk || (!!baris && alasan.trim().length < 5)}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
