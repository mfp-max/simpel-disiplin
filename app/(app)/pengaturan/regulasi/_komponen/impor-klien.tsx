"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileJson, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Catatan } from "@/components/simpel/dasar";
import { useAksi } from "@/components/simpel/interaktif";
import { FORMAT_DEFINISI, type DefinisiRegulasi } from "@/lib/regulasi/definisi";
import { pratinjauImporAksi, simpanImporAksi, type PratinjauImpor } from "../_aksi";
import { LencanaLulus } from "./regresi-klien";

/** Impor definisi peraturan dari berkas JSON (PRD §18.6): periksa → pratinjau → simpan. */
export function ImporDefinisi() {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [teks, setTeks] = useState("");
  const [def, setDef] = useState<DefinisiRegulasi | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pratinjau, setPratinjau] = useState<PratinjauImpor | null>(null);
  const [kodeBaru, setKodeBaru] = useState("");
  const [draf, setDraf] = useState(true);
  const [alasan, setAlasan] = useState("");
  const { jalankan, sibuk } = useAksi();

  function atur() {
    setTeks(""); setDef(null); setGalat(null); setPratinjau(null); setKodeBaru(""); setDraf(true); setAlasan("");
  }

  function siapkan(): DefinisiRegulasi | null {
    let d: DefinisiRegulasi;
    try {
      d = JSON.parse(teks);
    } catch {
      setGalat("Isi berkas bukan JSON yang sah.");
      return null;
    }
    if (!d || d.format !== FORMAT_DEFINISI) {
      setGalat(`Berkas bukan definisi peraturan SIMPEL (kolom "format" harus "${FORMAT_DEFINISI}").`);
      return null;
    }
    const k = kodeBaru.trim();
    return { ...d, regulasi: { ...d.regulasi, kode: k || d.regulasi.kode, status: draf ? "draf" : d.regulasi.status } };
  }

  function periksa() {
    setGalat(null);
    const d = siapkan();
    if (!d) return;
    setDef(d);
    jalankan(() => pratinjauImporAksi(d), { segarkan: false, lalu: (p) => setPratinjau(p) });
  }

  return (
    <Dialog open={buka} onOpenChange={(b) => { setBuka(b); if (!b) atur(); }}>
      <DialogTrigger asChild><Button variant="outline"><Upload /> Impor definisi (JSON)</Button></DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Impor definisi peraturan</DialogTitle>
          <DialogDescription>Berkas JSON hasil &quot;Ekspor JSON&quot; atau disusun di luar sistem. Isi diperiksa dan diuji lebih dulu; tidak ada yang tersimpan sebelum Anda menekan Simpan. Peraturan yang sudah ada tidak pernah ditimpa.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="impor-berkas">Pilih berkas .json</Label>
            <Input id="impor-berkas" type="file" accept=".json,application/json" className="h-auto py-2"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 900_000) return setGalat("Berkas terlalu besar (maks. ±900 KB).");
                setTeks(await f.text());
                setPratinjau(null);
                setGalat(null);
              }} />
          </div>
          <details>
            <summary className="min-h-9 cursor-pointer text-sm text-muted-foreground">…atau tempel isi JSON</summary>
            <Textarea rows={6} className="mt-2 font-mono text-sm" value={teks} onChange={(e) => { setTeks(e.target.value); setPratinjau(null); }} spellCheck={false} />
          </details>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="impor-kode">Ganti kode (opsional)</Label>
              <Input id="impor-kode" value={kodeBaru} onChange={(e) => { setKodeBaru(e.target.value); setPratinjau(null); }} placeholder="Biarkan kosong untuk kode dari berkas" />
            </div>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 self-end rounded-md border px-3 py-2.5 text-sm">
              <Checkbox checked={draf} onCheckedChange={(c) => { setDraf(c === true); setPratinjau(null); }} className="mt-0.5" />
              Simpan sebagai draf (disarankan — aktifkan setelah diperiksa)
            </label>
          </div>
          {galat && <p role="alert" className="text-sm font-medium text-lewat">{galat}</p>}
          <Button variant="outline" disabled={!teks.trim() || sibuk} onClick={periksa}>
            {sibuk && !pratinjau ? <Loader2 className="animate-spin" /> : <FileJson />} Periksa isi berkas
          </Button>

          {pratinjau && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="font-semibold">{pratinjau.nama_singkat} — {pratinjau.judul}</p>
              <p className="text-sm text-muted-foreground">Kode {pratinjau.kode}</p>
              <p className="text-sm">{pratinjau.jumlah.map(([l, n]) => `${n} ${l.toLowerCase()}`).join(" · ")}</p>
              {pratinjau.kodeSudahAda && (
                <Catatan jenis="lewat" judul="Kode sudah dipakai">
                  Kode {pratinjau.kode} sudah dipakai oleh {pratinjau.kodeSudahAda}. Isi kolom &quot;Ganti kode&quot; dengan kode baru (mis. {pratinjau.kode}_V2), lalu periksa ulang.
                </Catatan>
              )}
              {pratinjau.galat.length > 0 && (
                <Catatan jenis="lewat" judul="Harus diperbaiki">
                  <ul className="list-disc pl-5">{pratinjau.galat.map((g) => <li key={g}>{g}</li>)}</ul>
                </Catatan>
              )}
              {pratinjau.peringatan.length > 0 && (
                <Catatan jenis="waspada" judul="Peringatan">
                  <ul className="list-disc pl-5">{pratinjau.peringatan.map((g) => <li key={g}>{g}</li>)}</ul>
                </Catatan>
              )}
              <div>
                <p className="text-sm font-medium">Uji regresi bawaan berkas: {pratinjau.regresi.lulus} dari {pratinjau.regresi.jumlah} lulus</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {pratinjau.regresi.hasil.map((h, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2"><LencanaLulus lulus={h.lulus} /> {h.nama}{!h.lulus && <span className="text-lewat">— {h.selisih.join("; ")}</span>}</li>
                  ))}
                </ul>
              </div>
              {!pratinjau.kodeSudahAda && !pratinjau.galat.length && (
                <div className="space-y-1.5">
                  <Label htmlFor="impor-alasan">Alasan impor (wajib)</Label>
                  <Textarea id="impor-alasan" rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. definisi telah ditinjau Bagian Hukum tanggal …" />
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setBuka(false)}>Batal</Button>
          <Button
            disabled={!pratinjau || !!pratinjau.kodeSudahAda || pratinjau.galat.length > 0 || alasan.trim().length < 5 || sibuk || !def}
            onClick={() => jalankan(() => simpanImporAksi(def, alasan.trim()), {
              lalu: (h) => { setBuka(false); atur(); router.push(`/pengaturan/regulasi/${h.regulasiId}`); },
            })}
          >
            {sibuk && pratinjau && <Loader2 className="animate-spin" />} Simpan sebagai peraturan baru
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
