"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, Loader2, Pencil, Play, Plus, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kosong } from "@/components/simpel/dasar";
import { DialogAlasan, useAksi } from "@/components/simpel/interaktif";
import { Lencana } from "@/components/simpel/lencana";
import { waktuPendek } from "@/lib/format";
import type { DefFixture } from "@/lib/regulasi/definisi";
import type { RingkasRegresi } from "@/lib/regulasi/regresi";
import { JENIS_UJI, type Baris } from "../_skema";
import { hapusBarisAksi, jalankanRegresiAksi, simpanBaris } from "../_aksi";
import { IsianJson, Pilih } from "./bidang";

export function LencanaLulus({ lulus }: { lulus: boolean | null | undefined }) {
  if (lulus === true) return <Lencana warna="aman"><CheckCircle2 className="size-3.5" /> Lulus</Lencana>;
  if (lulus === false) return <Lencana warna="lewat"><XCircle className="size-3.5" /> Gagal</Lencana>;
  return <Lencana><CircleDashed className="size-3.5" /> Belum dijalankan</Lencana>;
}

type IsianFixture = { nama: string; masukan: Record<string, unknown>; harapan: Record<string, unknown>; catatan: string | null };

/** Formulir uji regresi (kasus contoh + hasil yang benar). */
export function FormFixture({
  buka, onBuka, awal, denganAlasan, onSimpan, sibuk,
}: { buka: boolean; onBuka: (b: boolean) => void; awal: IsianFixture | null; denganAlasan: boolean; onSimpan: (f: IsianFixture, alasan: string) => void; sibuk?: boolean }) {
  const id = useId();
  const [nama, setNama] = useState("");
  const [masukan, setMasukan] = useState<unknown>({});
  const [harapan, setHarapan] = useState<unknown>({});
  const [catatan, setCatatan] = useState("");
  const [alasan, setAlasan] = useState("");
  const [versiIsian, setVersiIsian] = useState(0);
  const [galat, setGalat] = useState<string | null>(null);
  const [bukaSebelum, setBukaSebelum] = useState(false);
  if (buka !== bukaSebelum) {
    setBukaSebelum(buka);
    if (buka) {
      setNama(awal?.nama ?? "");
      setMasukan(awal?.masukan ?? JENIS_UJI[0].masukan);
      setHarapan(awal?.harapan ?? JENIS_UJI[0].harapan);
      setCatatan(awal?.catatan ?? "");
      setAlasan("");
      setGalat(null);
      setVersiIsian((v) => v + 1);
    }
  }
  const jenis = (masukan as { jenis?: string } | undefined)?.jenis;
  const info = JENIS_UJI.find((j) => j.kode === jenis);

  function simpan() {
    if (nama.trim().length < 3) return setGalat("Beri nama uji (minimal 3 huruf), mis. \"18 hari TMK → sedang jenis ke-3\".");
    if (!masukan || typeof masukan !== "object" || Array.isArray(masukan)) return setGalat("Masukan harus berupa objek JSON yang sah.");
    if (!harapan || typeof harapan !== "object" || Array.isArray(harapan) || !Object.keys(harapan).length) return setGalat("Harapan harus berupa objek JSON yang sah dan tidak kosong.");
    if (denganAlasan && alasan.trim().length < 5) return setGalat("Tuliskan alasan (minimal 5 huruf).");
    setGalat(null);
    onSimpan({ nama: nama.trim(), masukan: masukan as Record<string, unknown>, harapan: harapan as Record<string, unknown>, catatan: catatan.trim() || null }, alasan.trim());
  }

  return (
    <Dialog open={buka} onOpenChange={onBuka}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{awal ? "Sunting uji regresi" : "Tambah uji regresi"}</DialogTitle>
          <DialogDescription>Kasus contoh beserta hasil yang benar menurut bunyi peraturan. Setiap kali katalog disunting, semua uji dijalankan ulang.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-nama`}>Nama uji</Label>
            <Input id={`${id}-nama`} value={nama} onChange={(e) => setNama(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-jenis`}>Jenis uji (mengisi templat)</Label>
            <Pilih id={`${id}-jenis`} nilai={jenis ?? ""} kosong="— Pilih templat —"
              opsi={JENIS_UJI.map((j) => ({ nilai: j.kode, label: j.label }))}
              onUbah={(v) => {
                const j = JENIS_UJI.find((x) => x.kode === v);
                if (!j) return;
                setMasukan(j.masukan);
                setHarapan(j.harapan);
                setVersiIsian((x) => x + 1);
              }} />
            {info && <p className="text-sm text-muted-foreground">{info.penjelasan}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${id}-masukan`}>Masukan (JSON)</Label>
              <IsianJson key={`m${versiIsian}`} id={`${id}-masukan`} nilai={masukan} baris={6} kosongBoleh={false} onUbah={(v) => setMasukan(v)} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${id}-harapan`}>Hasil yang benar (JSON)</Label>
              <IsianJson key={`h${versiIsian}`} id={`${id}-harapan`} nilai={harapan} baris={6} kosongBoleh={false} onUbah={(v) => setHarapan(v)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-catatan`}>Catatan</Label>
            <Textarea id={`${id}-catatan`} rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </div>
          {denganAlasan && (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-alasan`}>Alasan <span className="text-lewat">*</span></Label>
              <Textarea id={`${id}-alasan`} rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
            </div>
          )}
          {galat && <p role="alert" className="text-sm font-medium text-lewat">{galat}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onBuka(false)}>Batal</Button>
          <Button onClick={simpan} disabled={sibuk}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RincianHasil({ selisih, hasil }: { selisih: string[]; hasil?: Record<string, unknown> | null }) {
  return (
    <div className="space-y-1 text-sm">
      {selisih.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-lewat">{selisih.map((s) => <li key={s}>{s}</li>)}</ul>
      )}
      {hasil && Object.keys(hasil).length > 0 && (
        <p className="break-all text-muted-foreground"><span className="font-medium">Hasil mesin:</span> {JSON.stringify(hasil)}</p>
      )}
    </div>
  );
}

/** Tab "Uji regresi" pada editor (fixture tersimpan di basis data). */
export function PanelRegresi({ regulasiId, fixture, onRegresi }: { regulasiId: string; fixture: Baris[]; onRegresi: (r: RingkasRegresi) => void }) {
  const { jalankan, sibuk } = useAksi();
  const [form, setForm] = useState<{ buka: boolean; baris: Baris | null }>({ buka: false, baris: null });
  const lulus = fixture.filter((f) => f.lulus === true).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <b>{lulus}</b> dari <b>{fixture.length}</b> uji lulus pada pemeriksaan terakhir.
          {fixture.length < 3 && <span className="text-waspada"> Disarankan sekurangnya 3 uji per peraturan.</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setForm({ buka: true, baris: null })}><Plus /> Tambah uji</Button>
          <Button
            disabled={sibuk || !fixture.length}
            onClick={() => jalankan(() => jalankanRegresiAksi(regulasiId), {
              lalu: (r) => {
                onRegresi(r);
                if (r.lulus === r.jumlah) toast.success(`Semua ${r.jumlah} uji lulus`);
                else toast.error(`${r.jumlah - r.lulus} dari ${r.jumlah} uji gagal`);
              },
            })}
          >
            {sibuk ? <Loader2 className="animate-spin" /> : <Play />} Jalankan semua uji
          </Button>
        </div>
      </div>
      {fixture.length === 0 ? (
        <Kosong judul="Belum ada uji regresi" deskripsi="Contoh: masukan {&quot;jenis&quot;: &quot;kehadiran&quot;, &quot;hari&quot;: 15}, hasil yang benar {&quot;tingkat&quot;: &quot;sedang&quot;}." />
      ) : (
        <ul className="space-y-2">
          {fixture.map((f) => {
            const h = (f.hasil_terakhir ?? null) as { hasil?: Record<string, unknown>; selisih?: string[] } | null;
            return (
              <li key={String(f.id)} className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:p-4 md:flex-row md:items-start">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium break-words">{String(f.nama)}</p>
                    <LencanaLulus lulus={f.lulus as boolean | null} />
                  </div>
                  <p className="break-all text-sm text-muted-foreground">Masukan {JSON.stringify(f.masukan)} · Harapan {JSON.stringify(f.harapan)}</p>
                  {h && <RincianHasil selisih={h.selisih ?? []} hasil={f.lulus === false ? h.hasil : null} />}
                  {!!f.dijalankan_pada && <p className="text-xs text-muted-foreground">Dijalankan {waktuPendek(String(f.dijalankan_pada))}</p>}
                  {!!f.catatan && <p className="text-sm">{String(f.catatan)}</p>}
                </div>
                <div className="flex flex-wrap gap-2 md:shrink-0">
                  <Button variant="outline" onClick={() => setForm({ buka: true, baris: f })}><Pencil /> Sunting</Button>
                  <DialogAlasan
                    pemicu={<Button variant="ghost"><Trash2 /> Hapus</Button>}
                    judul="Hapus uji regresi ini?"
                    deskripsi="Isi uji tetap tersimpan di log audit."
                    labelTombol="Hapus"
                    variant="destructive"
                    aksi={(alasan) => hapusBarisAksi({ tabel: "fixture_regresi", id: String(f.id), alasan })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <FormFixture
        buka={form.buka}
        onBuka={(b) => setForm((x) => ({ ...x, buka: b }))}
        awal={form.baris ? { nama: String(form.baris.nama), masukan: form.baris.masukan as Record<string, unknown>, harapan: form.baris.harapan as Record<string, unknown>, catatan: (form.baris.catatan as string) ?? null } : null}
        denganAlasan
        sibuk={sibuk}
        onSimpan={(isian, alasan) =>
          jalankan(() => simpanBaris({ tabel: "fixture_regresi", regulasiId, id: form.baris ? String(form.baris.id) : null, data: isian, alasan }), {
            lalu: (r) => {
              setForm((x) => ({ ...x, buka: false }));
              onRegresi(r.regresi);
            },
          })
        }
      />
    </div>
  );
}

/** Daftar uji regresi di wizard/impor (di memori). */
export function DaftarFixtureDef({ fixture, hasil, onUbah }: { fixture: DefFixture[]; hasil: RingkasRegresi; onUbah: (f: DefFixture[]) => void }) {
  const [form, setForm] = useState<{ buka: boolean; i: number | null }>({ buka: false, i: null });
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm"><b>{hasil.lulus}</b> dari <b>{hasil.jumlah}</b> uji lulus terhadap isi draf saat ini.</p>
        <Button variant="outline" onClick={() => setForm({ buka: true, i: null })}><Plus /> Tambah uji</Button>
      </div>
      {fixture.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada uji regresi. Tambahkan sekurangnya 3 kasus contoh beserta hasil yang benar.</p>
      ) : (
        <ul className="space-y-2">
          {fixture.map((f, i) => {
            const h = hasil.hasil[i];
            return (
              <li key={`${f.nama}-${i}`} className="flex flex-col gap-2 rounded-lg border bg-card p-3 md:flex-row md:items-start">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-medium break-words">{f.nama}</p><LencanaLulus lulus={h?.lulus} /></div>
                  <p className="break-all text-sm text-muted-foreground">Masukan {JSON.stringify(f.masukan)} · Harapan {JSON.stringify(f.harapan)}</p>
                  {h && !h.lulus && <RincianHasil selisih={h.selisih} hasil={h.hasil} />}
                </div>
                <div className="flex flex-wrap gap-2 md:shrink-0">
                  <Button variant="outline" onClick={() => setForm({ buka: true, i })}><Pencil /> Sunting</Button>
                  <Button variant="ghost" onClick={() => onUbah(fixture.filter((_, j) => j !== i))}><Trash2 /> Hapus</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <FormFixture
        buka={form.buka}
        onBuka={(b) => setForm((x) => ({ ...x, buka: b }))}
        awal={form.i !== null ? { ...fixture[form.i], catatan: fixture[form.i].catatan ?? null } : null}
        denganAlasan={false}
        onSimpan={(isian) => {
          onUbah(form.i !== null ? fixture.map((f, j) => (j === form.i ? isian : f)) : [...fixture, isian]);
          setForm({ buka: false, i: null });
        }}
      />
    </div>
  );
}
