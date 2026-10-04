"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/simpel/dasar";
import { useAksi } from "@/components/simpel/interaktif";
import { simpanPengaturan, type Perubahan } from "./_aksi";

export type BarisPengaturan = { kunci: string; label: string; keterangan: string | null; nilai: unknown; diubah: string | null };

function jenis(v: unknown) {
  if (v === null || v === undefined) return "string";
  if (Array.isArray(v)) return "array";
  return typeof v === "object" ? "object" : typeof v;
}

function keTeks(v: unknown) {
  const j = jenis(v);
  if (j === "object" || j === "array") return JSON.stringify(v, null, 2);
  if (v === null || v === undefined) return "";
  return String(v);
}

export function FormPengaturan({ judul, deskripsi, baris }: { judul: string; deskripsi: string; baris: BarisPengaturan[] }) {
  const awal = Object.fromEntries(baris.map((b) => [b.kunci, jenis(b.nilai) === "boolean" ? b.nilai : keTeks(b.nilai)])) as Record<string, string | boolean>;
  const [isi, setIsi] = useState(awal);
  const [galat, setGalat] = useState<Record<string, string>>({});
  const { jalankan, sibuk } = useAksi();
  const berubah = baris.filter((b) => isi[b.kunci] !== awal[b.kunci]);

  function simpan(e: React.FormEvent) {
    e.preventDefault();
    const g: Record<string, string> = {};
    const perubahan: Perubahan[] = [];
    for (const b of berubah) {
      const j = jenis(b.nilai);
      const v = isi[b.kunci];
      if (j === "object" || j === "array") {
        try {
          perubahan.push({ kunci: b.kunci, nilai: JSON.parse(String(v)) });
        } catch {
          g[b.kunci] = "Format JSON tidak valid. Periksa tanda kurung kurawal, tanda kutip, dan koma.";
        }
      } else if (j === "number") {
        perubahan.push({ kunci: b.kunci, nilai: Number(v) });
      } else {
        perubahan.push({ kunci: b.kunci, nilai: v });
      }
    }
    setGalat(g);
    if (Object.keys(g).length) return;
    jalankan(() => simpanPengaturan(perubahan));
  }

  return (
    <Panel judul={judul} deskripsi={deskripsi}>
      <form onSubmit={simpan} className="space-y-5">
        {baris.map((b) => {
          const j = jenis(b.nilai);
          const id = `set-${b.kunci}`;
          const v = isi[b.kunci];
          return (
            <div key={b.kunci} className="space-y-1.5">
              {j === "boolean" ? (
                <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3">
                  <Switch id={id} checked={!!v} onCheckedChange={(c) => setIsi({ ...isi, [b.kunci]: c })} />
                  <span className="font-medium">{b.label}</span>
                </label>
              ) : (
                <Label htmlFor={id} className="text-[15px]">{b.label}</Label>
              )}
              {j === "number" && (
                <Input id={id} type="number" inputMode="numeric" min={0} className="max-w-48" value={String(v)} onChange={(e) => setIsi({ ...isi, [b.kunci]: e.target.value })} />
              )}
              {(j === "object" || j === "array") && (
                <Textarea id={id} rows={Math.min(10, String(v).split("\n").length + 1)} className="font-mono text-sm" value={String(v)} onChange={(e) => setIsi({ ...isi, [b.kunci]: e.target.value })} aria-invalid={!!galat[b.kunci]} />
              )}
              {j === "string" && (String(awal[b.kunci]).length > 70 ? (
                <Textarea id={id} rows={2} value={String(v)} onChange={(e) => setIsi({ ...isi, [b.kunci]: e.target.value })} />
              ) : (
                <Input id={id} value={String(v)} inputMode={b.kunci.startsWith("nip_") ? "numeric" : undefined} onChange={(e) => setIsi({ ...isi, [b.kunci]: e.target.value })}
                  placeholder={b.kunci.startsWith("nip_") ? "18 angka" : undefined} />
              ))}
              {galat[b.kunci] && <p className="text-sm font-medium text-lewat">{galat[b.kunci]}</p>}
              {b.keterangan && <p className="text-sm text-muted-foreground">{b.keterangan}</p>}
              {b.diubah && <p className="text-xs text-muted-foreground">{b.diubah}</p>}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button type="submit" disabled={sibuk || !berubah.length}>{sibuk ? <Loader2 className="animate-spin" /> : <Save />} Simpan {judul.toLowerCase()}</Button>
          {berubah.length > 0 && (
            <>
              <span className="text-sm text-waspada">{berubah.length} perubahan belum disimpan</span>
              <Button type="button" variant="ghost" onClick={() => { setIsi(awal); setGalat({}); }}>Batalkan</Button>
            </>
          )}
        </div>
      </form>
    </Panel>
  );
}
