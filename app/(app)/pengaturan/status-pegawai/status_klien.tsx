"use client";

import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2, Pencil, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Catatan, Panel } from "@/components/simpel/dasar";
import { Lencana, LencanaRezim } from "@/components/simpel/lencana";
import { useAksi } from "@/components/simpel/interaktif";
import { simpanPemetaan, terapkanUlang } from "./_aksi";

export type BarisStatus = { status_pegawai: string; rezim_kode: string | null; keterangan: string | null; jumlah: number; manual: number };
type Rezim = { kode: string; nama: string };

const kelasSelect =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function DaftarStatus({ baris, takDikenal, rezim, perluTerapkan }: { baris: BarisStatus[]; takDikenal: { status: string; jumlah: number }[]; rezim: Rezim[]; perluTerapkan: number }) {
  const [sunting, setSunting] = useState<{ lama: BarisStatus | null; status?: string } | null>(null);
  const { jalankan, sibuk } = useAksi();
  const namaRezim = (k: string | null) => rezim.find((r) => r.kode === k)?.nama ?? null;

  return (
    <>
      <Panel
        judul="Pemetaan status → rezim"
        aksi={<>
          <Button variant="outline" onClick={() => setSunting({ lama: null })}><Plus /> Tambah status</Button>
          <Button disabled={sibuk} onClick={() => jalankan(terapkanUlang, { lalu: (d) => toast.success(d.berubah ? `Rezim ${d.berubah} pegawai diperbarui.` : "Semua pegawai sudah sesuai pemetaan.") })}>
            {sibuk ? <Loader2 className="animate-spin" /> : <RefreshCw />} Terapkan ulang ke pegawai
          </Button>
        </>}
      >
        {perluTerapkan > 0 && (
          <div className="mb-4">
            <Catatan jenis="waspada">{perluTerapkan} pegawai memiliki rezim yang belum sesuai pemetaan terbaru. Tekan “Terapkan ulang ke pegawai”.</Catatan>
          </div>
        )}
        <ul className="divide-y">
          {baris.map((b) => (
            <li key={b.status_pegawai} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{b.status_pegawai}</span>
                  <LencanaRezim kode={b.rezim_kode} nama={namaRezim(b.rezim_kode)} />
                </div>
                {b.keterangan && <p className="text-sm text-muted-foreground">{b.keterangan}</p>}
                <p className="text-sm">
                  <Link href={`/pegawai?status=${encodeURIComponent(b.status_pegawai)}`} className="underline">{b.jumlah} pegawai</Link>
                  {b.manual > 0 && <span className="text-muted-foreground"> · {b.manual} dengan rezim manual</span>}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Ubah ${b.status_pegawai}`} onClick={() => setSunting({ lama: b })}><Pencil /></Button>
            </li>
          ))}
        </ul>
      </Panel>

      {takDikenal.length > 0 && (
        <Panel judul="Status di data pegawai yang belum dipetakan" deskripsi="Pegawai dengan status ini berezim “perlu verifikasi”.">
          <ul className="divide-y">
            {takDikenal.map((t) => (
              <li key={t.status} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-medium">{t.status}</span> <Lencana warna="waspada">{t.jumlah} pegawai</Lencana></span>
                <Button variant="outline" onClick={() => setSunting({ lama: null, status: t.status })}><Plus /> Petakan</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {sunting && <DialogStatus lama={sunting.lama} statusAwal={sunting.status} rezim={rezim} tutup={() => setSunting(null)} />}
    </>
  );
}

function DialogStatus({ lama, statusAwal, rezim, tutup }: { lama: BarisStatus | null; statusAwal?: string; rezim: Rezim[]; tutup: () => void }) {
  const [status, setStatus] = useState(lama?.status_pegawai ?? statusAwal ?? "");
  const [kode, setKode] = useState(lama?.rezim_kode ?? "");
  const [ket, setKet] = useState(lama?.keterangan ?? "");
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open onOpenChange={(b) => { if (!b) tutup(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lama ? `Ubah pemetaan “${lama.status_pegawai}”` : "Tambah status pegawai"}</DialogTitle>
          <DialogDescription>Tulis status persis seperti di kolom “Status Pegawai” Simpega. Perubahan tercatat di log audit.</DialogDescription>
        </DialogHeader>
        <form id="form-status" className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); jalankan(() => simpanPemetaan({ statusLama: lama?.status_pegawai ?? null, status, rezim: kode || null, keterangan: ket }), { lalu: tutup }); }}>
          <div className="space-y-1.5">
            <Label htmlFor="s-status">Status pegawai</Label>
            <Input id="s-status" required value={status} disabled={!!lama} onChange={(e) => setStatus(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-rezim">Rezim</Label>
            <select id="s-rezim" className={kelasSelect} value={kode} onChange={(e) => setKode(e.target.value)}>
              {rezim.map((r) => <option key={r.kode} value={r.kode}>{r.nama}</option>)}
              <option value="">Perlu verifikasi (tanpa rezim otomatis)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-ket">Keterangan</Label>
            <Textarea id="s-ket" rows={2} value={ket} onChange={(e) => setKet(e.target.value)} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={tutup}>Batal</Button>
          <Button type="submit" form="form-status" disabled={sibuk || !status.trim()}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
