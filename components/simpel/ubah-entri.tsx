"use client";

import { useState } from "react";
import { Loader2, Pencil, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Hasil } from "@/lib/galat";
import { Bidang } from "./form-entri";
import { PilihPegawai, useAksi, type PegawaiRingkas } from "./interaktif";

export type DefBidang = { kolom: string; label: string; jenis: "teks" | "panjang" | "tanggal" | "angka" | "pilihan"; opsi?: { kode: string; label: string }[] };

/** Dialog ubah ringkas untuk kolom-kolom sederhana sebuah entri. */
export function UbahEntri({ bidang, nilai, aksi, judul = "Ubah data" }: { bidang: DefBidang[]; nilai: Record<string, string | number | null>; aksi: (data: Record<string, string | number | null>) => Promise<Hasil<unknown>>; judul?: string }) {
  const [buka, setBuka] = useState(false);
  const [d, setD] = useState<Record<string, string | number | null>>(nilai);
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open={buka} onOpenChange={(b) => { setBuka(b); if (b) setD(nilai); }}>
      <DialogTrigger asChild><Button variant="outline"><Pencil /> Ubah</Button></DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{judul}</DialogTitle><DialogDescription>Setiap perubahan tercatat di riwayat.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {bidang.map((b) => (
            <div key={b.kolom} className={b.jenis === "panjang" ? "sm:col-span-2" : ""}>
              <Bidang label={b.label} htmlFor={`u-${b.kolom}`}>
                {b.jenis === "panjang" ? (
                  <Textarea id={`u-${b.kolom}`} rows={4} value={String(d[b.kolom] ?? "")} onChange={(e) => setD({ ...d, [b.kolom]: e.target.value })} />
                ) : b.jenis === "pilihan" ? (
                  <Select value={String(d[b.kolom] ?? "")} onValueChange={(v) => setD({ ...d, [b.kolom]: v })}>
                    <SelectTrigger id={`u-${b.kolom}`} className="w-full"><SelectValue placeholder="Pilih" /></SelectTrigger>
                    <SelectContent>{b.opsi?.map((o) => <SelectItem key={o.kode} value={o.kode}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input id={`u-${b.kolom}`} type={b.jenis === "tanggal" ? "date" : b.jenis === "angka" ? "number" : "text"} value={String(d[b.kolom] ?? "")}
                    onChange={(e) => setD({ ...d, [b.kolom]: b.jenis === "angka" ? (e.target.value ? Number(e.target.value) : null) : e.target.value })} />
                )}
              </Bidang>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBuka(false)}>Batal</Button>
          <Button disabled={sibuk} onClick={() => jalankan(() => aksi(d), { lalu: () => setBuka(false) })}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GantiPegawai({ awal, aksi }: { awal: PegawaiRingkas | null; aksi: (pegawaiId: string | null) => Promise<Hasil<unknown>> }) {
  const [buka, setBuka] = useState(false);
  const [p, setP] = useState<PegawaiRingkas | null>(awal);
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open={buka} onOpenChange={setBuka}>
      <DialogTrigger asChild><Button variant="outline"><UserRoundCog /> {awal ? "Ganti terlapor" : "Tautkan pegawai"}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Pegawai terlapor</DialogTitle><DialogDescription>Pilih dari master pegawai hasil impor Simpega.</DialogDescription></DialogHeader>
        <PilihPegawai nilai={p} onPilih={setP} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setBuka(false)}>Batal</Button>
          <Button disabled={sibuk} onClick={() => jalankan(() => aksi(p?.id ?? null), { lalu: () => setBuka(false) })}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
