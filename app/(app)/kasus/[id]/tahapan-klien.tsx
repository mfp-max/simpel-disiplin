"use client";

import { useState } from "react";
import { CalendarCheck, CheckCircle2, ChevronDown, Circle, CircleDashed, CircleSlash, Loader2, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BantuanPasal, DialogAlasan, useAksi } from "@/components/simpel/interaktif";
import { LencanaTenggat, type StatusTenggat } from "@/components/simpel/lencana";
import { tanggalPanjang } from "@/lib/format";
import { aturStatusTahapAksi, selesaikanTahapAksi, ubahTahapAksi } from "../_aksi";

export type TahapTampil = {
  id: string; kode: string; nama: string; status: "belum" | "berjalan" | "selesai" | "dilewati"; opsional: boolean;
  rencana: string | null; realisasi: string | null; tenggat: string | null; catatan: string | null;
  statusTenggat: StatusTenggat | null; tenggatNama: string | null; tenggatSifat: string | null; tenggatPasal: string | null; tenggatUraian: string | null;
  pasal: string | null; bantuan: string | null;
};

const IKON = { belum: Circle, berjalan: PlayCircle, selesai: CheckCircle2, dilewati: CircleSlash };
const WARNA = { belum: "text-muted-foreground", berjalan: "text-primary", selesai: "text-aman", dilewati: "text-arsip" };
const LABEL = { belum: "Belum", berjalan: "Sedang berjalan", selesai: "Selesai", dilewati: "Dilewati" };

export function DaftarTahapan({ tahap, hariIni, boleh, slotDokumen }: { tahap: TahapTampil[]; hariIni: string; boleh: { ubah: boolean; status: boolean }; slotDokumen?: Record<string, React.ReactNode> }) {
  return (
    <ol className="relative space-y-3">
      {tahap.map((t, i) => <BarisTahap key={t.id} t={t} hariIni={hariIni} boleh={boleh} terakhir={i === tahap.length - 1} dokumen={slotDokumen?.[t.kode]} />)}
    </ol>
  );
}

function BarisTahap({ t, hariIni, boleh, terakhir, dokumen }: { t: TahapTampil; hariIni: string; boleh: { ubah: boolean; status: boolean }; terakhir: boolean; dokumen?: React.ReactNode }) {
  const [buka, setBuka] = useState(t.status === "berjalan");
  const [rencana, setRencana] = useState(t.rencana ?? "");
  const [realisasi, setRealisasi] = useState(t.realisasi ?? hariIni);
  const [catatan, setCatatan] = useState(t.catatan ?? "");
  const { jalankan, sibuk } = useAksi();
  const Ikon = t.opsional && t.status === "belum" ? CircleDashed : IKON[t.status];

  return (
    <li className="relative pl-10">
      {!terakhir && <span className="absolute left-[15px] top-9 h-[calc(100%-1.25rem)] w-px bg-border" aria-hidden />}
      <Ikon className={cn("absolute left-1 top-3 size-6", WARNA[t.status])} aria-hidden />
      <Collapsible open={buka} onOpenChange={setBuka} className={cn("rounded-xl border bg-card", t.status === "berjalan" && "border-primary/50 shadow-sm")}>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between" aria-expanded={buka}>
            <span className="min-w-0">
              <span className={cn("block font-medium", t.status === "dilewati" && "text-muted-foreground line-through")}>{t.nama}</span>
              <span className="block text-sm text-muted-foreground">
                {LABEL[t.status]}{t.opsional ? " · bila perlu" : ""}
                {t.realisasi ? ` · terlaksana ${tanggalPanjang(t.realisasi)}` : t.rencana ? ` · rencana ${tanggalPanjang(t.rencana)}` : ""}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {t.statusTenggat && t.status !== "dilewati" && <LencanaTenggat status={t.status === "selesai" ? { ...t.statusTenggat, warna: "selesai", label: t.realisasi && t.tenggat && t.realisasi <= t.tenggat ? "Tepat waktu" : "Selesai" } : t.statusTenggat} />}
              <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", buka && "rotate-180")} />
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 border-t px-4 py-4">
            {(t.bantuan || t.pasal) && (
              <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm">
                <BantuanPasal judul={t.nama} pasal={t.pasal} teks={t.bantuan} />
                <p className="pt-1.5 leading-relaxed text-muted-foreground">{t.bantuan}{t.pasal ? ` (${t.pasal})` : ""}</p>
              </div>
            )}
            {t.tenggat && (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{t.tenggatNama ?? "Tenggat"}: {tanggalPanjang(t.tenggat)}</p>
                <p className="text-muted-foreground">{t.tenggatUraian}</p>
                <p className="mt-1 text-xs">
                  {t.tenggatSifat === "pengingat_internal" ? <span className="text-muted-foreground">Pengingat internal — bukan tenggat hukum.</span> : <span>Tenggat menurut peraturan{t.tenggatPasal ? `: ${t.tenggatPasal}` : ""}.</span>}
                </p>
              </div>
            )}
            {boleh.ubah && t.status !== "dilewati" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`r-${t.id}`}>Tanggal rencana</Label>
                  <Input id={`r-${t.id}`} type="date" value={rencana} onChange={(e) => setRencana(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`c-${t.id}`}>Catatan</Label>
                  <Textarea id={`c-${t.id}`} rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Button variant="outline" disabled={sibuk} onClick={() => jalankan(() => ubahTahapAksi(t.id, { tanggal_rencana: rencana || null, catatan: catatan || null }))}>
                    {sibuk && <Loader2 className="animate-spin" />} Simpan rencana & catatan
                  </Button>
                </div>
              </div>
            )}
            {dokumen}
            {boleh.status && (
              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap sm:items-end">
                {(t.status === "berjalan" || t.status === "belum") && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor={`s-${t.id}`}>Tanggal terlaksana</Label>
                      <Input id={`s-${t.id}`} type="date" value={realisasi} onChange={(e) => setRealisasi(e.target.value)} className="sm:w-48" />
                    </div>
                    <Button disabled={sibuk || !realisasi} onClick={() => jalankan(() => selesaikanTahapAksi(t.id, realisasi))}><CalendarCheck /> Tandai selesai</Button>
                  </>
                )}
                {t.status === "belum" && t.opsional && (
                  <Button variant="outline" disabled={sibuk} onClick={() => jalankan(() => aturStatusTahapAksi(t.id, "berjalan"))}><PlayCircle /> Jalankan tahap ini</Button>
                )}
                {(t.status === "belum" || t.status === "berjalan") && (
                  t.opsional ? (
                    <Button variant="ghost" disabled={sibuk} onClick={() => jalankan(() => aturStatusTahapAksi(t.id, "dilewati"))}><CircleSlash /> Tidak diperlukan</Button>
                  ) : (
                    <DialogAlasan pemicu={<Button variant="ghost"><CircleSlash /> Lewati</Button>} judul={`Lewati tahap "${t.nama}"?`} deskripsi="Tahap wajib hanya boleh dilewati dengan alasan yang dapat dipertanggungjawabkan." labelTombol="Lewati" aksi={(a) => aturStatusTahapAksi(t.id, "dilewati", a)} />
                  )
                )}
                {(t.status === "selesai" || t.status === "dilewati") && (
                  <DialogAlasan pemicu={<Button variant="ghost">Buka kembali</Button>} judul="Buka kembali tahap ini?" labelTombol="Buka kembali" aksi={(a) => aturStatusTahapAksi(t.id, "berjalan", a)} />
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
