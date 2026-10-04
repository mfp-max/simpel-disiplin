"use client";

import { useMemo, useState } from "react";
import { Loader2, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DialogAlasan, useAksi } from "@/components/simpel/interaktif";
import { namaBulan } from "@/lib/format";
import { FIELD_PEGAWAI } from "@/lib/simpega/normalisasi";
import { lepasFieldManual, simpanKehadiran, ubahPegawai, ubahRezim, type IsiKehadiran } from "./_aksi";

const kelasSelect =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function DialogUbahPegawai({ id, awal }: { id: string; awal: Record<string, string> }) {
  const [buka, setBuka] = useState(false);
  const [isi, setIsi] = useState(awal);
  const { jalankan, sibuk } = useAksi();
  const berubah = useMemo(() => Object.entries(isi).filter(([k, v]) => (awal[k] ?? "") !== v), [isi, awal]);

  return (
    <Dialog open={buka} onOpenChange={(b) => { setBuka(b); if (b) setIsi(awal); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Pencil /> Sunting data</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sunting data pegawai</DialogTitle>
          <DialogDescription>
            Isian yang Anda ubah ditandai “disunting manual” dan <strong>tidak akan ditimpa</strong> oleh impor Simpega berikutnya. Perubahan tercatat di log audit.
          </DialogDescription>
        </DialogHeader>
        <form
          id="form-pegawai"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            jalankan(() => ubahPegawai(id, Object.fromEntries(berubah.map(([k, v]) => [k, v || null]))), { lalu: () => setBuka(false) });
          }}
        >
          {FIELD_PEGAWAI.map((f) => (
            <div key={f.kode} className="space-y-1.5">
              <Label htmlFor={`f-${f.kode}`}>{f.label}</Label>
              {f.jenis === "jk" ? (
                <select id={`f-${f.kode}`} className={kelasSelect} value={isi[f.kode] ?? ""} onChange={(e) => setIsi({ ...isi, [f.kode]: e.target.value })}>
                  <option value="">—</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              ) : (
                <Input
                  id={`f-${f.kode}`}
                  type={f.jenis === "tanggal" ? "date" : f.jenis === "email" ? "email" : "text"}
                  inputMode={f.jenis === "nip" ? "numeric" : undefined}
                  value={isi[f.kode] ?? ""}
                  onChange={(e) => setIsi({ ...isi, [f.kode]: e.target.value })}
                  required={f.kode === "nama_lengkap_gelar"}
                  data-pii={["nip", "nip_lama", "nama_lengkap_gelar", "nama_tanpa_gelar"].includes(f.kode) ? "" : undefined}
                />
              )}
            </div>
          ))}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBuka(false)}>Batal</Button>
          <Button type="submit" form="form-pegawai" disabled={sibuk || !berubah.length}>
            {sibuk ? <Loader2 className="animate-spin" /> : <Save />} Simpan {berubah.length ? `(${berubah.length} isian)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogRezim({ id, rezim, sekarang }: { id: string; rezim: { kode: string; nama: string }[]; sekarang: string }) {
  const [buka, setBuka] = useState(false);
  const [pilih, setPilih] = useState(sekarang);
  const [alasan, setAlasan] = useState("");
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open={buka} onOpenChange={(b) => { setBuka(b); if (b) { setPilih(sekarang); setAlasan(""); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil /> Ubah rezim</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ubah rezim disiplin</DialogTitle>
          <DialogDescription>Rezim menentukan peraturan disiplin yang dipakai untuk kasus baru pegawai ini. Kasus yang sudah ada tidak berubah.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pilih-rezim">Rezim</Label>
            <select id="pilih-rezim" className={kelasSelect} value={pilih} onChange={(e) => setPilih(e.target.value)}>
              <option value="ikuti">Ikuti pemetaan status pegawai (otomatis)</option>
              {rezim.map((r) => <option key={r.kode} value={r.kode}>{r.nama} — ditetapkan manual</option>)}
              <option value="verifikasi">Perlu verifikasi — ditetapkan manual</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alasan-rezim">Alasan (wajib, tercatat di log audit)</Label>
            <Textarea id="alasan-rezim" rows={3} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. SK pengangkatan sebagai PTNA per 1 Juli 2026" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBuka(false)}>Batal</Button>
          <Button disabled={sibuk || alasan.trim().length < 5} onClick={() => jalankan(() => ubahRezim(id, pilih, alasan), { lalu: () => setBuka(false) })}>
            {sibuk && <Loader2 className="animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TombolLepasManual({ id, field, label }: { id: string; field: string; label: string }) {
  return (
    <DialogAlasan
      pemicu={<button type="button" className="inline-flex size-9 items-center justify-center rounded-full hover:bg-accent" aria-label={`Lepas tanda manual: ${label}`}><X className="size-4" /></button>}
      judul={`Lepas tanda manual “${label}”?`}
      deskripsi="Impor Simpega berikutnya akan kembali memperbarui isian ini."
      labelTombol="Lepas tanda"
      aksi={(alasan) => lepasFieldManual(id, field, alasan)}
    />
  );
}

export function GridKehadiran({ id, tahun, awal, bolehUbah }: { id: string; tahun: number; awal: IsiKehadiran[]; bolehUbah: boolean }) {
  const mulai = () => Array.from({ length: 12 }, (_, i) => {
    const a = awal.find((x) => x.bulan === i + 1);
    return { bulan: i + 1, hari: a?.jumlah_hari ? String(a.jumlah_hari) : "", berturut: a?.berturut_maks != null ? String(a.berturut_maks) : "" };
  });
  const [isi, setIsi] = useState(mulai);
  const { jalankan, sibuk } = useAksi();
  const total = isi.reduce((s, r) => s + (Number(r.hari) || 0), 0);
  const kotor = JSON.stringify(isi) !== JSON.stringify(mulai());
  const ubah = (i: number, k: "hari" | "berturut", v: string) => setIsi(isi.map((r, j) => (j === i ? { ...r, [k]: v.replace(/\D/g, "").slice(0, 2) } : r)));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        jalankan(() => simpanKehadiran(id, tahun, isi.map((r) => ({ bulan: r.bulan, jumlah_hari: r.hari ? Number(r.hari) : 0, berturut_maks: r.berturut ? Number(r.berturut) : null }))));
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {isi.map((r, i) => (
          <fieldset key={r.bulan} className="rounded-lg border p-2.5">
            <legend className="px-1 text-sm font-medium">{namaBulan(r.bulan)}</legend>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor={`h-${r.bulan}`} className="text-xs text-muted-foreground">Jumlah hari</Label>
                <Input id={`h-${r.bulan}`} inputMode="numeric" value={r.hari} placeholder="0" disabled={!bolehUbah} onChange={(e) => ubah(i, "hari", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`b-${r.bulan}`} className="text-xs text-muted-foreground">Berturut maks.</Label>
                <Input id={`b-${r.bulan}`} inputMode="numeric" value={r.berturut} placeholder="—" disabled={!bolehUbah} onChange={(e) => ubah(i, "berturut", e.target.value)} />
              </div>
            </div>
          </fieldset>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">Total {tahun}: <strong>{total} hari</strong>{kotor ? " (belum disimpan)" : ""}</p>
        {bolehUbah && (
          <Button type="submit" disabled={sibuk || !kotor}>{sibuk ? <Loader2 className="animate-spin" /> : <Save />} Simpan kehadiran</Button>
        )}
      </div>
    </form>
  );
}
