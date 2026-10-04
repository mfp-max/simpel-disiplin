"use client";

import { useMemo, useState } from "react";
import { EyeOff, Lock, Pencil, Plus, ShieldCheck, ShieldQuestion, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Kosong } from "@/components/simpel/dasar";
import { DialogAlasan } from "@/components/simpel/interaktif";
import { Lencana, LencanaVerifikasi } from "@/components/simpel/lencana";
import type { Hasil } from "@/lib/galat";
import { cn } from "@/lib/utils";
import type { Baris, KonteksSkema, SkemaTabel } from "../_skema";
import { FormBaris, type PenyimpanDb, type PenyimpanDef } from "./bidang";

type Props = {
  skema: SkemaTabel;
  baris: Baris[];
  ctx: KonteksSkema;
  mode: "db" | "def";
  /** db: apakah baris sudah dipakai kasus (isi terkunci) */
  terkunci?: (b: Baris) => boolean;
  simpanDb?: PenyimpanDb;
  simpanDef?: PenyimpanDef;
  /** db: ubah kolom bebas (aktif / perlu_verifikasi) dengan alasan */
  ubahBebasDb?: (b: Baris, kolom: "aktif" | "perlu_verifikasi", nilai: boolean, alasan: string) => Promise<Hasil<unknown>>;
  /** def: ubah kolom langsung */
  ubahBebasDef?: (b: Baris, kolom: "aktif" | "perlu_verifikasi", nilai: boolean) => void;
  hapusDb?: (b: Baris, alasan: string) => Promise<Hasil<unknown>>;
  hapusDef?: (b: Baris) => void;
  bawaanBaru?: Baris;
  bolehUbah?: boolean;
};

/** Daftar baris katalog yang bisa disunting — kartu di ponsel, baris lebar di layar besar. */
export function DaftarBaris({ skema, baris, ctx, mode, terkunci, simpanDb, simpanDef, ubahBebasDb, ubahBebasDef, hapusDb, hapusDef, bawaanBaru, bolehUbah = true }: Props) {
  const [hanyaVerif, setHanyaVerif] = useState(false);
  const [lihatNonaktif, setLihatNonaktif] = useState(false);
  const [form, setForm] = useState<{ buka: boolean; baris: Baris | null }>({ buka: false, baris: null });

  const nVerif = baris.filter((b) => b.perlu_verifikasi && b.aktif !== false).length;
  const nNonaktif = baris.filter((b) => b.aktif === false).length;
  const tampil = baris.filter((b) => (!hanyaVerif || b.perlu_verifikasi) && (lihatNonaktif || b.aktif !== false));

  const kelompok = useMemo(() => {
    const m = new Map<string, Baris[]>();
    for (const b of tampil) {
      const k = skema.kelompok ? skema.kelompok(b, ctx) : "";
      m.set(k, [...(m.get(k) ?? []), b]);
    }
    return [...m.entries()];
  }, [tampil, skema, ctx]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={hanyaVerif} onCheckedChange={(c) => setHanyaVerif(c === true)} />
            Hanya yang perlu verifikasi ({nVerif})
          </label>
          {nNonaktif > 0 && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={lihatNonaktif} onCheckedChange={(c) => setLihatNonaktif(c === true)} />
              Tampilkan yang nonaktif/versi lama ({nNonaktif})
            </label>
          )}
        </div>
        {bolehUbah && (
          <Button onClick={() => setForm({ buka: true, baris: null })}><Plus /> Tambah baris</Button>
        )}
      </div>

      {tampil.length === 0 ? (
        <Kosong judul={baris.length ? "Tidak ada baris yang cocok dengan saringan" : `Belum ada ${skema.judul.toLowerCase()}`} deskripsi={baris.length ? undefined : skema.contoh} />
      ) : (
        kelompok.map(([judul, isi]) => (
          <div key={judul || "_"} className="space-y-2">
            {judul && <h3 className="pt-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{judul}</h3>}
            <ul className="space-y-2">
              {isi.map((b, i) => {
                const r = skema.ringkas(b, ctx);
                const kunci = mode === "db" ? String(b.id) : `${String(b._i)}-${i}`;
                const kunciTerkunci = mode === "db" && skema.kekal && !!terkunci?.(b);
                const nonaktif = b.aktif === false;
                return (
                  <li key={kunci} className={cn("flex flex-col gap-3 rounded-lg border bg-card p-3 sm:p-4 md:flex-row md:items-start", nonaktif && "bg-muted/50 opacity-80")}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words font-medium">{r.judul}</p>
                        {nonaktif && <Lencana><EyeOff className="size-3.5" /> {b.digantikan_oleh_id ? "Versi lama" : "Nonaktif"}</Lencana>}
                        {Number(b.versi ?? 1) > 1 && <Lencana warna="info">Versi {String(b.versi)}</Lencana>}
                        {!!b.perlu_verifikasi && <LencanaVerifikasi />}
                        {kunciTerkunci && <Lencana><Lock className="size-3.5" /> Dipakai kasus</Lencana>}
                      </div>
                      {r.sub && <p className="break-words text-sm text-muted-foreground">{r.sub}</p>}
                      {r.rincian && r.rincian.length > 0 && (
                        <dl className="grid gap-x-4 gap-y-1 pt-1 text-sm sm:grid-cols-[auto_1fr]">
                          {r.rincian.map(([l, v]) => (
                            <div key={l} className="contents">
                              <dt className="text-muted-foreground">{l}</dt>
                              <dd className="break-words">{v}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {!!b.berlaku_sampai && nonaktif && <p className="text-sm text-muted-foreground">Berlaku sampai {String(b.berlaku_sampai)}</p>}
                    </div>
                    {bolehUbah && (
                      <div className="flex flex-wrap gap-2 md:shrink-0 md:justify-end">
                        <Button variant="outline" onClick={() => setForm({ buka: true, baris: b })} aria-label={`Sunting ${r.judul}`}><Pencil /> Sunting</Button>
                        <TombolBebas mode={mode} b={b} kolom="perlu_verifikasi" judul={r.judul} ubahBebasDb={ubahBebasDb} ubahBebasDef={ubahBebasDef} />
                        {skema.punyaAktif && (mode === "db" || "aktif" in b) && (
                          <TombolBebas mode={mode} b={b} kolom="aktif" judul={r.judul} ubahBebasDb={ubahBebasDb} ubahBebasDef={ubahBebasDef} />
                        )}
                        {mode === "def" && hapusDef && (
                          <Button variant="ghost" onClick={() => hapusDef(b)} aria-label={`Hapus ${r.judul}`}><Trash2 /> Hapus</Button>
                        )}
                        {mode === "db" && hapusDb && (
                          <DialogAlasan
                            pemicu={<Button variant="ghost" aria-label={`Hapus ${r.judul}`}><Trash2 /> Hapus</Button>}
                            judul="Hapus baris ini?"
                            deskripsi="Isi baris lama tetap tersimpan di log audit."
                            labelTombol="Hapus"
                            variant="destructive"
                            aksi={(alasan) => hapusDb(b, alasan)}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}

      <FormBaris
        buka={form.buka}
        onBuka={(x) => setForm((f) => ({ ...f, buka: x }))}
        judul={skema.judul}
        kolom={skema.kolom}
        ctx={ctx}
        mode={mode}
        awal={form.baris ?? (bawaanBaru ? { ...bawaanBaru } : null)}
        baru={!form.baris}
        terkunci={!!form.baris && mode === "db" && skema.kekal && !!terkunci?.(form.baris)}
        bolehVersi={skema.versi}
        simpanDb={simpanDb}
        simpanDef={simpanDef}
      />
    </div>
  );
}

function TombolBebas({
  mode, b, kolom, judul, ubahBebasDb, ubahBebasDef,
}: { mode: "db" | "def"; b: Baris; kolom: "aktif" | "perlu_verifikasi"; judul: string; ubahBebasDb?: Props["ubahBebasDb"]; ubahBebasDef?: Props["ubahBebasDef"] }) {
  const sekarang = kolom === "aktif" ? b.aktif !== false : !!b.perlu_verifikasi;
  const label = kolom === "aktif" ? (sekarang ? "Nonaktifkan" : "Aktifkan") : sekarang ? "Tandai terverifikasi" : "Tandai perlu verifikasi";
  const Ikon = kolom === "aktif" ? (sekarang ? EyeOff : Undo2) : sekarang ? ShieldCheck : ShieldQuestion;
  if (mode === "def") {
    if (!ubahBebasDef) return null;
    return <Button variant="ghost" onClick={() => ubahBebasDef(b, kolom, !sekarang)}><Ikon /> {label}</Button>;
  }
  if (!ubahBebasDb) return null;
  return (
    <DialogAlasan
      pemicu={<Button variant="ghost"><Ikon /> {label}</Button>}
      judul={`${label}: ${judul}`}
      deskripsi={kolom === "aktif"
        ? sekarang ? "Baris nonaktif tidak dipakai untuk kasus baru, tetapi tetap tersimpan agar kasus lama tetap dapat dibaca." : "Baris akan dipakai kembali untuk kasus baru."
        : sekarang ? "Nyatakan isi baris ini sudah dicocokkan dengan naskah resmi peraturan." : "Tandai baris ini agar diperiksa bagian hukum."}
      labelTombol={label}
      aksi={(alasan) => ubahBebasDb(b, kolom, !sekarang, alasan)}
    />
  );
}
