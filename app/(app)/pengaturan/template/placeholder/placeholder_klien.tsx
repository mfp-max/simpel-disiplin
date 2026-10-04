"use client";

import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lencana } from "@/components/simpel/lencana";
import { useAksi } from "@/components/simpel/interaktif";
import { tambahPlaceholder, ubahPlaceholder } from "../_aksi";

export type BarisPlaceholder = {
  kode: string; label: string; kelompok: string; jenis: "teks" | "loop"; sumber: string; deskripsi: string | null; contoh: string | null;
  field: { kode: string; label: string }[] | null; aktif: boolean;
};
type Pengaturan = { kunci: string; label: string };

const KELAS_SELECT = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60";

function LencanaSumber({ sumber, pengaturan }: { sumber: string; pengaturan: Pengaturan[] }) {
  if (sumber === "bawaan") return <Lencana warna="info">Bawaan (data kasus)</Lencana>;
  if (sumber === "manual") return <Lencana warna="waspada">Isian manual</Lencana>;
  if (sumber.startsWith("pengaturan:")) {
    const k = sumber.slice(11);
    return <Lencana>Pengaturan: {pengaturan.find((p) => p.kunci === k)?.label ?? k}</Lencana>;
  }
  return <Lencana>{sumber}</Lencana>;
}

export function DaftarPlaceholder({ baris, pengaturan, jumlahPakai }: { baris: BarisPlaceholder[]; pengaturan: Pengaturan[]; jumlahPakai: Record<string, number> }) {
  const [q, setQ] = useState("");
  const [sunting, setSunting] = useState<BarisPlaceholder | "baru" | null>(null);
  const kelompok = useMemo(() => [...new Set(baris.map((b) => b.kelompok))], [baris]);
  const saring = baris.filter((b) => !q.trim() || `${b.kode} ${b.label} ${b.kelompok} ${b.deskripsi ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const grup = kelompok.map((k) => ({ k, item: saring.filter((b) => b.kelompok === k) })).filter((g) => g.item.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode atau label…" className="pl-9" aria-label="Cari placeholder" />
        </div>
        <Button onClick={() => setSunting("baru")}><Plus aria-hidden /> Tambah placeholder</Button>
      </div>

      {grup.map((g) => (
        <section key={g.k} className="rounded-xl border bg-card shadow-sm">
          <h2 className="border-b px-4 py-3 font-semibold">{g.k}</h2>
          <ul className="divide-y">
            {g.item.map((b) => (
              <li key={b.kode} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] md:items-start md:gap-4">
                <div className="min-w-0">
                  <code className="break-all font-mono text-sm font-semibold">{b.jenis === "loop" ? `{#${b.kode}}…{/${b.kode}}` : `{${b.kode}}`}</code>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <LencanaSumber sumber={b.sumber} pengaturan={pengaturan} />
                    {b.jenis === "loop" && <Lencana>Daftar</Lencana>}
                    {!b.aktif && <Lencana warna="lewat">Nonaktif</Lencana>}
                    {jumlahPakai[b.kode] ? <Lencana>{jumlahPakai[b.kode]} template</Lencana> : null}
                  </div>
                </div>
                <div className="min-w-0 space-y-0.5 text-sm">
                  <p className="font-medium">{b.label}</p>
                  {b.field?.length ? <p className="break-words text-muted-foreground">Kolom: {b.field.map((f) => `{${f.kode}}`).join(" ")}</p> : null}
                  {b.contoh && <p className="break-words text-muted-foreground">Contoh: {b.contoh}</p>}
                  {b.deskripsi && <p className="break-words text-muted-foreground">{b.deskripsi}</p>}
                </div>
                <Button variant="outline" size="sm" onClick={() => setSunting(b)} aria-label={`Sunting ${b.kode}`}>
                  <Pencil aria-hidden /> Sunting
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!grup.length && <p className="text-sm text-muted-foreground">Tidak ada placeholder yang cocok.</p>}

      {sunting && (
        <DialogPlaceholder
          key={sunting === "baru" ? "baru" : sunting.kode}
          awal={sunting === "baru" ? null : sunting}
          kelompok={kelompok}
          pengaturan={pengaturan}
          onTutup={() => setSunting(null)}
        />
      )}
    </div>
  );
}

function DialogPlaceholder({ awal, kelompok, pengaturan, onTutup }: { awal: BarisPlaceholder | null; kelompok: string[]; pengaturan: Pengaturan[]; onTutup: () => void }) {
  const bawaan = awal?.sumber === "bawaan";
  const [m, setM] = useState({
    kode: awal?.kode ?? "",
    label: awal?.label ?? "",
    kelompok: awal?.kelompok ?? "Lain-lain",
    jenis: (awal?.jenis ?? "teks") as "teks" | "loop",
    sumber: awal?.sumber ?? "manual",
    deskripsi: awal?.deskripsi ?? "",
    contoh: awal?.contoh ?? "",
    field: awal?.field?.map((f) => f.kode).join(", ") ?? "",
    aktif: awal?.aktif ?? true,
  });
  const { jalankan, sibuk } = useAksi();
  const simpan = () => jalankan(() => (awal ? ubahPlaceholder(awal.kode, m) : tambahPlaceholder(m)), { lalu: onTutup });

  return (
    <Dialog open onOpenChange={(o) => !o && onTutup()}>
      <DialogContent className="flex max-h-[100dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{awal ? "Sunting placeholder" : "Tambah placeholder"}</DialogTitle>
          <DialogDescription>{bawaan ? "Placeholder bawaan: kode dan sumber data tetap." : "Gunakan kode ini di berkas Word sebagai {kode}."}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <Label htmlFor="p-kode">Kode</Label>
            <Input id="p-kode" className="font-mono" value={m.kode} disabled={bawaan} onChange={(e) => setM({ ...m, kode: e.target.value.toLowerCase() })} placeholder="contoh: nama_saksi" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-label">Label (ditampilkan kepada pengguna)</Label>
            <Input id="p-label" value={m.label} onChange={(e) => setM({ ...m, label: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-kelompok">Kelompok</Label>
            <Input id="p-kelompok" list="daftar-kelompok" value={m.kelompok} onChange={(e) => setM({ ...m, kelompok: e.target.value })} />
            <datalist id="daftar-kelompok">{kelompok.map((k) => <option key={k} value={k} />)}</datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-sumber">Sumber nilai</Label>
            <select id="p-sumber" className={KELAS_SELECT} value={m.sumber} disabled={bawaan} onChange={(e) => setM({ ...m, sumber: e.target.value, jenis: e.target.value === "manual" ? m.jenis : "teks" })}>
              {bawaan && <option value="bawaan">Bawaan — dihitung dari data kasus</option>}
              <option value="manual">Isian manual — ditanyakan saat membuat dokumen</option>
              {pengaturan.map((p) => <option key={p.kunci} value={`pengaturan:${p.kunci}`}>Pengaturan: {p.label}</option>)}
            </select>
          </div>
          {!awal && m.sumber === "manual" && (
            <div className="space-y-1.5">
              <Label htmlFor="p-jenis">Jenis</Label>
              <select id="p-jenis" className={KELAS_SELECT} value={m.jenis} onChange={(e) => setM({ ...m, jenis: e.target.value as "teks" | "loop" })}>
                <option value="teks">Teks</option>
                <option value="loop">Daftar (perulangan baris tabel)</option>
              </select>
            </div>
          )}
          {m.jenis === "loop" && !bawaan && (
            <div className="space-y-1.5">
              <Label htmlFor="p-field">Kolom daftar (pisahkan dengan koma)</Label>
              <Input id="p-field" className="font-mono" value={m.field} onChange={(e) => setM({ ...m, field: e.target.value })} placeholder="nomor, nama, keterangan" />
              <p className="text-xs text-muted-foreground">Kolom &quot;nomor&quot; dan &quot;huruf&quot; diisi otomatis.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="p-contoh">Contoh nilai (dipakai tombol Uji)</Label>
            <Input id="p-contoh" value={m.contoh} onChange={(e) => setM({ ...m, contoh: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desk">Deskripsi</Label>
            <Textarea id="p-desk" rows={2} value={m.deskripsi} onChange={(e) => setM({ ...m, deskripsi: e.target.value })} />
          </div>
          {awal && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <Switch checked={m.aktif} onCheckedChange={(v) => setM({ ...m, aktif: v })} /> Aktif
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onTutup}>Batal</Button>
          <Button onClick={simpan} disabled={sibuk || !m.label.trim() || !m.kode.trim()}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
