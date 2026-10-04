"use client";

import { useState } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/simpel/dasar";
import { useAksi } from "@/components/simpel/interaktif";
import { simpanGolongan, tambahGolongan, type BarisGolongan } from "./_aksi";

export function TabelGolongan({ baris }: { baris: BarisGolongan[] }) {
  const [isi, setIsi] = useState(baris);
  const [alasan, setAlasan] = useState("");
  const [baru, setBaru] = useState<BarisGolongan>({ kode: "", pangkat: "", urutan: Math.max(0, ...baris.map((b) => b.urutan)) + 1 });
  const { jalankan, sibuk } = useAksi();

  const berubah = isi.filter((b) => {
    const a = baris.find((x) => x.kode === b.kode);
    return a && (a.pangkat !== b.pangkat || Number(a.urutan) !== Number(b.urutan));
  });
  const hitung = new Map<number, number>();
  for (const b of isi) hitung.set(Number(b.urutan), (hitung.get(Number(b.urutan)) ?? 0) + 1);
  const ganda = (u: number) => (hitung.get(Number(u)) ?? 0) > 1;
  const ubah = (kode: string, f: Partial<BarisGolongan>) => setIsi(isi.map((b) => (b.kode === kode ? { ...b, ...f } : b)));

  return (
    <div className="space-y-5">
      <Panel judul={`${isi.length} golongan`}>
        <div className="mb-2 hidden grid-cols-[6rem_1fr_7rem] gap-3 px-1 text-sm font-semibold text-muted-foreground sm:grid">
          <span>Kode</span><span>Pangkat</span><span>Urutan</span>
        </div>
        <ul className="space-y-3 sm:space-y-2">
          {isi.map((b) => (
            <li key={b.kode} className="grid grid-cols-[5rem_1fr] items-center gap-x-3 gap-y-2 rounded-lg border p-3 sm:grid-cols-[6rem_1fr_7rem] sm:border-0 sm:p-1">
              <span className="font-mono font-semibold">{b.kode}</span>
              <Input aria-label={`Pangkat ${b.kode}`} value={b.pangkat} onChange={(e) => ubah(b.kode, { pangkat: e.target.value })} />
              <span className="text-sm text-muted-foreground sm:hidden">Urutan</span>
              <div>
                <Input aria-label={`Urutan ${b.kode}`} type="number" min={1} value={b.urutan} onChange={(e) => ubah(b.kode, { urutan: Number(e.target.value) })}
                  aria-invalid={ganda(b.urutan)} className="max-w-28" />
                {ganda(b.urutan) && <p className="mt-1 text-xs text-waspada">Urutan sama dengan golongan lain</p>}
              </div>
            </li>
          ))}
        </ul>
        {berubah.length > 0 && (
          <div className="mt-5 space-y-3 border-t pt-4">
            <p className="text-sm text-waspada">{berubah.length} golongan diubah: {berubah.map((b) => b.kode).join(", ")}</p>
            <div className="space-y-1.5">
              <Label htmlFor="g-alasan">Alasan perubahan (wajib, tercatat di log audit)</Label>
              <Textarea id="g-alasan" rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={sibuk || alasan.trim().length < 5} onClick={() => jalankan(() => simpanGolongan(berubah, alasan), { lalu: () => setAlasan("") })}>
                {sibuk ? <Loader2 className="animate-spin" /> : <Save />} Simpan perubahan
              </Button>
              <Button variant="ghost" onClick={() => setIsi(baris)}>Batalkan</Button>
            </div>
          </div>
        )}
      </Panel>

      <Panel judul="Tambah golongan" deskripsi="Jarang diperlukan — hanya bila ada golongan/pangkat baru dalam peraturan kepegawaian.">
        <form className="grid gap-3 sm:grid-cols-[8rem_1fr_7rem_auto] sm:items-end"
          onSubmit={(e) => { e.preventDefault(); jalankan(() => tambahGolongan(baru), { lalu: () => setBaru({ kode: "", pangkat: "", urutan: baru.urutan + 1 }) }); }}>
          <div className="space-y-1.5"><Label htmlFor="n-kode">Kode</Label><Input id="n-kode" required value={baru.kode} onChange={(e) => setBaru({ ...baru, kode: e.target.value })} placeholder="IV/f" /></div>
          <div className="space-y-1.5"><Label htmlFor="n-pangkat">Pangkat</Label><Input id="n-pangkat" required value={baru.pangkat} onChange={(e) => setBaru({ ...baru, pangkat: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="n-urut">Urutan</Label><Input id="n-urut" type="number" min={1} value={baru.urutan} onChange={(e) => setBaru({ ...baru, urutan: Number(e.target.value) })} /></div>
          <Button type="submit" variant="secondary" disabled={sibuk}><Plus /> Tambah</Button>
        </form>
      </Panel>
    </div>
  );
}
