"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Pencil, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kosong } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { useAksi } from "@/components/simpel/interaktif";
import { simpanUnit, type MasukanUnit } from "./_aksi";

export type Unit = {
  id: string; nama: string; induk_id: string | null; jenis: string | null; jabatan_pimpinan: string | null;
  punya_delegasi_hukdis_ringan: boolean; aktif: boolean; keterangan: string | null; jumlah_pegawai: number;
};

const kelasSelect =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function PohonUnit({ unit }: { unit: Unit[] }) {
  const [q, setQ] = useState("");
  const [terbuka, setTerbuka] = useState<Set<string>>(new Set());
  const [sunting, setSunting] = useState<{ unit: Unit | null; induk?: string | null } | null>(null);

  const { anak, peta, akar } = useMemo(() => {
    const peta = new Map(unit.map((u) => [u.id, u]));
    const anak = new Map<string, Unit[]>();
    const akar: Unit[] = [];
    for (const u of unit) {
      if (u.induk_id && peta.has(u.induk_id)) anak.set(u.induk_id, [...(anak.get(u.induk_id) ?? []), u]);
      else akar.push(u);
    }
    return { anak, peta, akar };
  }, [unit]);

  const jalur = (u: Unit) => {
    const out: string[] = [];
    let c = u.induk_id ? peta.get(u.induk_id) : undefined;
    for (let i = 0; c && i < 10; i++) { out.unshift(c.nama); c = c.induk_id ? peta.get(c.induk_id) : undefined; }
    return out;
  };
  const delegasiWaris = (u: Unit) => {
    let c = u.induk_id ? peta.get(u.induk_id) : undefined;
    for (let i = 0; c && i < 10; i++) { if (c.punya_delegasi_hukdis_ringan) return c.nama; c = c.induk_id ? peta.get(c.induk_id) : undefined; }
    return null;
  };

  const cari = q.trim().toLowerCase();
  const hasilCari = cari ? unit.filter((u) => u.nama.toLowerCase().includes(cari) || (u.jabatan_pimpinan ?? "").toLowerCase().includes(cari)) : [];

  const baris = (u: Unit, tingkat: number, tampilJalur = false) => {
    const sub = anak.get(u.id) ?? [];
    const buka = terbuka.has(u.id);
    const waris = !u.punya_delegasi_hukdis_ringan ? delegasiWaris(u) : null;
    return (
      <li key={u.id}>
        <div className={cn("flex items-start gap-2 py-2 pr-1", !u.aktif && "opacity-60")} style={{ paddingLeft: `${Math.min(tingkat, 4) * 1.25}rem` }}>
          {sub.length && !tampilJalur ? (
            <button type="button" aria-expanded={buka} aria-label={`${buka ? "Tutup" : "Buka"} ${u.nama}`}
              onClick={() => setTerbuka((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-accent">
              {buka ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5" />}
            </button>
          ) : <span className="size-11 shrink-0" aria-hidden />}
          <div className="min-w-0 flex-1 py-1.5">
            {tampilJalur && jalur(u).length > 0 && <p className="truncate text-xs text-muted-foreground">{jalur(u).join(" › ")}</p>}
            <p className="font-medium leading-snug">{u.nama}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {u.jenis && <Lencana>{u.jenis.replace(/_/g, " ")}</Lencana>}
              {u.punya_delegasi_hukdis_ringan && <Lencana warna="info">punya delegasi hukdis ringan</Lencana>}
              {waris && <Lencana warna="netral">delegasi dari {waris}</Lencana>}
              {!u.aktif && <Lencana warna="waspada">nonaktif</Lencana>}
              <span className="text-xs text-muted-foreground">{u.jumlah_pegawai} pegawai{sub.length ? ` · ${sub.length} subunit` : ""}</span>
            </div>
            {u.jabatan_pimpinan && <p className="mt-1 text-sm text-muted-foreground">Pimpinan: {u.jabatan_pimpinan}</p>}
          </div>
          <Button variant="ghost" size="icon" aria-label={`Ubah ${u.nama}`} onClick={() => setSunting({ unit: u })}><Pencil /></Button>
        </div>
        {buka && !tampilJalur && sub.length > 0 && (
          <ul className="border-l border-dashed" style={{ marginLeft: `${Math.min(tingkat, 4) * 1.25 + 1.35}rem` }}>
            {sub.map((s) => baris(s, 0))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama unit atau jabatan pimpinan…" className="pl-10" aria-label="Cari unit kerja" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTerbuka(terbuka.size ? new Set() : new Set(unit.filter((u) => anak.has(u.id)).map((u) => u.id)))}>
            {terbuka.size ? "Tutup semua" : "Buka semua"}
          </Button>
          <Button onClick={() => setSunting({ unit: null })}><Plus /> Tambah unit</Button>
        </div>
      </div>
      <div className="p-2 sm:p-3">
        {unit.length === 0 ? (
          <Kosong judul="Belum ada unit kerja" deskripsi="Unit kerja dibuat otomatis saat impor data pegawai, atau tambahkan secara manual." />
        ) : cari ? (
          hasilCari.length ? <ul className="divide-y">{hasilCari.map((u) => baris(u, 0, true))}</ul>
            : <p className="p-4 text-sm text-muted-foreground">Tidak ada unit yang cocok.</p>
        ) : (
          <ul className="divide-y">{akar.map((u) => baris(u, 0))}</ul>
        )}
      </div>
      {sunting && <DialogUnit unit={sunting.unit} semua={unit} anak={anak} tutup={() => setSunting(null)} />}
    </div>
  );
}

function DialogUnit({ unit, semua, anak, tutup }: { unit: Unit | null; semua: Unit[]; anak: Map<string, Unit[]>; tutup: () => void }) {
  const [isi, setIsi] = useState<MasukanUnit>({
    nama: unit?.nama ?? "", jenis: unit?.jenis ?? "", jabatan_pimpinan: unit?.jabatan_pimpinan ?? "", induk_id: unit?.induk_id ?? null,
    punya_delegasi_hukdis_ringan: unit?.punya_delegasi_hukdis_ringan ?? false, aktif: unit?.aktif ?? true, keterangan: unit?.keterangan ?? "",
  });
  const { jalankan, sibuk } = useAksi();

  const terlarang = useMemo(() => {
    const s = new Set<string>();
    if (!unit) return s;
    const tumpuk = [unit.id];
    while (tumpuk.length) { const x = tumpuk.pop()!; s.add(x); for (const a of anak.get(x) ?? []) tumpuk.push(a.id); }
    return s;
  }, [unit, anak]);

  return (
    <Dialog open onOpenChange={(b) => { if (!b) tutup(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{unit ? "Ubah unit kerja" : "Tambah unit kerja"}</DialogTitle>
          <DialogDescription>Perubahan tercatat di log audit.</DialogDescription>
        </DialogHeader>
        <form id="form-unit" className="space-y-4" onSubmit={(e) => { e.preventDefault(); jalankan(() => simpanUnit(unit?.id ?? null, isi), { lalu: tutup }); }}>
          <div className="space-y-1.5">
            <Label htmlFor="u-nama">Nama unit</Label>
            <Input id="u-nama" required value={isi.nama} onChange={(e) => setIsi({ ...isi, nama: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-induk">Unit induk</Label>
            <select id="u-induk" className={kelasSelect} value={isi.induk_id ?? ""} onChange={(e) => setIsi({ ...isi, induk_id: e.target.value || null })}>
              <option value="">— Tidak ada (unit tingkat teratas) —</option>
              {semua.filter((u) => !terlarang.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.nama}</option>)}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-jenis">Jenis</Label>
              <Input id="u-jenis" value={isi.jenis ?? ""} onChange={(e) => setIsi({ ...isi, jenis: e.target.value })} placeholder="mis. fakultas, upt, departemen" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-pimpinan">Jabatan pimpinan</Label>
              <Input id="u-pimpinan" value={isi.jabatan_pimpinan ?? ""} onChange={(e) => setIsi({ ...isi, jabatan_pimpinan: e.target.value })} placeholder="mis. Dekan" />
            </div>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="u-delegasi">Punya delegasi hukdis ringan</Label>
              <p className="text-sm text-muted-foreground">Pimpinan unit ini menerima delegasi penjatuhan hukuman disiplin ringan (Pertor 70/2026 Pasal 14 ayat 3).</p>
            </div>
            <Switch id="u-delegasi" checked={isi.punya_delegasi_hukdis_ringan} onCheckedChange={(v) => setIsi({ ...isi, punya_delegasi_hukdis_ringan: v })} />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="u-aktif">Aktif</Label>
              <p className="text-sm text-muted-foreground">Unit nonaktif tetap tersimpan untuk riwayat.</p>
            </div>
            <Switch id="u-aktif" checked={isi.aktif} onCheckedChange={(v) => setIsi({ ...isi, aktif: v })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-ket">Keterangan</Label>
            <Textarea id="u-ket" rows={2} value={isi.keterangan ?? ""} onChange={(e) => setIsi({ ...isi, keterangan: e.target.value })} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={tutup}>Batal</Button>
          <Button type="submit" form="form-unit" disabled={sibuk || !isi.nama.trim()}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
