"use client";

import { useId, useMemo, useState } from "react";
import { Braces, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Catatan } from "@/components/simpel/dasar";
import { useAksi } from "@/components/simpel/interaktif";
import { KONTEKS_TERSEDIA, uraikanKondisi } from "@/lib/hukdis/kondisi";
import type { Hasil } from "@/lib/galat";
import type { ModeUbah } from "@/lib/regulasi/admin";
import { cn } from "@/lib/utils";
import { KOLOM_BEBAS, type Baris, type Kolom, type KonteksSkema, type Opsi } from "../_skema";

// ---------------------------------------------------------------------------
// Isian dasar
// ---------------------------------------------------------------------------
export function Pilih({
  id, nilai, onUbah, opsi, kosong, disabled, className,
}: { id?: string; nilai: string; onUbah: (v: string) => void; opsi: Opsi[]; kosong?: string | null; disabled?: boolean; className?: string }) {
  return (
    <select
      id={id}
      value={nilai}
      disabled={disabled}
      onChange={(e) => onUbah(e.target.value)}
      className={cn("h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50", className)}
    >
      {kosong !== null && <option value="">{kosong ?? "— Pilih —"}</option>}
      {opsi.map((o) => (
        <option key={o.nilai} value={o.nilai}>{o.label}</option>
      ))}
      {nilai && !opsi.some((o) => o.nilai === nilai) && <option value={nilai}>{nilai}</option>}
    </select>
  );
}

/** Isian JSON dengan validasi langsung. onUbah(undefined) berarti JSON belum sah. */
export function IsianJson({ id, nilai, onUbah, baris = 4, kosongBoleh = true }: { id?: string; nilai: unknown; onUbah: (v: unknown | undefined) => void; baris?: number; kosongBoleh?: boolean }) {
  const [teks, setTeks] = useState(() => (nilai === undefined || nilai === null ? "" : JSON.stringify(nilai, null, 2)));
  const [galat, setGalat] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Textarea
        id={id}
        rows={baris}
        value={teks}
        spellCheck={false}
        className="font-mono text-sm"
        onChange={(e) => {
          const t = e.target.value;
          setTeks(t);
          if (!t.trim()) {
            setGalat(kosongBoleh ? null : "Wajib diisi.");
            onUbah(kosongBoleh ? null : undefined);
            return;
          }
          try {
            const v = JSON.parse(t);
            setGalat(null);
            onUbah(v);
          } catch {
            setGalat("Belum berupa JSON yang sah. Contoh: true, 12, \"teks\", [\"a\", \"b\"], {\"kunci\": \"nilai\"}");
            onUbah(undefined);
          }
        }}
      />
      {galat && <p className="text-sm text-lewat">{galat}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Penyusun kondisi (aturan_tahapan.kondisi & aturan_kewenangan.syarat_tambahan)
// ---------------------------------------------------------------------------
type BarisKondisi = { kunci: string; op: "sama" | "salah_satu"; nilai: string };

const kunciBool = (k: string) => (KONTEKS_TERSEDIA[k] ?? "").includes("ya/tidak");

function keBarisKondisi(k: Record<string, unknown> | null | undefined): BarisKondisi[] {
  return Object.entries(k ?? {}).map(([kunci, v]) => {
    if (kunci.endsWith("_in")) return { kunci: kunci.slice(0, -3), op: "salah_satu", nilai: Array.isArray(v) ? v.join(", ") : String(v ?? "") };
    return { kunci, op: "sama", nilai: typeof v === "boolean" ? (v ? "ya" : "tidak") : String(v ?? "") };
  });
}

function dariBarisKondisi(rows: BarisKondisi[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    const k = r.kunci.trim();
    if (!k) continue;
    if (r.op === "salah_satu") out[`${k}_in`] = r.nilai.split(",").map((x) => x.trim()).filter(Boolean);
    else if (kunciBool(k) || r.nilai === "ya" || r.nilai === "tidak") out[k] = r.nilai === "ya";
    else out[k] = r.nilai.trim();
  }
  return out;
}

export function PenyusunKondisi({ nilai, onUbah, ctx }: { nilai: Record<string, unknown> | null; onUbah: (v: Record<string, unknown> | undefined) => void; ctx: KonteksSkema }) {
  const [rows, setRows] = useState<BarisKondisi[]>(() => keBarisKondisi(nilai));
  const [modeJson, setModeJson] = useState(false);
  const objek = useMemo(() => dariBarisKondisi(rows), [rows]);
  const kunciDikenal = Object.keys(KONTEKS_TERSEDIA);
  const saranNilai = (k: string): string[] => {
    if (k === "tingkat_kode") return (ctx.opsi.kode_tingkat ?? []).map((o) => o.nilai);
    if (k === "penjatuh_peran") return (ctx.opsi.kode_peran ?? []).map((o) => o.nilai);
    if (k === "rezim_kode") return (ctx.opsi.rezim ?? []).map((o) => o.nilai);
    return [];
  };

  function ubah(next: BarisKondisi[]) {
    setRows(next);
    onUbah(dariBarisKondisi(next));
  }

  if (modeJson) {
    return (
      <div className="space-y-2 rounded-lg border p-3">
        <IsianJson nilai={objek} baris={5} onUbah={(v) => {
          if (v === undefined) return onUbah(undefined);
          if (v !== null && (typeof v !== "object" || Array.isArray(v))) return onUbah(undefined);
          setRows(keBarisKondisi((v as Record<string, unknown>) ?? {}));
          onUbah((v as Record<string, unknown>) ?? {});
        }} />
        <p className="text-sm text-muted-foreground">Bentuk: {"{\"kunci\": nilai, \"kunci_in\": [daftar]}"}. Contoh: {"{\"tingkat_kode_in\": [\"sedang\", \"berat\"], \"terperiksa_pimpinan_unit\": true}"}</p>
        <Button type="button" variant="outline" onClick={() => setModeJson(false)}>Kembali ke penyusun</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Tanpa syarat — selalu berlaku.</p>}
      {rows.map((r, i) => {
        const dikenal = kunciDikenal.includes(r.kunci);
        const saran = saranNilai(r.kunci);
        return (
          <div key={i} className="grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-start">
            <div className="space-y-1">
              <Pilih
                nilai={dikenal ? r.kunci : r.kunci ? "__lain" : ""}
                onUbah={(v) => ubah(rows.map((x, j) => (j === i ? { ...x, kunci: v === "__lain" ? "" : v, nilai: kunciBool(v) ? "ya" : x.nilai } : x)))}
                opsi={[...kunciDikenal.map((k) => ({ nilai: k, label: KONTEKS_TERSEDIA[k] })), { nilai: "__lain", label: "Kunci lain…" }]}
                kosong="— Pilih data —"
              />
              {!dikenal && (
                <Input value={r.kunci} placeholder="nama_kunci" onChange={(e) => ubah(rows.map((x, j) => (j === i ? { ...x, kunci: e.target.value } : x)))} />
              )}
            </div>
            <Pilih
              nilai={r.op}
              kosong={null}
              className="sm:w-44"
              onUbah={(v) => ubah(rows.map((x, j) => (j === i ? { ...x, op: v as BarisKondisi["op"] } : x)))}
              opsi={[{ nilai: "sama", label: "sama dengan" }, { nilai: "salah_satu", label: "salah satu dari" }]}
            />
            <div className="space-y-1">
              {kunciBool(r.kunci) && r.op === "sama" ? (
                <Pilih nilai={r.nilai} kosong={null} onUbah={(v) => ubah(rows.map((x, j) => (j === i ? { ...x, nilai: v } : x)))} opsi={[{ nilai: "ya", label: "ya" }, { nilai: "tidak", label: "tidak" }]} />
              ) : (
                <Input
                  value={r.nilai}
                  placeholder={r.op === "salah_satu" ? "pisahkan dengan koma" : "nilai"}
                  onChange={(e) => ubah(rows.map((x, j) => (j === i ? { ...x, nilai: e.target.value } : x)))}
                />
              )}
              {saran.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {saran.map((s) => (
                    <button key={s} type="button" className="min-h-9 rounded-full border px-2.5 text-xs hover:bg-accent"
                      onClick={() => ubah(rows.map((x, j) => {
                        if (j !== i) return x;
                        if (x.op === "sama") return { ...x, nilai: s };
                        const ada = x.nilai.split(",").map((y) => y.trim()).filter(Boolean);
                        return { ...x, nilai: (ada.includes(s) ? ada.filter((y) => y !== s) : [...ada, s]).join(", ") };
                      }))}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Hapus syarat" onClick={() => ubah(rows.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => ubah([...rows, { kunci: "tingkat_kode", op: "salah_satu", nilai: "" }])}><Plus /> Tambah syarat</Button>
        <Button type="button" variant="ghost" onClick={() => setModeJson(true)}><Braces /> Sunting sebagai JSON</Button>
      </div>
      <p className="text-sm"><span className="text-muted-foreground">Dibaca: </span>{uraikanKondisi(objek)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulir satu baris (dialog)
// ---------------------------------------------------------------------------
function normal(k: Kolom, v: unknown): unknown {
  if (v === undefined || v === "") return null;
  if (k.jenis === "angka") return v === null ? null : Number(v);
  if (k.jenis === "bool") return !!v;
  if (k.jenis === "kondisi" || (k.jenis === "json" && (k.kunci === "hasil" || k.kunci === "syarat_tambahan"))) return v && typeof v === "object" ? v : v ?? {};
  if (k.jenis === "daftar") return Array.isArray(v) ? v : String(v).split(",").map((x) => x.trim()).filter(Boolean);
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  return v;
}

export type PenyimpanDb = (lama: Baris | null, data: Baris, alasan: string, mode: ModeUbah) => Promise<Hasil<unknown>>;
export type PenyimpanDef = (lama: Baris | null, data: Baris) => string | null;

export function FormBaris({
  buka, onBuka, judul, kolom, ctx, mode, awal, baru, terkunci = false, bolehVersi = false, simpanDb, simpanDef, tambahan,
}: {
  buka: boolean; onBuka: (b: boolean) => void; judul: string; kolom: Kolom[]; ctx: KonteksSkema; mode: "db" | "def";
  awal: Baris | null; baru?: boolean; terkunci?: boolean; bolehVersi?: boolean; simpanDb?: PenyimpanDb; simpanDef?: PenyimpanDef; tambahan?: React.ReactNode;
}) {
  const idDasar = useId();
  const [nilai, setNilai] = useState<Baris>({});
  const [salahJson, setSalahJson] = useState<Set<string>>(new Set());
  const [alasan, setAlasan] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const { jalankan, sibuk } = useAksi();
  const lama = baru || !awal ? null : awal;
  const kolomTampil = useMemo(() => kolom.filter((k) => (mode === "def" ? k.def !== null && !k.hanyaDb : true)), [kolom, mode]);

  // Isi ulang formulir setiap kali dialog dibuka (pola "sesuaikan state saat render").
  const [bukaSebelum, setBukaSebelum] = useState(false);
  if (buka !== bukaSebelum) {
    setBukaSebelum(buka);
    if (buka) {
      setNilai({ ...(awal ?? {}) });
      setSalahJson(new Set());
      setAlasan("");
      setGalat(null);
    }
  }

  const hasil = useMemo(() => {
    const o: Baris = {};
    for (const k of kolomTampil) o[k.kunci] = normal(k, nilai[k.kunci]);
    return o;
  }, [kolomTampil, nilai]);

  const berubah = useMemo(() => {
    if (!lama) return kolomTampil.map((k) => k.kunci);
    return kolomTampil.filter((k) => JSON.stringify(normal(k, lama[k.kunci])) !== JSON.stringify(hasil[k.kunci])).map((k) => k.kunci);
  }, [lama, hasil, kolomTampil]);
  const substantif = lama ? berubah.filter((k) => !KOLOM_BEBAS.has(k)) : [];
  const perluPilihan = mode === "db" && !!lama && terkunci && substantif.length > 0;

  function periksa(): string | null {
    if (salahJson.size) return "Masih ada isian JSON yang belum sah.";
    for (const k of kolomTampil) {
      const v = hasil[k.kunci];
      if (k.wajib && (v === null || v === undefined || v === "")) return `Isian "${k.label}" wajib diisi.`;
      if (k.jenis === "angka" && v !== null && !Number.isInteger(v)) return `Isian "${k.label}" harus bilangan bulat.`;
    }
    if (lama && !berubah.length) return "Belum ada yang diubah.";
    if (mode === "db" && alasan.trim().length < 5) return "Tuliskan alasan perubahan (minimal 5 huruf).";
    return null;
  }

  function kirim(modeUbah: ModeUbah) {
    const g = periksa();
    setGalat(g);
    if (g) return;
    if (mode === "def") {
      const e = simpanDef?.(lama, hasil) ?? null;
      if (e) setGalat(e);
      else onBuka(false);
      return;
    }
    const data: Baris = lama ? Object.fromEntries(berubah.map((k) => [k, hasil[k]])) : hasil;
    jalankan(() => simpanDb!(lama, data, alasan.trim(), modeUbah), { lalu: () => onBuka(false) });
  }

  function setKolom(k: string, v: unknown) {
    setNilai((n) => ({ ...n, [k]: v }));
  }
  function tandaiJson(k: string, sah: boolean) {
    setSalahJson((s) => {
      const n = new Set(s);
      if (sah) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  return (
    <Dialog open={buka} onOpenChange={onBuka}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lama ? `Sunting ${judul.toLowerCase()}` : `Tambah ${judul.toLowerCase()}`}</DialogTitle>
          {terkunci && mode === "db" && lama && (
            <DialogDescription className="flex items-start gap-2">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              Baris ini sudah dipakai kasus. Kolom status (aktif, catatan, perlu verifikasi, peringatan, pengganti sementara, urutan) bebas diubah; perubahan isi lainnya memerlukan versi baru atau koreksi salah ketik.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {kolomTampil.map((k) => {
            const id = `${idDasar}-${k.kunci}`;
            const v = nilai[k.kunci];
            const lebar = ["teks_panjang", "json", "kondisi", "daftar"].includes(k.jenis) || k.jenis === "bool";
            const terkunciKolom = terkunci && mode === "db" && !!lama && !KOLOM_BEBAS.has(k.kunci);
            const listId = k.saran ? `${id}-saran` : undefined;
            return (
              <div key={k.kunci} className={cn("min-w-0 space-y-1.5", lebar && "sm:col-span-2")}>
                {k.jenis === "bool" ? (
                  <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5">
                    <Checkbox id={id} checked={!!v} onCheckedChange={(c) => setKolom(k.kunci, c === true)} className="mt-0.5" />
                    <span className="text-sm">{k.label}</span>
                  </label>
                ) : (
                  <Label htmlFor={id} className="flex items-center gap-1.5">
                    {k.label}{k.wajib && <span className="text-lewat">*</span>}
                    {terkunciKolom && <Lock className="size-3.5 text-muted-foreground" aria-label="isi terkunci" />}
                  </Label>
                )}
                {k.jenis === "teks" && (
                  <>
                    <Input id={id} value={String(v ?? "")} list={listId} onChange={(e) => setKolom(k.kunci, e.target.value)} />
                    {listId && (
                      <datalist id={listId}>
                        {(ctx.opsi[k.saran!] ?? []).map((o) => <option key={o.nilai} value={o.nilai}>{o.label}</option>)}
                      </datalist>
                    )}
                  </>
                )}
                {k.jenis === "teks_panjang" && <Textarea id={id} rows={3} value={String(v ?? "")} onChange={(e) => setKolom(k.kunci, e.target.value)} />}
                {k.jenis === "angka" && <Input id={id} type="number" inputMode="numeric" step={1} value={v === null || v === undefined ? "" : String(v)} onChange={(e) => setKolom(k.kunci, e.target.value)} />}
                {k.jenis === "tanggal" && <Input id={id} type="date" value={String(v ?? "")} onChange={(e) => setKolom(k.kunci, e.target.value)} />}
                {(k.jenis === "pilihan" || k.jenis === "ref") && (
                  <Pilih
                    id={id}
                    nilai={v === null || v === undefined ? "" : String(v)}
                    onUbah={(x) => setKolom(k.kunci, x)}
                    opsi={(k.pilihan ?? ctx.opsi[k.ref!] ?? []).filter((o) => !(k.kunci === "pengganti_sementara_id" && lama && (o.nilai === lama.id || o.nilai === lama.kode)))}
                    kosong={k.kosong ?? (k.wajib ? "— Pilih —" : "— Kosong —")}
                  />
                )}
                {k.jenis === "json" && (
                  <IsianJson id={id} nilai={v} onUbah={(x) => { tandaiJson(k.kunci, x !== undefined); if (x !== undefined) setKolom(k.kunci, x); }} />
                )}
                {k.jenis === "kondisi" && (
                  <PenyusunKondisi nilai={(v as Record<string, unknown>) ?? {}} ctx={ctx} onUbah={(x) => { tandaiJson(k.kunci, x !== undefined); if (x !== undefined) setKolom(k.kunci, x); }} />
                )}
                {k.jenis === "daftar" && (
                  <>
                    <Input id={id} value={Array.isArray(v) ? v.join(", ") : String(v ?? "")} onChange={(e) => setKolom(k.kunci, e.target.value)} />
                    {k.saran && (ctx.opsi[k.saran] ?? []).length > 0 && (
                      <details className="text-sm">
                        <summary className="min-h-9 cursor-pointer py-1 text-muted-foreground">Lihat kode yang tersedia</summary>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(ctx.opsi[k.saran] ?? []).map((o) => (
                            <button key={o.nilai} type="button" className="min-h-9 rounded-full border px-2.5 text-xs hover:bg-accent" title={o.label}
                              onClick={() => {
                                const ada = (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim()).filter(Boolean);
                                setKolom(k.kunci, (ada.includes(o.nilai) ? ada.filter((x) => x !== o.nilai) : [...ada, o.nilai]).join(", "));
                              }}>
                              {o.nilai}
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )}
                {k.bantuan && <p className="text-sm text-muted-foreground">{k.bantuan}</p>}
              </div>
            );
          })}
          {tambahan && <div className="sm:col-span-2">{tambahan}</div>}
          {mode === "db" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${idDasar}-alasan`}>Alasan perubahan <span className="text-lewat">*</span></Label>
              <Textarea id={`${idDasar}-alasan`} rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. menyesuaikan naskah resmi JDIH Pasal 8 ayat (3)" />
              <p className="text-sm text-muted-foreground">Dicatat di log audit beserta nilai sebelum dan sesudah.</p>
            </div>
          )}
        </div>
        {perluPilihan && (
          <Catatan jenis="waspada" judul="Isi baris ini sudah dipakai kasus">
            Anda mengubah: {substantif.map((k) => kolomTampil.find((x) => x.kunci === k)?.label ?? k).join(", ")}. Pilih salah satu:
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {bolehVersi && <li><b>Simpan sebagai versi baru</b> — baris lama dinonaktifkan (tetap tersimpan untuk kasus lama), baris baru dipakai kasus berikutnya. Pilih ini bila bunyi peraturan memang berubah.</li>}
              <li><b>Koreksi salah ketik</b> — baris diperbaiki di tempat. Hanya untuk kesalahan ketik yang tidak mengubah makna.</li>
              {!bolehVersi && <li>Untuk perubahan makna pada bagian ini, buat <b>versi baru seluruh peraturan</b> (tombol di bagian atas halaman).</li>}
            </ul>
          </Catatan>
        )}
        {galat && <p role="alert" className="text-sm font-medium text-lewat">{galat}</p>}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onBuka(false)}>Batal</Button>
          {perluPilihan ? (
            <>
              <Button type="button" variant="secondary" disabled={sibuk} onClick={() => kirim("koreksi")}>{sibuk && <Loader2 className="animate-spin" />} Koreksi salah ketik</Button>
              {bolehVersi && <Button type="button" disabled={sibuk} onClick={() => kirim("versi_baru")}>{sibuk && <Loader2 className="animate-spin" />} Simpan sebagai versi baru</Button>}
            </>
          ) : (
            <Button type="button" disabled={sibuk} onClick={() => kirim("biasa")}>{sibuk && <Loader2 className="animate-spin" />} {lama ? "Simpan" : "Tambah"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
