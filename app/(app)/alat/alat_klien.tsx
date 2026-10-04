"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Calculator, CalendarCheck2, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lencana } from "@/components/simpel/lencana";
import { useAksi } from "@/components/simpel/interaktif";
import { buatKalender, geserHari, isAkhirPekan, tambahHariKerja } from "@/lib/hari-kerja";
import { labelKode, namaHari, tanggalPanjang, tanggalPendek } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HariDilewati, HasilKalkulatorAmbang, HasilKalkulatorBerlaku, RegulasiPilihan } from "@/lib/laporan";
import { hitungAmbangKehadiran, hitungBerlakuSk } from "./_aksi";

const kelasPilih =
  "border-input dark:bg-input/30 h-11 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type Rezim = { kode: string; nama: string };

function Kotak({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border bg-muted/40 p-4", className)}>{children}</div>;
}

function DaftarDilewati({ dilewati }: { dilewati: HariDilewati[] }) {
  if (!dilewati.length) return <p className="text-sm text-muted-foreground">Tidak ada akhir pekan atau hari libur yang dilewati.</p>;
  const libur = dilewati.filter((d) => d.alasan !== "Sabtu" && d.alasan !== "Minggu");
  const akhirPekan = dilewati.length - libur.length;
  return (
    <details className="text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center font-medium text-primary">
        {dilewati.length} hari dilewati: {akhirPekan} hari akhir pekan{libur.length ? `, ${libur.length} hari libur/cuti bersama` : ""}
      </summary>
      <ul className="mt-1 grid gap-1 sm:grid-cols-2">
        {dilewati.map((d) => (
          <li key={d.tanggal} className="flex gap-2">
            <span className="w-32 shrink-0 tabular-nums text-muted-foreground">{namaHari(d.tanggal).slice(0, 3)}, {tanggalPendek(d.tanggal)}</span>
            <span className={cn(d.alasan !== "Sabtu" && d.alasan !== "Minggu" && "font-medium")}>{d.alasan}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Centang({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input id={id} type="checkbox" className="size-5 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function PilihRezimRegulasi({
  idAwalan, rezim, regulasi, nilaiRezim, nilaiReg, setRezim, setReg,
}: { idAwalan: string; rezim: Rezim[]; regulasi: RegulasiPilihan[]; nilaiRezim: string; nilaiReg: string; setRezim: (v: string) => void; setReg: (v: string) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idAwalan}-rezim`}>Rezim pegawai</Label>
        <select id={`${idAwalan}-rezim`} className={kelasPilih} value={nilaiRezim} onChange={(e) => setRezim(e.target.value)}>
          {rezim.map((r) => <option key={r.kode} value={r.kode}>{r.nama}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idAwalan}-reg`}>Peraturan</Label>
        <select id={`${idAwalan}-reg`} className={kelasPilih} value={nilaiReg} onChange={(e) => setReg(e.target.value)}>
          <option value="">Otomatis (sesuai rezim & tanggal)</option>
          {regulasi.filter((r) => !nilaiRezim || r.rezim_kode === nilaiRezim).map((r) => (
            <option key={r.id} value={r.id}>{r.nama_singkat}{r.berlaku_sampai ? ` (s.d. ${tanggalPendek(r.berlaku_sampai)})` : ""}</option>
          ))}
        </select>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// (a) Hari kerja
// ---------------------------------------------------------------------------
export function KalkulatorHariKerja({ hariIni, libur }: { hariIni: string; libur: { tanggal: string; nama: string }[] }) {
  const [tanggal, setTanggal] = useState(hariIni);
  const [n, setN] = useState("15");
  const [arah, setArah] = useState<"maju" | "mundur">("maju");
  const [dasar, setDasar] = useState(false);
  const kal = useMemo(() => buatKalender(libur.map((l) => l.tanggal)), [libur]);
  const namaLibur = useMemo(() => new Map(libur.map((l) => [l.tanggal, l.nama])), [libur]);

  const jumlah = Math.floor(Number(n));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(tanggal) && Number.isFinite(jumlah) && jumlah >= 0 && jumlah <= 1000;
  const hasil = valid ? tambahHariKerja(tanggal, arah === "maju" ? jumlah : -jumlah, kal, dasar) : null;
  const dilewati: HariDilewati[] = [];
  if (hasil && hasil !== tanggal) {
    const langkah = arah === "maju" ? 1 : -1;
    let cur = tanggal;
    while (cur !== hasil) {
      cur = geserHari(cur, langkah);
      if (isAkhirPekan(cur)) dilewati.push({ tanggal: cur, alasan: namaHari(cur) });
      else if (kal.libur.has(cur)) dilewati.push({ tanggal: cur, alasan: namaLibur.get(cur) ?? "Hari libur" });
    }
  }
  const tahunTanpaKalender = hasil && !libur.some((l) => l.tanggal.startsWith(hasil.slice(0, 4)));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="hk-tanggal">Tanggal dasar</Label>
          <Input id="hk-tanggal" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hk-n">Jumlah hari kerja</Label>
          <Input id="hk-n" type="number" inputMode="numeric" min={0} max={1000} value={n} onChange={(e) => setN(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hk-arah">Arah</Label>
          <select id="hk-arah" className={kelasPilih} value={arah} onChange={(e) => setArah(e.target.value as "maju" | "mundur")}>
            <option value="maju">Maju (sesudah tanggal dasar)</option>
            <option value="mundur">Mundur (sebelum tanggal dasar)</option>
          </select>
        </div>
        <div className="flex items-end">
          <Centang id="hk-dasar" label="Tanggal dasar dihitung sebagai hari ke-1" checked={dasar} onChange={setDasar} />
        </div>
      </div>
      {hasil ? (
        <Kotak className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {jumlah} hari kerja {arah === "maju" ? "sesudah" : "sebelum"} {tanggalPanjang(tanggal)}{dasar ? " (tanggal dasar dihitung)" : ""}:
          </p>
          <p className="text-2xl font-bold" aria-live="polite">{namaHari(hasil)}, {tanggalPanjang(hasil)}</p>
          <DaftarDilewati dilewati={dilewati} />
          {tahunTanpaKalender && (
            <p className="flex items-start gap-2 text-sm text-waspada"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Kalender libur tahun {hasil.slice(0, 4)} belum diisi — hasil mungkin belum memperhitungkan hari libur.</p>
          )}
        </Kotak>
      ) : (
        <p className="text-sm text-muted-foreground">Isi tanggal dasar dan jumlah hari kerja (0–1000).</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// (b) Mulai berlaku SK
// ---------------------------------------------------------------------------
export function KalkulatorBerlaku({ hariIni, rezim, regulasi }: { hariIni: string; rezim: Rezim[]; regulasi: RegulasiPilihan[] }) {
  const [rz, setRz] = useState(rezim[0]?.kode ?? "");
  const [reg, setReg] = useState("");
  const [tanggal, setTanggal] = useState(hariIni);
  const [hasil, setHasil] = useState<HasilKalkulatorBerlaku | null>(null);
  const { jalankan, sibuk } = useAksi();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        jalankan(() => hitungBerlakuSk({ rezim: rz, regulasiId: reg, tanggalDiterima: tanggal }), { segarkan: false, lalu: setHasil });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PilihRezimRegulasi idAwalan="sk" rezim={rezim} regulasi={regulasi} nilaiRezim={rz} nilaiReg={reg} setRezim={(v) => { setRz(v); setReg(""); }} setReg={setReg} />
        <div className="space-y-1.5">
          <Label htmlFor="sk-tanggal">Tanggal SK diterima pegawai</Label>
          <Input id="sk-tanggal" type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </div>
      </div>
      <Button type="submit" disabled={sibuk}>
        {sibuk ? <Loader2 className="animate-spin" aria-hidden /> : <Calculator aria-hidden />} Hitung tanggal mulai berlaku
      </Button>
      <div aria-live="polite">
        {hasil && !hasil.ok && <p role="alert" className="flex items-start gap-2 rounded-lg border border-waspada/40 bg-waspada-muda p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-waspada" aria-hidden /> {hasil.pesan}</p>}
        {hasil?.ok && (
          <Kotak className="space-y-3">
            <p className="text-sm text-muted-foreground">SK diterima {namaHari(hasil.tanggalDiterima)}, {tanggalPanjang(hasil.tanggalDiterima)} → mulai berlaku:</p>
            <p className="flex items-center gap-2 text-2xl font-bold"><CalendarCheck2 className="size-6 text-aman" aria-hidden /> {namaHari(hasil.tanggalBerlaku)}, {tanggalPanjang(hasil.tanggalBerlaku)}</p>
            <p className="text-sm">
              Aturan: <span className="font-medium">{hasil.aturan.nama}</span> — {hasil.aturan.satuan === "hari_kerja" ? "hari kerja" : hasil.aturan.satuan === "bulan" ? "bulan" : "hari kalender"} ke-{hasil.aturan.jumlah}
              {hasil.aturan.hitungHariDasar ? " (tanggal diterima dihitung sebagai hari ke-1)" : " (dihitung sejak hari berikutnya)"}.
              {hasil.aturan.pasal && <> Dasar: {hasil.aturan.pasal}.</>}
            </p>
            <p className="flex items-start gap-2 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {hasil.regulasi.alasan}</p>
            <DaftarDilewati dilewati={hasil.dilewati} />
          </Kotak>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// (c) Ambang kehadiran
// ---------------------------------------------------------------------------
export function KalkulatorAmbang({ hariIni, rezim, regulasi }: { hariIni: string; rezim: Rezim[]; regulasi: RegulasiPilihan[] }) {
  const [rz, setRz] = useState(rezim[0]?.kode ?? "");
  const [reg, setReg] = useState("");
  const [tanggal, setTanggal] = useState(hariIni);
  const [hari, setHari] = useState("15");
  const [berturut, setBerturut] = useState(false);
  const [hasil, setHasil] = useState<HasilKalkulatorAmbang | null>(null);
  const { jalankan, sibuk } = useAksi();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        jalankan(() => hitungAmbangKehadiran({ rezim: rz, regulasiId: reg, tanggalPeristiwa: tanggal, hari: Number(hari), berturut }), { segarkan: false, lalu: setHasil });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PilihRezimRegulasi idAwalan="am" rezim={rezim} regulasi={regulasi} nilaiRezim={rz} nilaiReg={reg} setRezim={(v) => { setRz(v); setReg(""); }} setReg={setReg} />
        <div className="space-y-1.5">
          <Label htmlFor="am-tanggal">Tanggal peristiwa</Label>
          <Input id="am-tanggal" type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="am-hari">Hari tidak masuk kerja (kumulatif setahun)</Label>
          <Input id="am-hari" type="number" inputMode="numeric" min={0} max={366} required value={hari} onChange={(e) => setHari(e.target.value)} />
        </div>
      </div>
      <Centang id="am-berturut" label="Hari-hari tersebut berturut-turut" checked={berturut} onChange={setBerturut} />
      <Button type="submit" disabled={sibuk}>
        {sibuk ? <Loader2 className="animate-spin" aria-hidden /> : <Calculator aria-hidden />} Hitung usulan hukuman
      </Button>

      <div aria-live="polite">
        {hasil && !hasil.ok && <p role="alert" className="flex items-start gap-2 rounded-lg border border-waspada/40 bg-waspada-muda p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-waspada" aria-hidden /> {hasil.pesan}</p>}
        {hasil?.ok && (
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-muda p-3 text-sm"><Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden /> {hasil.regulasi.alasan}</p>
            <Kotak className="space-y-2">
              <p className="text-sm text-muted-foreground">{hasil.hari} hari tidak masuk kerja{hasil.berturut ? " berturut-turut" : ""} menurut {hasil.regulasi.nama}:</p>
              {hasil.usulan ? (
                <>
                  <p className="text-xl font-bold leading-snug">
                    {hasil.usulan.tingkat && <Lencana warna="info" className="mr-2 align-middle text-sm">{labelKode(hasil.usulan.tingkat)}</Lencana>}
                    {hasil.usulan.jenis}
                  </p>
                  {hasil.usulan.pengganti && (
                    <p className="flex items-start gap-2 rounded-md bg-waspada-muda p-2 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-waspada" aria-hidden /> Untuk sementara dijalankan sebagai: <span className="font-semibold">{hasil.usulan.pengganti}</span>{hasil.usulan.peringatanJenis ? ` — ${hasil.usulan.peringatanJenis}` : ""}</p>
                  )}
                  {hasil.usulan.pasal && <p className="text-sm">Dasar: {hasil.usulan.pasal}</p>}
                  {hasil.usulan.akibat && <p className="text-sm">Akibat tambahan: <span className="font-medium">{hasil.usulan.akibat}</span></p>}
                  {hasil.usulan.alurKhusus && <p className="text-sm font-medium text-lewat">Memicu alur khusus: {labelKode(hasil.usulan.alurKhusus)}</p>}
                </>
              ) : (
                <p className="text-lg font-semibold">Belum mencapai ambang hukuman disiplin.</p>
              )}
              {hasil.berikut && (
                <p className="flex flex-wrap items-center gap-1 border-t pt-2 text-sm">
                  Ambang berikutnya <ArrowRight className="size-4" aria-hidden /> <span className="font-medium">{hasil.berikut.hariMin} hari</span> ({hasil.berikut.selisih} hari lagi):
                  {" "}{hasil.berikut.tingkat ? `${labelKode(hasil.berikut.tingkat)} — ` : ""}{hasil.berikut.jenis}
                </p>
              )}
            </Kotak>
            <div>
              <p className="mb-2 text-sm font-medium">Tabel ambang {hasil.regulasi.nama}</p>
              <div className="overflow-x-auto rounded-lg border" role="region" aria-label="Tabel ambang kehadiran" tabIndex={0}>
                <table className="w-full min-w-[30rem] text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">Hari</th>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">Tingkat</th>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">Jenis hukuman disiplin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hasil.tabel.map((b, i) => (
                      <tr key={b.id ?? i} className={cn("border-t", b.cocok && "bg-info-muda font-semibold")} aria-current={b.cocok ? "true" : undefined}>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{b.rentang}{b.berturut ? " berturut-turut" : ""}</td>
                        <td className="px-3 py-2">{b.tingkat ? labelKode(b.tingkat) : "—"}</td>
                        <td className="px-3 py-2">{b.jenis ?? "—"}{b.cocok && <span className="sr-only"> (cocok)</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
