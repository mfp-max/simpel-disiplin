"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Hasil } from "@/lib/galat";
import type { MasukanEntriSederhana } from "@/app/(app)/_aksi/entri";
import { PilihPegawai, useAksi, type PegawaiRingkas } from "./interaktif";

type Opsi = { kode: string; label: string };
export type OpsiRegulasi = { id: string; nama_singkat: string; rezim_kode: string | null; berlaku_dari: string | null; berlaku_sampai: string | null; jenis: { id: string; nama: string; tingkat: string }[] };

export function Bidang({ label, htmlFor, wajib, keterangan, children }: { label: string; htmlFor?: string; wajib?: boolean; keterangan?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[15px]">
        {label} {wajib && <span className="text-lewat" aria-label="wajib">*</span>}
      </Label>
      {children}
      {keterangan && <p className="text-sm text-muted-foreground">{keterangan}</p>}
    </div>
  );
}

/** Formulir pembuatan entri Informasi / Pembinaan / Arsip — satu kolom di ponsel. */
export function FormEntriBaru({
  kelas, aksi, sumber = [], jenisNonHukdis = [], kelengkapan = [], regulasi = [], awal, kembaliKe,
}: {
  kelas: "informasi" | "non_hukdis" | "arsip";
  aksi: (m: MasukanEntriSederhana) => Promise<Hasil<string>>;
  sumber?: Opsi[]; jenisNonHukdis?: Opsi[]; kelengkapan?: Opsi[]; regulasi?: OpsiRegulasi[];
  awal?: Partial<MasukanEntriSederhana> & { pegawai?: PegawaiRingkas | null };
  kembaliKe: string;
}) {
  const router = useRouter();
  const { jalankan, sibuk } = useAksi();
  const kunciDraf = `simpel-draf-${kelas}`;
  const [m, setM] = useState<MasukanEntriSederhana>({ kelas, judul: "", ...awal });
  const [pegawai, setPegawai] = useState<PegawaiRingkas | null>(awal?.pegawai ?? null);
  const [pakaiNamaBebas, setPakaiNamaBebas] = useState(kelas === "arsip" && !awal?.pegawai);

  // Simpan otomatis draf di perangkat (formulir panjang tidak hilang bila tertutup)
  useEffect(() => {
    if (awal) return;
    try {
      const d = localStorage.getItem(kunciDraf);
      if (d) setM((x) => ({ ...x, ...JSON.parse(d), kelas }));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try { localStorage.setItem(kunciDraf, JSON.stringify(m)); } catch {}
  }, [m, kunciDraf]);

  const set = <K extends keyof MasukanEntriSederhana>(k: K, v: MasukanEntriSederhana[K]) => setM((x) => ({ ...x, [k]: v }));
  const regTerpilih = regulasi.find((r) => r.id === m.regulasiId);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    await jalankan(() => aksi({ ...m, pegawaiId: pakaiNamaBebas ? null : pegawai?.id ?? null }), {
      lalu: (id) => {
        try { localStorage.removeItem(kunciDraf); } catch {}
        router.push(`${kembaliKe}/${id}`);
      },
      segarkan: false,
    });
  }

  return (
    <form onSubmit={kirim} className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <h2 className="font-semibold">{kelas === "arsip" ? "Data minimum (wajib)" : "Inti"}</h2>
        {kelas === "arsip" ? (
          <>
            <Bidang label="Pegawai" wajib keterangan="Pilih dari master pegawai, atau ketik nama bila pegawai sudah tidak ada di master.">
              <div className="flex items-center gap-2 pb-1">
                <Switch id="nama-bebas" checked={pakaiNamaBebas} onCheckedChange={setPakaiNamaBebas} />
                <Label htmlFor="nama-bebas" className="font-normal">Ketik nama manual (tidak ada di master)</Label>
              </div>
              {pakaiNamaBebas ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input aria-label="Nama pegawai" placeholder="Nama pegawai" value={m.namaPegawaiBebas ?? ""} onChange={(e) => set("namaPegawaiBebas", e.target.value)} />
                  <Input aria-label="NIP (bila ada)" placeholder="NIP (bila ada)" value={m.nipBebas ?? ""} onChange={(e) => set("nipBebas", e.target.value)} inputMode="numeric" />
                </div>
              ) : (
                <PilihPegawai nilai={pegawai} onPilih={setPegawai} />
              )}
            </Bidang>
            <div className="grid gap-4 sm:grid-cols-2">
              <Bidang label="Tahun kejadian" htmlFor="tahun" wajib>
                <Input id="tahun" type="number" inputMode="numeric" min={1950} max={2100} value={m.tahunPeristiwa ?? ""} onChange={(e) => set("tahunPeristiwa", e.target.value ? Number(e.target.value) : null)} />
              </Bidang>
              <Bidang label="Tanggal kejadian (bila diketahui)" htmlFor="tgl">
                <Input id="tgl" type="date" value={m.tanggalPeristiwa ?? ""} onChange={(e) => { set("tanggalPeristiwa", e.target.value); if (e.target.value) set("tahunPeristiwa", Number(e.target.value.slice(0, 4))); }} />
              </Bidang>
            </div>
            <Bidang label="Uraian singkat (satu baris)" htmlFor="judul" wajib keterangan="Contoh: Tidak masuk kerja 30 hari tanpa keterangan.">
              <Input id="judul" value={m.judul} onChange={(e) => set("judul", e.target.value)} />
            </Bidang>
          </>
        ) : (
          <>
            <Bidang label={kelas === "informasi" ? "Judul / pokok informasi" : "Judul pembinaan"} htmlFor="judul" wajib keterangan={kelas === "informasi" ? "Contoh: Surat Dekan FT perihal dugaan pungutan di luar ketentuan" : undefined}>
              <Input id="judul" value={m.judul} onChange={(e) => set("judul", e.target.value)} autoFocus />
            </Bidang>
            {kelas === "informasi" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Bidang label="Sumber informasi" htmlFor="sumber">
                  <Select value={m.sumberInformasi ?? ""} onValueChange={(v) => set("sumberInformasi", v)}>
                    <SelectTrigger id="sumber" className="w-full"><SelectValue placeholder="Pilih sumber" /></SelectTrigger>
                    <SelectContent>{sumber.map((s) => <SelectItem key={s.kode} value={s.kode}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Bidang>
                <Bidang label="Tanggal peristiwa (bila diketahui)" htmlFor="tgl">
                  <Input id="tgl" type="date" value={m.tanggalPeristiwa ?? ""} onChange={(e) => set("tanggalPeristiwa", e.target.value)} />
                </Bidang>
              </div>
            )}
            {kelas === "non_hukdis" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Bidang label="Jenis pembinaan" htmlFor="jenis" wajib>
                  <Select value={m.jenisNonHukdis ?? ""} onValueChange={(v) => set("jenisNonHukdis", v)}>
                    <SelectTrigger id="jenis" className="w-full"><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
                    <SelectContent>{jenisNonHukdis.map((s) => <SelectItem key={s.kode} value={s.kode}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Bidang>
                <Bidang label="Tanggal" htmlFor="tgl">
                  <Input id="tgl" type="date" value={m.tanggalPeristiwa ?? ""} onChange={(e) => set("tanggalPeristiwa", e.target.value)} />
                </Bidang>
              </div>
            )}
            <Bidang label={kelas === "informasi" ? "Pegawai terlapor (bila sudah teridentifikasi)" : "Pegawai"} wajib={kelas === "non_hukdis"}>
              <PilihPegawai nilai={pegawai} onPilih={setPegawai} />
              {kelas === "informasi" && !pegawai && (
                <Input className="mt-2" aria-label="Nama terlapor bila belum ada di master" placeholder="…atau ketik nama terlapor bila belum jelas" value={m.namaPegawaiBebas ?? ""} onChange={(e) => set("namaPegawaiBebas", e.target.value)} />
              )}
            </Bidang>
          </>
        )}
        <Bidang label={kelas === "arsip" ? "Kronologi / keterangan (opsional)" : "Ringkasan"} htmlFor="ringkasan">
          <Textarea id="ringkasan" rows={5} value={m.ringkasan ?? ""} onChange={(e) => set("ringkasan", e.target.value)} />
        </Bidang>
      </section>

      {kelas === "informasi" && (
        <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
          <h2 className="font-semibold">Pelapor (opsional)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Bidang label="Nama pelapor" htmlFor="pelapor"><Input id="pelapor" value={m.pelaporNama ?? ""} onChange={(e) => set("pelaporNama", e.target.value)} /></Bidang>
            <Bidang label="Kontak pelapor" htmlFor="kontak"><Input id="kontak" value={m.pelaporKontak ?? ""} onChange={(e) => set("pelaporKontak", e.target.value)} /></Bidang>
          </div>
          <p className="text-sm text-muted-foreground">Bukti (surat, foto, rekap presensi) dapat diunggah setelah informasi disimpan.</p>
        </section>
      )}

      {kelas === "arsip" && (
        <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
          <h2 className="font-semibold">Keterangan tambahan (semua opsional)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Bidang label="Peraturan yang dipakai saat itu" htmlFor="reg" keterangan="Kasus dinilai dengan aturan yang berlaku saat perbuatan terjadi.">
              <Select value={m.regulasiId ?? ""} onValueChange={(v) => { set("regulasiId", v); set("jenisHukumanId", null); }}>
                <SelectTrigger id="reg" className="w-full"><SelectValue placeholder="Pilih peraturan" /></SelectTrigger>
                <SelectContent>
                  {regulasi.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.nama_singkat} ({r.berlaku_dari?.slice(0, 4) ?? "?"}–{r.berlaku_sampai?.slice(0, 4) ?? "kini"})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Bidang>
            <Bidang label="Jenis hukuman yang dijatuhkan" htmlFor="jh">
              {regTerpilih?.jenis.length ? (
                <Select value={m.jenisHukumanId ?? ""} onValueChange={(v) => set("jenisHukumanId", v)}>
                  <SelectTrigger id="jh" className="w-full"><SelectValue placeholder="Pilih jenis hukuman" /></SelectTrigger>
                  <SelectContent>
                    {regTerpilih.jenis.map((j) => <SelectItem key={j.id} value={j.id}>{j.tingkat} — {j.nama}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input id="jh" placeholder="Ketik jenis hukuman" value={m.jenisHukumanBebas ?? ""} onChange={(e) => set("jenisHukumanBebas", e.target.value)} />
              )}
            </Bidang>
            <Bidang label="Pasal yang dilanggar (teks bebas)" htmlFor="pasal">
              <Input id="pasal" placeholder="mis. Pasal 3 angka 11 PP 53/2010" value={m.pasalTeksBebas ?? ""} onChange={(e) => set("pasalTeksBebas", e.target.value)} />
            </Bidang>
            <Bidang label="Kelengkapan berkas" htmlFor="lengkap">
              <Select value={m.kelengkapanBerkas ?? ""} onValueChange={(v) => set("kelengkapanBerkas", v)}>
                <SelectTrigger id="lengkap" className="w-full"><SelectValue placeholder="Pilih" /></SelectTrigger>
                <SelectContent>{kelengkapan.map((s) => <SelectItem key={s.kode} value={s.kode}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </Bidang>
            <Bidang label="Nomor SK" htmlFor="nosk"><Input id="nosk" value={m.nomorSk ?? ""} onChange={(e) => set("nomorSk", e.target.value)} /></Bidang>
            <Bidang label="Tanggal SK" htmlFor="tglsk"><Input id="tglsk" type="date" value={m.tanggalSk ?? ""} onChange={(e) => set("tanggalSk", e.target.value)} /></Bidang>
          </div>
        </section>
      )}

      <div className="sticky bottom-20 z-10 flex flex-col-reverse gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:justify-end md:bottom-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>Batal</Button>
        <Button type="submit" size="lg" disabled={sibuk}>
          {sibuk ? <Loader2 className="animate-spin" /> : <Save />} Simpan
        </Button>
      </div>
    </form>
  );
}
