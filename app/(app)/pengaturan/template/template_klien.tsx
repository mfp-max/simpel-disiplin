"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileUp, FlaskConical, Loader2, Plus, Save, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { unggahLangsung, useAksi } from "@/components/simpel/interaktif";
import { Catatan } from "@/components/simpel/dasar";
import type { Pemetaan } from "@/lib/dokumen/template";
import {
  aktifkanVersi, konfirmasiUnggahTemplate, siapkanUnggahTemplate, simpanMetadataTemplate, simpanPemetaan, tambahTemplate, ujiVersi,
} from "./_aksi";

type Opsi = { kode: string; label: string };
const KELAS_SELECT = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function unduhBase64(base64: string, nama: string) {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function TambahTemplate({ jenis }: { jenis: Opsi[] }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [nama, setNama] = useState("");
  const [kode, setKode] = useState("");
  const [kodeDisunting, setKodeDisunting] = useState(false);
  const [jenisDok, setJenisDok] = useState(jenis[0]?.kode ?? "lainnya");
  const { jalankan, sibuk } = useAksi();
  const kodeOtomatis = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return (
    <Dialog open={buka} onOpenChange={setBuka}>
      <DialogTrigger asChild>
        <Button><Plus aria-hidden /> Tambah template</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[100dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tambah template dokumen</DialogTitle>
          <DialogDescription>Setelah disimpan, unggah berkas .docx sebagai versi pertama lalu petakan placeholdernya.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-nama">Nama template</Label>
            <Input id="t-nama" value={nama} onChange={(e) => { setNama(e.target.value); if (!kodeDisunting) setKode(kodeOtomatis(e.target.value)); }} placeholder="Contoh: Surat Teguran Pembinaan" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-kode">Kode (unik, tidak dapat diubah)</Label>
            <Input id="t-kode" value={kode} onChange={(e) => { setKode(e.target.value); setKodeDisunting(true); }} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-jenis">Jenis dokumen</Label>
            <select id="t-jenis" className={KELAS_SELECT} value={jenisDok} onChange={(e) => setJenisDok(e.target.value)}>
              {jenis.map((j) => <option key={j.kode} value={j.kode}>{j.label}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBuka(false)}>Batal</Button>
          <Button
            disabled={sibuk || !nama.trim() || !kode.trim()}
            onClick={() => jalankan(() => tambahTemplate({ kode, nama, jenis_dokumen: jenisDok }), { lalu: (id) => { setBuka(false); router.push(`/pengaturan/template/${id}`); } })}
          >
            {sibuk && <Loader2 className="animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GrupCentang({ legenda, keterangan, opsi, nilai, onUbah }: { legenda: string; keterangan?: string; opsi: Opsi[]; nilai: string[]; onUbah: (v: string[]) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legenda}</legend>
      {keterangan && <p className="text-xs text-muted-foreground">{keterangan}</p>}
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {opsi.map((o) => (
          <label key={o.kode} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-accent">
            <Checkbox checked={nilai.includes(o.kode)} onCheckedChange={(c) => onUbah(c === true ? [...nilai, o.kode] : nilai.filter((x) => x !== o.kode))} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FormMetadata({
  id, awal, jenis, rezim, tingkat, tahap,
}: {
  id: string;
  awal: { nama: string; jenis_dokumen: string; rezim_kode: string[]; tingkat_kode: string[]; tahap_kode: string[]; aktif: boolean; keterangan: string | null };
  jenis: Opsi[]; rezim: Opsi[]; tingkat: Opsi[]; tahap: Opsi[];
}) {
  const [m, setM] = useState({ ...awal, keterangan: awal.keterangan ?? "" });
  const { jalankan, sibuk } = useAksi();
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => { e.preventDefault(); jalankan(() => simpanMetadataTemplate(id, m)); }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="m-nama">Nama template</Label>
          <Input id="m-nama" value={m.nama} onChange={(e) => setM({ ...m, nama: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-jenis">Jenis dokumen</Label>
          <select id="m-jenis" className={KELAS_SELECT} value={m.jenis_dokumen} onChange={(e) => setM({ ...m, jenis_dokumen: e.target.value })}>
            {!jenis.some((j) => j.kode === m.jenis_dokumen) && <option value={m.jenis_dokumen}>{m.jenis_dokumen}</option>}
            {jenis.map((j) => <option key={j.kode} value={j.kode}>{j.label}</option>)}
          </select>
        </div>
      </div>
      <GrupCentang legenda="Rezim" keterangan="Tidak dicentang sama sekali = berlaku untuk semua rezim (A dan B)." opsi={rezim} nilai={m.rezim_kode} onUbah={(v) => setM({ ...m, rezim_kode: v })} />
      <GrupCentang legenda="Tingkat hukuman yang relevan" keterangan="Kosong = semua tingkat." opsi={tingkat} nilai={m.tingkat_kode} onUbah={(v) => setM({ ...m, tingkat_kode: v })} />
      <GrupCentang legenda="Ditawarkan pada tahap kasus" keterangan="Tombol pembuatan dokumen muncul di kartu tahap yang dicentang." opsi={tahap} nilai={m.tahap_kode} onUbah={(v) => setM({ ...m, tahap_kode: v })} />
      <div className="space-y-1.5">
        <Label htmlFor="m-ket">Keterangan</Label>
        <Textarea id="m-ket" rows={2} value={m.keterangan} onChange={(e) => setM({ ...m, keterangan: e.target.value })} />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <Switch checked={m.aktif} onCheckedChange={(v) => setM({ ...m, aktif: v })} />
        <span><span className="font-medium">Template aktif</span> — ditawarkan kepada pengguna di halaman kasus</span>
      </label>
      <Button type="submit" disabled={sibuk}>{sibuk ? <Loader2 className="animate-spin" /> : <Save />} Simpan pengaturan</Button>
    </form>
  );
}

export function UnggahVersi({ templateId }: { templateId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [proses, setProses] = useState(false);
  async function tangani(f: File | undefined) {
    if (!f) return;
    setProses(true);
    try {
      let hasil: { id: string; versi: number } | null = null;
      await unggahLangsung(f, f.name, (info) => siapkanUnggahTemplate(templateId, info), async (info) => {
        const h = await konfirmasiUnggahTemplate(templateId, info);
        if (h.ok) hasil = h.data;
        return h;
      });
      const v = hasil as { id: string; versi: number } | null;
      toast.success(`Versi ${v?.versi ?? "baru"} terunggah. Periksa pemetaan placeholder, tekan Uji, lalu jadikan aktif.`);
      router.push(`/pengaturan/template/${templateId}${v ? `?versi=${v.id}` : ""}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProses(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <label className={cn("flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center hover:border-primary/60 hover:bg-accent/50", proses && "pointer-events-none opacity-60")}>
      {proses ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : <FileUp className="size-6 text-muted-foreground" aria-hidden />}
      <span className="font-medium">{proses ? "Mengunggah & memindai…" : "Unggah berkas .docx sebagai versi baru"}</span>
      <span className="text-sm text-muted-foreground">Versi lama tetap tersimpan. Maks. 15 MB.</span>
      <input ref={input} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(e) => tangani(e.target.files?.[0])} />
    </label>
  );
}

export function AksiVersi({ templateId, versiId, aktif }: { templateId: string; versiId: string; aktif: boolean }) {
  const { jalankan, sibuk } = useAksi();
  const [menguji, setMenguji] = useState(false);
  async function uji() {
    setMenguji(true);
    try {
      const h = await ujiVersi(versiId);
      if (!h.ok) toast.error(h.pesan);
      else {
        unduhBase64(h.data.base64, h.data.nama);
        toast.success("Dokumen uji diunduh. Periksa tata letaknya di Word.");
      }
    } catch {
      toast.error("Gagal terhubung ke server. Periksa sambungan internet Anda lalu coba lagi.");
    } finally {
      setMenguji(false);
    }
  }
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={uji} disabled={menguji}>
        {menguji ? <Loader2 className="animate-spin" /> : <FlaskConical aria-hidden />} Uji
      </Button>
      {!aktif && (
        <Button type="button" size="sm" disabled={sibuk} onClick={() => jalankan(() => aktifkanVersi(templateId, versiId))}>
          {sibuk ? <Loader2 className="animate-spin" /> : <Star aria-hidden />} Jadikan aktif
        </Button>
      )}
    </>
  );
}

export type BarisPemetaan = {
  kode: string; jenis: "teks" | "loop"; field: string[]; dikenal: boolean; saran: string | null;
  fieldBermasalah: { field: string; saran: string | null }[];
};
export type GrupKatalog = { kelompok: string; item: { kode: string; label: string; jenis: string }[] };

export function EditorPemetaan({
  versiId, versi, terkunci, jumlahDokumen, baris, katalog, awal,
}: { versiId: string; versi: number; terkunci: boolean; jumlahDokumen: number; baris: BarisPemetaan[]; katalog: GrupKatalog[]; awal: Pemetaan }) {
  const [peta, setPeta] = useState<Pemetaan>(() => {
    const p: Pemetaan = {};
    for (const b of baris) p[b.kode] = awal[b.kode] ?? (b.dikenal ? { sumber: "katalog", katalog: b.kode } : { sumber: "manual", label: b.kode.replace(/_/g, " ") });
    return p;
  });
  const { jalankan, sibuk } = useAksi();
  const jenisKatalog = useMemo(() => new Map(katalog.flatMap((g) => g.item.map((i) => [i.kode, i] as const))), [katalog]);
  const label = (kode: string) => jenisKatalog.get(kode)?.label ?? kode;
  const masalah = baris.filter((b) => !b.dikenal && peta[b.kode]?.sumber === "manual").length + baris.reduce((n, b) => n + b.fieldBermasalah.length, 0);

  return (
    <div className="space-y-4">
      {terkunci ? (
        <Catatan jenis="waspada" judul="Pemetaan terkunci">
          Versi {versi} sudah dipakai {jumlahDokumen} dokumen. Pemetaannya tidak boleh diubah agar dokumen lama dapat dibuat ulang persis.
          Untuk mengubah pemetaan, unggah ulang berkas yang sama sebagai versi baru (bagian Versi di atas), petakan, uji, lalu jadikan aktif.
        </Catatan>
      ) : (
        <Catatan jenis="info">
          Pemetaan dapat diubah sampai versi ini dipakai untuk membuat dokumen. Placeholder yang tidak dikenal katalog ditandai kuning —
          pilih sumber data yang benar atau jadikan <strong>isian manual</strong> (pengguna ditanya saat membuat dokumen).
        </Catatan>
      )}
      {masalah > 0 && !terkunci && <p className="text-sm font-medium text-waspada">{masalah} penanda perlu diperiksa.</p>}
      <ul className="divide-y rounded-lg border">
        {baris.map((b) => {
          const pm = peta[b.kode];
          const nilaiSelect = pm?.sumber === "katalog" ? `katalog:${pm.katalog}` : "manual";
          const jenisCocok = pm?.sumber !== "katalog" || b.jenis !== "loop" || jenisKatalog.get(pm.katalog)?.jenis === "loop" || b.field.every((f) => jenisKatalog.has(f));
          const tandai = !b.dikenal || b.fieldBermasalah.length > 0 || !jenisCocok;
          return (
            <li key={b.kode} className={cn("grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]", tandai && "bg-waspada-muda/60")}>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {tandai ? <AlertTriangle className="size-4 text-waspada" aria-label="Perlu diperiksa" /> : <CheckCircle2 className="size-4 text-aman" aria-label="Dikenal" />}
                  <code className="break-all font-mono text-sm font-semibold">{b.jenis === "loop" ? `{#${b.kode}}…{/${b.kode}}` : `{${b.kode}}`}</code>
                </div>
                {b.field.length > 0 && <p className="break-words text-xs text-muted-foreground">Kolom: {b.field.map((f) => `{${f}}`).join(" ")}</p>}
                {!b.dikenal && (
                  <p className="text-sm">
                    Tidak ada di katalog.
                    {b.saran && (
                      <>
                        {" "}Mungkin maksud Anda <code className="font-mono font-semibold">{`{${b.saran}}`}</code>?{" "}
                        {!terkunci && (
                          <Button type="button" variant="link" className="h-auto min-h-11 p-0 sm:min-h-0" onClick={() => setPeta({ ...peta, [b.kode]: { sumber: "katalog", katalog: b.saran! } })}>
                            Pakai sumber ini
                          </Button>
                        )}
                      </>
                    )}
                  </p>
                )}
                {b.fieldBermasalah.map((f) => (
                  <p key={f.field} className="text-sm">
                    Kolom <code className="font-mono">{`{${f.field}}`}</code> tidak dikenal{f.saran ? <> — mungkin maksud Anda <code className="font-mono font-semibold">{`{${f.saran}}`}</code>? Perbaiki di berkas Word.</> : "."}
                  </p>
                ))}
                {!jenisCocok && <p className="text-sm">Penanda berupa perulangan, tetapi sumber yang dipilih bukan daftar.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`pm-${b.kode}`} className="sr-only">Sumber data untuk {b.kode}</Label>
                <select
                  id={`pm-${b.kode}`}
                  className={KELAS_SELECT}
                  value={nilaiSelect}
                  disabled={terkunci}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPeta({ ...peta, [b.kode]: v === "manual" ? { sumber: "manual", label: pm?.sumber === "manual" ? pm.label : label(b.kode).replace(/_/g, " ") } : { sumber: "katalog", katalog: v.slice(8) } });
                  }}
                >
                  <option value="manual">Isian manual (ditanyakan saat membuat dokumen)</option>
                  {katalog.map((g) => (
                    <optgroup key={g.kelompok} label={g.kelompok}>
                      {g.item.map((i) => <option key={i.kode} value={`katalog:${i.kode}`}>{i.label} — {i.kode}{i.jenis === "loop" ? " (daftar)" : ""}</option>)}
                    </optgroup>
                  ))}
                </select>
                {pm?.sumber === "manual" && (
                  <Input aria-label={`Label pertanyaan untuk ${b.kode}`} value={pm.label} disabled={terkunci} onChange={(e) => setPeta({ ...peta, [b.kode]: { sumber: "manual", label: e.target.value } })} placeholder="Label yang ditampilkan kepada pengguna" />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!terkunci && baris.length > 0 && (
        <Button type="button" disabled={sibuk} onClick={() => jalankan(() => simpanPemetaan(versiId, peta))}>
          {sibuk ? <Loader2 className="animate-spin" /> : <Save />} Simpan pemetaan versi {versi}
        </Button>
      )}
    </div>
  );
}
