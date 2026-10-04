"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Filter, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PilihPegawai, type PegawaiRingkas } from "@/components/simpel/interaktif";
import type { FilterLaporan, KunciFilter, OpsiFilter } from "@/lib/laporan";

const kelasPilih =
  "border-input dark:bg-input/30 h-11 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const LABEL_BLOKIR: Record<string, string> = {
  kgb: "Blokir kenaikan gaji berkala",
  kp: "Blokir kenaikan pangkat",
  ik: "Pemotongan insentif kinerja",
};

export function FilterLaporanKlien({
  kode, kunci, opsi, nilai, pegawaiAwal, labelTanggal,
}: {
  kode: string;
  kunci: KunciFilter[];
  opsi: OpsiFilter;
  nilai: FilterLaporan;
  pegawaiAwal: PegawaiRingkas | null;
  labelTanggal?: string;
}) {
  const router = useRouter();
  const [sibuk, mulai] = useTransition();
  const [f, setF] = useState<FilterLaporan>(nilai);
  const [pegawai, setPegawai] = useState<PegawaiRingkas | null>(pegawaiAwal);
  const ada = (k: KunciFilter) => kunci.includes(k);
  const ubah = (k: KunciFilter, v: string) => setF((x) => ({ ...x, [k]: v || undefined }));

  function terapkan(baru: FilterLaporan) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(baru)) if (v) p.set(k, v);
    mulai(() => router.push(`/laporan/${kode}${p.size ? `?${p}` : ""}`));
  }

  if (ada("pegawai") && kunci.length === 1) {
    return (
      <div className="space-y-2">
        <Label htmlFor="pilih-pegawai">Pegawai</Label>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <PilihPegawai
              id="pilih-pegawai"
              nilai={pegawai}
              onPilih={(p) => {
                setPegawai(p);
                terapkan(p ? { pegawai: p.id } : {});
              }}
            />
          </div>
          {sibuk && <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Memuat" />}
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        terapkan(f);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ada("dari") && (
          <div className="space-y-1.5">
            <Label htmlFor="f-dari">{labelTanggal ?? "Tanggal"} dari</Label>
            <Input id="f-dari" type="date" value={f.dari ?? ""} onChange={(e) => ubah("dari", e.target.value)} />
          </div>
        )}
        {ada("sampai") && (
          <div className="space-y-1.5">
            <Label htmlFor="f-sampai">sampai dengan</Label>
            <Input id="f-sampai" type="date" value={f.sampai ?? ""} min={f.dari} onChange={(e) => ubah("sampai", e.target.value)} />
          </div>
        )}
        {ada("rezim") && (
          <div className="space-y-1.5">
            <Label htmlFor="f-rezim">Rezim</Label>
            <select id="f-rezim" className={kelasPilih} value={f.rezim ?? ""} onChange={(e) => ubah("rezim", e.target.value)}>
              <option value="">Semua rezim</option>
              {opsi.rezim.map((r) => <option key={r.kode} value={r.kode}>{r.nama}</option>)}
            </select>
          </div>
        )}
        {ada("unit") && (
          <div className="space-y-1.5">
            <Label htmlFor="f-unit">Unit kerja</Label>
            <select id="f-unit" className={kelasPilih} value={f.unit ?? ""} onChange={(e) => ubah("unit", e.target.value)}>
              <option value="">Semua unit kerja</option>
              {opsi.unit.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}
        {ada("tingkat") && (
          <div className="space-y-1.5">
            <Label htmlFor="f-tingkat">Tingkat hukuman</Label>
            <select id="f-tingkat" className={kelasPilih} value={f.tingkat ?? ""} onChange={(e) => ubah("tingkat", e.target.value)}>
              <option value="">Semua tingkat</option>
              {opsi.tingkat.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
        {ada("status") && (
          <div className="space-y-1.5">
            <Label htmlFor="f-status">Status kasus</Label>
            <select id="f-status" className={kelasPilih} value={f.status ?? ""} onChange={(e) => ubah("status", e.target.value)}>
              <option value="">Semua status berjalan</option>
              {opsi.status.map((s) => <option key={s.kode} value={s.kode}>{s.nama}</option>)}
            </select>
          </div>
        )}
        {ada("blokir") && (
          <div className="space-y-1.5">
            <Label htmlFor="f-blokir">Akibat hukuman</Label>
            <select id="f-blokir" className={kelasPilih} value={f.blokir ?? ""} onChange={(e) => ubah("blokir", e.target.value)}>
              <option value="">Semua</option>
              {Object.entries(LABEL_BLOKIR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={sibuk}>
          {sibuk ? <Loader2 className="animate-spin" aria-hidden /> : <Filter aria-hidden />} Terapkan filter
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={sibuk}
          onClick={() => {
            setF({});
            terapkan({});
          }}
        >
          <RotateCcw aria-hidden /> Atur ulang
        </Button>
      </div>
    </form>
  );
}
