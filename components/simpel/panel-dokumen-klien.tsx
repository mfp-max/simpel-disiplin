"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, Eye, FilePlus2, FileText, Loader2, Lock, MoreVertical, Printer, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAksi } from "@/components/simpel/interaktif";
import { Catatan } from "@/components/simpel/dasar";
import { PratinjauDocx, bukaJendelaCetak } from "@/components/simpel/pratinjau-docx";
import {
  buatDokumenAksi, buatUlangDokumenAksi, pratinjauDokumenAksi, siapkanDokumenAksi, tandaiFinalAksi,
} from "@/app/(app)/_aksi/dokumen";
import type { Persiapan } from "@/lib/dokumen/buat";

type Persiapkan = Omit<Persiapan, "nilai">;

const PANJANG = /uraian|faktor|kronologi|catatan|keterangan|alasan|pertimbangan|menimbang|mengingat|hasil|kesimpulan|saran/i;

function hariIniWib() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function unduh(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function keBlob(base64: string) {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/** Tombol + dialog "Buat dokumen" (PRD §7.3): isi otomatis → hanya isian kosong → pratinjau → simpan & unduh. */
export function TombolBuatDokumen({
  entriId, templateId, label, tahapanId, sesiId, varian = "outline",
}: { entriId: string; templateId: string; label: string; tahapanId?: string | null; sesiId?: string | null; varian?: "outline" | "default" | "secondary" }) {
  const [buka, setBuka] = useState(false);
  return (
    <>
      <Button type="button" variant={varian} onClick={() => setBuka(true)} className="h-auto min-h-11 justify-start whitespace-normal text-left">
        <FilePlus2 aria-hidden /> {label}
      </Button>
      {buka && <DialogBuatDokumen entriId={entriId} templateId={templateId} tahapanId={tahapanId} sesiId={sesiId} onTutup={() => setBuka(false)} />}
    </>
  );
}

function DialogBuatDokumen({
  entriId, templateId, tahapanId, sesiId, onTutup,
}: { entriId: string; templateId: string; tahapanId?: string | null; sesiId?: string | null; onTutup: () => void }) {
  const [persiapan, setPersiapan] = useState<Persiapkan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [isian, setIsian] = useState<Record<string, string>>({});
  const [nomor, setNomor] = useState("");
  const [tanggal, setTanggal] = useState(hariIniWib());
  const [final, setFinal] = useState(false);
  const [pratinjau, setPratinjau] = useState<Blob | null>(null);
  const [memuatPratinjau, setMemuatPratinjau] = useState(false);
  const { jalankan, sibuk } = useAksi();

  useEffect(() => {
    let batal = false;
    siapkanDokumenAksi({ entriId, templateId, tahapanId, sesiId })
      .then((h) => {
        if (batal) return;
        if (!h.ok) return setGalat(h.pesan);
        setPersiapan(h.data);
        setIsian(Object.fromEntries(h.data.kosong.map((k) => [k.kode, h.data.saran[k.kode] ?? ""])));
      })
      .catch(() => !batal && setGalat("Gagal terhubung ke server. Periksa sambungan internet Anda lalu coba lagi."));
    return () => {
      batal = true;
    };
  }, [entriId, templateId, tahapanId, sesiId]);

  const masukan = useMemo(
    () => ({ entriId, templateId, tahapanId: persiapan?.tahapanId ?? tahapanId ?? null, sesiId: sesiId ?? null, isian, nomor: nomor.trim() || null, tanggal: tanggal || null }),
    [entriId, templateId, tahapanId, sesiId, persiapan, isian, nomor, tanggal],
  );

  async function lihatPratinjau() {
    setMemuatPratinjau(true);
    try {
      const h = await pratinjauDokumenAksi(masukan);
      if (!h.ok) toast.error(h.pesan);
      else setPratinjau(keBlob(h.data.base64));
    } catch {
      toast.error("Gagal terhubung ke server. Periksa sambungan internet Anda lalu coba lagi.");
    } finally {
      setMemuatPratinjau(false);
    }
  }

  function simpan() {
    jalankan(() => buatDokumenAksi({ ...masukan, status: final ? "final" : "draf" }), {
      lalu: (d) => {
        unduh(d.unduh);
        onTutup();
      },
    });
  }

  const kosongBelumDiisi = persiapan?.kosong.filter((k) => !isian[k.kode]?.trim()).length ?? 0;

  return (
    <Dialog open onOpenChange={(o) => !o && !sibuk && onTutup()}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-lg">
        <DialogHeader className="border-b px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="text-lg leading-snug">{persiapan?.judul ?? "Buat dokumen"}</DialogTitle>
          <DialogDescription>
            {persiapan ? `Template versi ${persiapan.versi}. Isian yang bisa diambil dari data kasus sudah terisi otomatis.` : "Menyiapkan isian otomatis dari data kasus…"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          {!persiapan && !galat && (
            <div className="flex items-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden /> Mengambil data kasus…
            </div>
          )}
          {galat && <Catatan jenis="lewat">{galat}</Catatan>}

          {persiapan && (
            <>
              <Collapsible className="rounded-lg border">
                <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium">
                  <span>Terisi otomatis dari data kasus ({persiapan.terisi.length} isian)</span>
                  <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <dl className="max-h-72 divide-y overflow-y-auto border-t text-sm">
                    {persiapan.terisi.map((t) => (
                      <div key={t.kode} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[14rem_1fr] sm:gap-3">
                        <dt className="text-muted-foreground">{t.label}</dt>
                        <dd className="break-words font-medium" data-pii>{t.nilai || <span className="text-muted-foreground">(kosong)</span>}</dd>
                      </div>
                    ))}
                  </dl>
                </CollapsibleContent>
              </Collapsible>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nomor-surat">Nomor surat</Label>
                  <Input id="nomor-surat" value={nomor} onChange={(e) => setNomor(e.target.value)} placeholder="Boleh dikosongkan untuk diisi di Word" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tanggal-surat">Tanggal surat</Label>
                  <Input id="tanggal-surat" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
                </div>
              </div>

              {persiapan.kosong.length > 0 ? (
                <fieldset className="space-y-4">
                  <legend className="mb-1 font-semibold">Isian yang belum ada di data kasus</legend>
                  <p className="text-sm text-muted-foreground">Isian yang dikosongkan akan tampil kosong di dokumen dan bisa dilengkapi di Word.</p>
                  {persiapan.kosong.map((k) => {
                    const id = `isian-${k.kode}`;
                    const kolom = (k.field ?? []).filter((f) => f !== "nomor" && f !== "huruf");
                    const panjang = k.jenis === "loop" || PANJANG.test(k.kode) || PANJANG.test(k.label);
                    return (
                      <div key={k.kode} className="space-y-1.5">
                        <Label htmlFor={id}>{k.label}</Label>
                        {panjang ? (
                          <Textarea id={id} rows={k.jenis === "loop" ? 4 : 3} value={isian[k.kode] ?? ""} onChange={(e) => setIsian((s) => ({ ...s, [k.kode]: e.target.value }))} />
                        ) : (
                          <Input id={id} value={isian[k.kode] ?? ""} onChange={(e) => setIsian((s) => ({ ...s, [k.kode]: e.target.value }))} />
                        )}
                        {k.jenis === "loop" && (
                          <p className="text-xs text-muted-foreground">
                            Satu baris untuk satu butir; penomoran otomatis.{kolom.length > 1 ? ` Pisahkan kolom dengan tanda | (urutan: ${kolom.join(" | ")}).` : ""}
                          </p>
                        )}
                        {persiapan.saran[k.kode] && <p className="text-xs text-muted-foreground">Diisi dari dokumen sebelumnya pada kasus ini.</p>}
                      </div>
                    );
                  })}
                </fieldset>
              ) : (
                <Catatan jenis="aman">Semua isian template sudah terisi dari data kasus.</Catatan>
              )}

              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
                <Checkbox checked={final} onCheckedChange={(v) => setFinal(v === true)} className="mt-0.5" />
                <span>
                  <span className="font-medium">Langsung tandai final</span>
                  <span className="block text-muted-foreground">Isi dokumen final dibekukan dan tidak bisa diubah; perbaikan dibuat sebagai versi baru.</span>
                </span>
              </label>

              {pratinjau && <PratinjauDocx data={pratinjau} className="max-h-[70vh]" />}
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          {persiapan && kosongBelumDiisi > 0 && <p className="text-sm text-muted-foreground sm:mr-auto">{kosongBelumDiisi} isian masih kosong</p>}
          <Button type="button" variant="outline" onClick={onTutup} disabled={sibuk}>Batal</Button>
          <Button type="button" variant="secondary" onClick={lihatPratinjau} disabled={!persiapan || memuatPratinjau || sibuk}>
            {memuatPratinjau ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />} Pratinjau
          </Button>
          <Button type="button" onClick={simpan} disabled={!persiapan || sibuk}>
            {sibuk ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Simpan &amp; unduh
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Aksi untuk satu dokumen yang sudah dibuat. */
export function AksiDokumen({
  dokumen, bolehBuat, bolehUbah,
}: { dokumen: { id: string; judul: string; status: string; dariTemplate: boolean }; bolehBuat: boolean; bolehUbah: boolean }) {
  const { jalankan, sibuk } = useAksi();
  const href = `/api/dokumen/${dokumen.id}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={href}><Download aria-hidden /> Unduh .docx</a>
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => bukaJendelaCetak(`${href}?mode=cetak`, dokumen.judul)}>
        <Printer aria-hidden /> Pratinjau / PDF
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={`Aksi lain untuk ${dokumen.judul}`} disabled={sibuk}>
            {sibuk ? <Loader2 className="animate-spin" /> : <MoreVertical />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>{dokumen.judul}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {bolehUbah && dokumen.status === "draf" && (
            <DropdownMenuItem className="min-h-11" onSelect={() => jalankan(() => tandaiFinalAksi(dokumen.id))}>
              <Lock aria-hidden /> Tandai final (bekukan isi)
            </DropdownMenuItem>
          )}
          {bolehBuat && dokumen.dariTemplate && (
            <DropdownMenuItem className="min-h-11" onSelect={() => jalankan(() => buatUlangDokumenAksi(dokumen.id))}>
              <RefreshCw aria-hidden /> Buat ulang (versi baru, data terkini)
            </DropdownMenuItem>
          )}
          {dokumen.dariTemplate && (
            <>
              <DropdownMenuItem className="min-h-11" onSelect={() => bukaJendelaCetak(`${href}?mode=persis-cetak`, `${dokumen.judul} (cetak ulang persis)`)}>
                <Printer aria-hidden /> Cetak ulang persis (salinan beku)
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="min-h-11">
                <a href={`${href}?mode=persis`}><FileText aria-hidden /> Unduh ulang persis (.docx)</a>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
