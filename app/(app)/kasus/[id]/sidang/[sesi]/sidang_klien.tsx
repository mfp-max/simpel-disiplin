"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, ChevronDown, ChevronUp, Clock, CloudOff, Download, FileText, Library, Loader2,
  Pencil, Play, Plus, Trash2, UserCheck, UserX, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Catatan, Panel, Pii } from "@/components/simpel/dasar";
import { useAksi } from "@/components/simpel/interaktif";
import { tanggalPanjang } from "@/lib/format";
import type { Hasil } from "@/lib/galat";
import {
  aturKehadiran, geserPertanyaanSesi, hapusPertanyaanSesi, muatUlangQa, mulaiSesi, selesaiDanSusunBap, simpanJawabanSesi,
  tambahDariBankSesi, tambahPertanyaanSesi, ubahPertanyaanSesi,
} from "../_aksi";
import { bisaDisunting, formatDurasi, jamMenitDetik, romawi, type ButirQa, type SesiKlien, type SetBank } from "../_jenis";
import { PanelRekaman, SpandukRekam, usePerekam } from "./rekam_klien";

export type DataLayar = {
  entri: { id: string; nomor: string; judul: string; tingkat: string | null; diarsipkan: boolean };
  terperiksa: { nama: string; nip: string | null; pangkat: string | null; jabatan: string | null; unit: string | null };
  tim: { nama: string; nip: string | null; peran: string; unsur: string }[];
  notulis: string | null;
  modaLabel: Record<string, string>;
  sesi: SesiKlien;
  qa: ButirQa[];
  bank: SetBank[];
  intervalDetik: number;
  retensiHari: number;
  hak: { ubah: boolean; admin: boolean };
};

const LABEL_BLOK: Record<ButirQa["kategori"], string> = { pembuka: "Pembukaan", substansi: "Substansi", penutup: "Penutup" };
const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Draf lokal (localStorage) — ketikan tidak hilang saat jaringan putus
// ---------------------------------------------------------------------------
type DrafLokal = { v: 1; butir: Record<string, { t: string; w: number }> };
const kunciLokal = (sesiId: string) => `simpel:sidang:${sesiId}`;

function bacaLokal(sesiId: string): DrafLokal {
  try {
    const x = JSON.parse(localStorage.getItem(kunciLokal(sesiId)) ?? "null");
    if (x && x.v === 1 && x.butir && typeof x.butir === "object") return x as DrafLokal;
  } catch {
    /* abaikan */
  }
  return { v: 1, butir: {} };
}
function tulisLokal(sesiId: string, d: DrafLokal) {
  try {
    if (Object.keys(d.butir).length) localStorage.setItem(kunciLokal(sesiId), JSON.stringify(d));
    else localStorage.removeItem(kunciLokal(sesiId));
  } catch {
    /* penyimpanan penuh / mode privat */
  }
}

// ---------------------------------------------------------------------------
// Simpan otomatis: tiap N detik + saat pindah kolom, hanya butir yang berubah
// ---------------------------------------------------------------------------
function useSimpanOtomatis(sesiId: string, awal: ButirQa[], intervalDetik: number, aktif: boolean) {
  const [nilai, setNilai] = useState<Record<string, string>>(() => Object.fromEntries(awal.map((b) => [b.id, b.jawaban ?? ""])));
  const nilaiRef = useRef(nilai);
  const kotor = useRef(new Map<string, number>());
  const sedang = useRef(false);
  const [jumlahKotor, setJumlahKotor] = useState(0);
  const [menyimpan, setMenyimpan] = useState(false);
  const [terakhir, setTerakhir] = useState<Date | null>(() => {
    const t = awal.map((b) => (b.terakhir_disimpan ? Date.parse(b.terakhir_disimpan) : 0)).reduce((a, b) => Math.max(a, b), 0);
    return t ? new Date(t) : null;
  });
  const [daring, setDaring] = useState(true);
  const [pesanGagal, setPesanGagal] = useState<string | null>(null);
  const [pemulihan, setPemulihan] = useState<{ id: string; t: string }[]>([]);

  const ubah = useCallback((id: string, teks: string) => {
    nilaiRef.current = { ...nilaiRef.current, [id]: teks };
    setNilai(nilaiRef.current);
    const w = Date.now();
    kotor.current.set(id, w);
    setJumlahKotor(kotor.current.size);
    const d = bacaLokal(sesiId);
    d.butir[id] = { t: teks, w };
    tulisLokal(sesiId, d);
  }, [sesiId]);

  const simpan = useCallback(async (): Promise<boolean> => {
    if (!aktif) return true;
    if (sedang.current) return false;
    if (!kotor.current.size) return true;
    sedang.current = true;
    setMenyimpan(true);
    const snap = [...kotor.current.entries()];
    try {
      const h = await simpanJawabanSesi(sesiId, snap.map(([id]) => ({ id, jawaban: nilaiRef.current[id] ?? "" })));
      setDaring(true);
      if (!h.ok) {
        setPesanGagal(h.pesan);
        return false;
      }
      const ok = new Set(h.data.tersimpan.map((x) => x.id));
      const d = bacaLokal(sesiId);
      for (const [id, w] of snap) {
        if (kotor.current.get(id) !== w && ok.has(id)) continue; // diketik lagi selama menyimpan
        kotor.current.delete(id);
        if (d.butir[id]?.w === w || !ok.has(id)) delete d.butir[id];
      }
      tulisLokal(sesiId, d);
      setJumlahKotor(kotor.current.size);
      setTerakhir(new Date());
      setPesanGagal(null);
      return kotor.current.size === 0;
    } catch {
      setDaring(false);
      return false;
    } finally {
      sedang.current = false;
      setMenyimpan(false);
    }
  }, [aktif, sesiId]);

  /** Simpan sampai tidak ada yang tertunda (dipakai sebelum menyusun BAP). */
  const simpanSemua = useCallback(async () => {
    for (let i = 0; i < 6; i++) {
      while (sedang.current) await tunggu(100);
      if (await simpan()) return true;
      if (!navigator.onLine) return false;
      await tunggu(300);
    }
    return kotor.current.size === 0;
  }, [simpan]);

  /** Butir baru dari server (sisip/hapus) → tambahkan nilainya tanpa menimpa ketikan lokal. */
  const daftarkan = useCallback((daftar: ButirQa[]) => {
    const tambah: Record<string, string> = {};
    for (const b of daftar) if (!(b.id in nilaiRef.current)) tambah[b.id] = b.jawaban ?? "";
    if (Object.keys(tambah).length) {
      nilaiRef.current = { ...nilaiRef.current, ...tambah };
      setNilai(nilaiRef.current);
    }
  }, []);

  // Interval simpan otomatis
  useEffect(() => {
    if (!aktif) return;
    const t = setInterval(() => void simpan(), intervalDetik * 1000);
    return () => clearInterval(t);
  }, [aktif, intervalDetik, simpan]);

  // Status sambungan
  useEffect(() => {
    const naik = () => { setDaring(true); void simpan(); };
    const turun = () => setDaring(false);
    if (!navigator.onLine) turun();
    window.addEventListener("online", naik);
    window.addEventListener("offline", turun);
    return () => { window.removeEventListener("online", naik); window.removeEventListener("offline", turun); };
  }, [simpan]);

  // Peringatan bila menutup halaman dengan ketikan yang belum tersimpan ke server
  useEffect(() => {
    if (!jumlahKotor) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [jumlahKotor]);

  // Saat dibuka: adakah ketikan di perangkat ini yang lebih baru dari server?
  useEffect(() => {
    const d = bacaLokal(sesiId);
    const server = new Map(awal.map((b) => [b.id, b]));
    const calon: { id: string; t: string }[] = [];
    for (const [id, x] of Object.entries(d.butir)) {
      const b = server.get(id);
      const ts = b?.terakhir_disimpan ? Date.parse(b.terakhir_disimpan) : 0;
      if (!b || x.t === (b.jawaban ?? "") || x.w <= ts) delete d.butir[id];
      else calon.push({ id, t: x.t });
    }
    tulisLokal(sesiId, d);
    if (calon.length) setPemulihan(calon);
    // hanya sekali saat halaman dibuka
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesiId]);

  const pulihkan = useCallback(() => {
    for (const x of pemulihan) ubah(x.id, x.t);
    setPemulihan([]);
    void simpan();
  }, [pemulihan, simpan, ubah]);

  const abaikanPemulihan = useCallback(() => {
    const d = bacaLokal(sesiId);
    for (const x of pemulihan) delete d.butir[x.id];
    tulisLokal(sesiId, d);
    setPemulihan([]);
  }, [pemulihan, sesiId]);

  return {
    nilai, ubah, simpan, simpanSemua, daftarkan, jumlahKotor, menyimpan, terakhir, daring, pesanGagal,
    kotor: kotor.current, pemulihan, pulihkan, abaikanPemulihan,
  };
}

function useKini() {
  const [kini, setKini] = useState<number | null>(null);
  useEffect(() => {
    setKini(Date.now());
    const t = setInterval(() => setKini(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return kini;
}

// ---------------------------------------------------------------------------
// Layar sidang
// ---------------------------------------------------------------------------
export function LayarSidang({ data }: { data: DataLayar }) {
  const [sesi, setSesi] = useState<SesiKlien>(data.sesi);
  const [daftar, setDaftar] = useState<ButirQa[]>(data.qa);
  const bolehUbah = data.hak.ubah;
  const s = useSimpanOtomatis(data.sesi.id, data.qa, data.intervalDetik, bolehUbah);
  const perekam = usePerekam(sesi, setSesi);
  const merekam = perekam.status !== "diam";
  const { jalankan, sibuk } = useAksi();
  const [bukaPanel, setBukaPanel] = useState(false);
  const [dokumenBaru, setDokumenBaru] = useState<string | null>(null);
  const [sisip, setSisip] = useState<{ setelah: number | null } | null>(null);
  const [bukaBank, setBukaBank] = useState(false);
  const [sunting, setSunting] = useState<ButirQa | null>(null);
  const [hapus, setHapus] = useState<ButirQa | null>(null);
  const [konfirmSelesai, setKonfirmSelesai] = useState(false);
  const [menyusun, setMenyusun] = useState(false);
  const [fokusId, setFokusId] = useState<string | null>(null);
  const kolom = useRef(new Map<string, HTMLTextAreaElement>());
  const kini = useKini();

  const terapkan = useCallback((baru: ButirQa[]) => {
    const lama = new Set(daftar.map((b) => b.id));
    s.daftarkan(baru);
    setDaftar(baru);
    const tambahan = baru.find((b) => !lama.has(b.id));
    if (tambahan) setFokusId(tambahan.id);
  }, [daftar, s]);

  useEffect(() => {
    if (!fokusId) return;
    const el = kolom.current.get(fokusId);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setFokusId(null);
  }, [fokusId, daftar]);

  const struktur = (fn: () => Promise<Hasil<{ daftar: ButirQa[] }>>, sukses?: string) =>
    jalankan(fn, { segarkan: false, sukses, lalu: (d) => terapkan(d.daftar) });

  const pindahKeBerikut = (id: string) => {
    const i = daftar.findIndex((b) => b.id === id);
    const berikut = daftar[i + 1];
    if (!berikut) return false;
    kolom.current.get(berikut.id)?.focus();
    return true;
  };

  async function selesai() {
    setKonfirmSelesai(false);
    setMenyusun(true);
    try {
      const ok = await s.simpanSemua();
      if (!ok) {
        toast.error("Masih ada jawaban yang belum tersimpan ke server. Periksa sambungan internet, lalu coba lagi.");
        return;
      }
      const h = await jalankan(() => selesaiDanSusunBap(sesi.id), { segarkan: false, lalu: (d) => { setSesi(d.sesi); setDokumenBaru(d.dokumenId); } });
      if (!h.ok) {
        const r = await muatUlangQa(sesi.id).catch(() => null);
        if (r?.ok) setSesi(r.data.sesi);
      }
    } finally {
      setMenyusun(false);
    }
  }

  const durasi = sesi.mulai_pada
    ? ((sesi.selesai_pada ? Date.parse(sesi.selesai_pada) : kini ?? Date.parse(sesi.mulai_pada)) - Date.parse(sesi.mulai_pada)) / 1000
    : 0;
  const bapId = dokumenBaru ?? sesi.bap_dokumen_id;
  const t = data.terperiksa;

  const indikator = s.menyimpan ? (
    <span className="inline-flex items-center gap-1.5"><Loader2 className="size-4 animate-spin" aria-hidden /> Menyimpan…</span>
  ) : !s.daring && s.jumlahKotor ? (
    <span className="inline-flex items-center gap-1.5 text-waspada"><CloudOff className="size-4" aria-hidden /> {s.jumlahKotor} jawaban menunggu sinkron</span>
  ) : s.terakhir ? (
    <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-aman" aria-hidden /> Tersimpan pukul {jamMenitDetik(s.terakhir)}</span>
  ) : (
    <span className="text-muted-foreground">Belum ada jawaban</span>
  );

  const tombolSelesai = bolehUbah && (
    <Button type="button" onClick={() => setKonfirmSelesai(true)} disabled={merekam || menyusun || sibuk || (sesi.status === "direncanakan" && sesi.terperiksa_hadir !== false)}
      title={merekam ? "Hentikan rekaman terlebih dahulu" : sesi.status === "direncanakan" && sesi.terperiksa_hadir !== false ? "Mulai pemeriksaan terlebih dahulu" : undefined}>
      {menyusun ? <Loader2 className="animate-spin" aria-hidden /> : <FileText aria-hidden />}
      {sesi.status === "selesai" ? "Susun ulang BAP" : "Selesai & Susun BAP"}
    </Button>
  );

  return (
    <div className="space-y-4">
      {perekam.status === "merekam" && (
        <div aria-hidden className="kedip-rekam pointer-events-none fixed inset-0 z-40 border-[6px] border-red-600" />
      )}

      {/* Bilah atas lengket: spanduk rekam + durasi + indikator simpan */}
      <div className="sticky top-16 z-10 -mx-4 border-b bg-background/95 backdrop-blur sm:-mx-6">
        <SpandukRekam perekam={perekam} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm sm:px-6">
          <Link href={`/kasus/${data.entri.id}`} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden /> <span className="hidden sm:inline">Kasus</span>
          </Link>
          <p className="font-semibold">Pemeriksaan {romawi(sesi.urutan)}</p>
          <p className="inline-flex items-center gap-1.5 font-mono text-base tabular-nums" aria-label="Durasi sesi">
            <Clock className="size-4" aria-hidden />
            {sesi.mulai_pada ? (kini === null && !sesi.selesai_pada ? "--:--:--" : formatDurasi(durasi)) : "Belum dimulai"}
          </p>
          <p aria-live="polite" className="min-w-0">{indikator}</p>
          <div className="ml-auto flex flex-wrap gap-2">
            {bolehUbah && sesi.status === "direncanakan" && (
              <Button type="button" variant="outline" disabled={sibuk} onClick={() => jalankan(() => mulaiSesi(sesi.id), { segarkan: false, lalu: setSesi })}>
                <Play aria-hidden /> Mulai pemeriksaan
              </Button>
            )}
            {tombolSelesai}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Mode sidang — Pemeriksaan {romawi(sesi.urutan)}</h1>
        <p className="text-sm text-muted-foreground">
          {data.entri.nomor} · {data.entri.judul}
          {sesi.tanggal && <> · {tanggalPanjang(sesi.tanggal)}</>}
          {sesi.tempat && <> · {sesi.tempat}</>}
          {" · "}{data.modaLabel[sesi.moda] ?? sesi.moda}
        </p>
      </div>

      {!s.daring && (
        <Catatan jenis="waspada" judul="Tidak tersambung — ketikan disimpan di perangkat ini">
          Lanjutkan mengetik seperti biasa. Jawaban akan dikirim otomatis ke server begitu sambungan pulih. Jangan menutup halaman ini.
        </Catatan>
      )}
      {s.pesanGagal && <Catatan jenis="lewat" judul="Jawaban belum tersimpan">{s.pesanGagal}</Catatan>}
      {s.pemulihan.length > 0 && (
        <Catatan jenis="waspada" judul="Ada ketikan di perangkat ini yang belum terkirim">
          Ditemukan {s.pemulihan.length} jawaban yang lebih baru daripada yang tersimpan di server (mis. karena jaringan terputus).
          <span className="mt-2 flex flex-wrap gap-2">
            <Button type="button" onClick={s.pulihkan}>Pulihkan ketikan</Button>
            <Button type="button" variant="outline" onClick={s.abaikanPemulihan}>Abaikan</Button>
          </span>
        </Catatan>
      )}
      {!bolehUbah && (
        <Catatan jenis="info">{data.entri.diarsipkan ? "Kasus ini sudah diarsipkan; isi pemeriksaan hanya dapat dibaca." : "Anda hanya dapat membaca isi pemeriksaan ini."}</Catatan>
      )}
      {bapId && (
        <Catatan jenis="aman" judul="Berita Acara Pemeriksaan siap">
          BAP disusun dari seluruh tanya jawab sesi ini dan siap disunting serta dicetak.
          <span className="mt-2 flex flex-wrap gap-2">
            <Button asChild><a href={`/api/dokumen/${bapId}`}><Download aria-hidden /> Unduh BAP (.docx)</a></Button>
            <Button asChild variant="outline"><Link href={`/kasus/${data.entri.id}?tab=dokumen`}>Buka dokumen kasus</Link></Button>
          </span>
        </Catatan>
      )}
      {sesi.status === "selesai" && bolehUbah && (
        <p className="text-sm text-muted-foreground">Sesi sudah selesai. Perbaikan jawaban tetap tersimpan; tekan <strong>Susun ulang BAP</strong> agar BAP memuat perubahan.</p>
      )}

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)] xl:items-start">
        {/* Panel kiri — dapat dilipat di layar kecil */}
        <aside className="min-w-0 space-y-4" aria-label="Identitas, tim, dan perekaman">
          <Button type="button" variant="outline" className="h-auto min-h-11 w-full justify-between py-2 xl:hidden" aria-expanded={bukaPanel} onClick={() => setBukaPanel((x) => !x)}>
            <span className="min-w-0 text-left">
              <span className="block truncate font-semibold"><Pii>{t.nama}</Pii></span>
              <span className="block text-xs text-muted-foreground">Identitas, tim, kehadiran &amp; perekaman</span>
            </span>
            {bukaPanel ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
          </Button>
          <div className={cn("space-y-4 xl:block", bukaPanel ? "block" : "hidden")}>
            <Panel judul="Terperiksa">
              <dl className="space-y-2 text-sm">
                <div><dt className="text-muted-foreground">Nama</dt><dd className="font-semibold text-base"><Pii>{t.nama}</Pii></dd></div>
                {t.nip && <div><dt className="text-muted-foreground">NIP</dt><dd><Pii>{t.nip}</Pii></dd></div>}
                {t.pangkat && <div><dt className="text-muted-foreground">Pangkat/golongan</dt><dd>{t.pangkat}</dd></div>}
                {t.jabatan && <div><dt className="text-muted-foreground">Jabatan</dt><dd>{t.jabatan}</dd></div>}
                {t.unit && <div><dt className="text-muted-foreground">Unit kerja</dt><dd>{t.unit}</dd></div>}
              </dl>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button type="button" variant={sesi.terperiksa_hadir === true ? "default" : "outline"} disabled={!bolehUbah || sibuk}
                  aria-pressed={sesi.terperiksa_hadir === true}
                  className={cn(sesi.terperiksa_hadir === true && "bg-aman text-white hover:bg-aman/90")}
                  onClick={() => jalankan(() => aturKehadiran(sesi.id, true), { segarkan: false, lalu: setSesi })}>
                  <UserCheck aria-hidden /> Hadir
                </Button>
                <Button type="button" variant={sesi.terperiksa_hadir === false ? "destructive" : "outline"} disabled={!bolehUbah || sibuk}
                  aria-pressed={sesi.terperiksa_hadir === false}
                  onClick={() => jalankan(() => aturKehadiran(sesi.id, false), { segarkan: false, lalu: setSesi })}>
                  <UserX aria-hidden /> Tidak hadir
                </Button>
              </div>
              {sesi.terperiksa_hadir === false && (
                <p className="mt-2 text-sm text-muted-foreground">Terperiksa tidak hadir. Tutup sesi lalu siapkan Berita Acara Ketidakhadiran dari panel dokumen kasus.</p>
              )}
            </Panel>

            <Panel judul={<span className="flex items-center gap-2"><Users className="size-5" aria-hidden /> Tim pemeriksa</span>}>
              {data.tim.length ? (
                <ul className="space-y-2 text-sm">
                  {data.tim.map((a, i) => (
                    <li key={i}>
                      <p className="font-medium"><Pii>{a.nama}</Pii></p>
                      <p className="text-muted-foreground">{a.peran}{a.nip ? <> · <Pii>{a.nip}</Pii></> : null}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Belum ada anggota tim yang dicatat.</p>
              )}
              <p className="mt-3 text-sm"><span className="text-muted-foreground">Notulis:</span> {data.notulis ?? "—"}</p>
            </Panel>

            <Panel judul="Perekaman audio">
              <PanelRekaman sesi={sesi} setSesi={setSesi} perekam={perekam} bolehUbah={bolehUbah} admin={data.hak.admin} retensiHari={data.retensiHari} />
            </Panel>
          </div>
        </aside>

        {/* Panel utama — tanya jawab */}
        <section className="min-w-0 rounded-xl border bg-card text-card-foreground shadow-sm" aria-label="Tanya jawab pemeriksaan">
          <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="font-semibold">Tanya jawab ({daftar.length} pertanyaan)</h2>
              {bolehUbah && <p className="text-sm text-muted-foreground">Ketik jawaban per nomor. Tekan <kbd className="rounded border px-1 text-xs">Tab</kbd> untuk pindah ke jawaban berikutnya.</p>}
            </div>
            {bolehUbah && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={!s.daring || sibuk} onClick={() => setSisip({ setelah: null })}>
                  <Plus aria-hidden /> Pertanyaan substansi
                </Button>
                {data.bank.length > 0 && (
                  <Button type="button" variant="outline" disabled={!s.daring || sibuk} onClick={() => setBukaBank(true)}>
                    <Library aria-hidden /> Dari bank pertanyaan
                  </Button>
                )}
              </div>
            )}
          </div>

          <ol className="divide-y">
            {daftar.map((b, i) => {
              const sebelum = daftar[i - 1];
              const berikut = daftar[i + 1];
              const bolehSisipSetelah = bolehUbah && (b.kategori === "substansi" || (b.kategori === "pembuka" && berikut?.kategori !== "pembuka"));
              return (
                <Fragment key={b.id}>
                  {b.kategori !== sebelum?.kategori && (
                    <li role="presentation" className="bg-muted/50 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:px-5">
                      {LABEL_BLOK[b.kategori]}
                    </li>
                  )}
                  <li className="px-4 py-4 sm:px-5">
                    <div className="flex gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden>{b.urutan}</span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <label htmlFor={`jawab-${b.id}`} className="text-base font-semibold leading-snug">
                            <span className="sr-only">Pertanyaan {b.urutan}: </span>{b.pertanyaan}
                            {b.sumber !== "baku" && <span className="ml-2 align-middle text-xs font-medium text-info">{b.sumber === "bank" ? "dari bank" : "tambahan"}</span>}
                          </label>
                          {bolehUbah && b.kategori === "substansi" && (
                            <div className="flex shrink-0 gap-1">
                              <Button type="button" variant="ghost" size="icon" aria-label={`Naikkan pertanyaan ${b.urutan}`} disabled={sibuk || !s.daring || sebelum?.kategori !== "substansi"}
                                onClick={() => struktur(() => geserPertanyaanSesi(sesi.id, b.id, -1))}><ArrowUp aria-hidden /></Button>
                              <Button type="button" variant="ghost" size="icon" aria-label={`Turunkan pertanyaan ${b.urutan}`} disabled={sibuk || !s.daring || berikut?.kategori !== "substansi"}
                                onClick={() => struktur(() => geserPertanyaanSesi(sesi.id, b.id, 1))}><ArrowDown aria-hidden /></Button>
                              {bisaDisunting(b) && (
                                <>
                                  <Button type="button" variant="ghost" size="icon" aria-label={`Sunting pertanyaan ${b.urutan}`} disabled={sibuk || !s.daring} onClick={() => setSunting(b)}><Pencil aria-hidden /></Button>
                                  <Button type="button" variant="ghost" size="icon" aria-label={`Hapus pertanyaan ${b.urutan}`} disabled={sibuk || !s.daring} onClick={() => setHapus(b)} className="text-lewat hover:text-lewat"><Trash2 aria-hidden /></Button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <Textarea
                          id={`jawab-${b.id}`}
                          ref={(el) => { if (el) kolom.current.set(b.id, el); else kolom.current.delete(b.id); }}
                          value={s.nilai[b.id] ?? ""}
                          readOnly={!bolehUbah}
                          rows={4}
                          placeholder={bolehUbah ? "Ketik jawaban terperiksa…" : "—"}
                          className={cn("min-h-32 text-[17px] leading-relaxed", s.kotor.has(b.id) && "border-waspada/60")}
                          onChange={(e) => s.ubah(b.id, e.target.value)}
                          onBlur={() => void s.simpan()}
                          onKeyDown={(e) => {
                            if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && pindahKeBerikut(b.id)) e.preventDefault();
                          }}
                        />
                      </div>
                    </div>
                  </li>
                  {bolehSisipSetelah && (
                    <li role="presentation" className="px-4 sm:px-5">
                      <button type="button" disabled={sibuk || !s.daring} onClick={() => setSisip({ setelah: b.urutan })}
                        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">
                        <Plus className="size-4" aria-hidden /> Sisipkan pertanyaan substansi setelah nomor {b.urutan}
                      </button>
                    </li>
                  )}
                </Fragment>
              );
            })}
          </ol>
          {!daftar.length && <p className="p-5 text-sm text-muted-foreground">Belum ada pertanyaan. Pertanyaan baku belum diatur admin.</p>}
          {bolehUbah && <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3 sm:px-5">{tombolSelesai}</div>}
        </section>
      </div>

      <DialogPertanyaan
        buka={!!sisip}
        judul={sisip?.setelah ? `Sisipkan pertanyaan setelah nomor ${sisip.setelah}` : "Tambah pertanyaan substansi"}
        awal=""
        sibuk={sibuk}
        onTutup={() => setSisip(null)}
        onSimpan={(teks) => struktur(() => tambahPertanyaanSesi(sesi.id, sisip?.setelah ?? null, teks)).then((h) => h.ok && setSisip(null))}
      />
      <DialogPertanyaan
        buka={!!sunting}
        judul={`Sunting pertanyaan nomor ${sunting?.urutan ?? ""}`}
        awal={sunting?.pertanyaan ?? ""}
        sibuk={sibuk}
        onTutup={() => setSunting(null)}
        onSimpan={(teks) => sunting && struktur(() => ubahPertanyaanSesi(sesi.id, sunting.id, teks)).then((h) => h.ok && setSunting(null))}
      />
      <DialogBank
        buka={bukaBank}
        bank={data.bank}
        daftar={daftar}
        sibuk={sibuk}
        onTutup={() => setBukaBank(false)}
        onSimpan={(setelah, ids) => struktur(() => tambahDariBankSesi(sesi.id, setelah, ids)).then((h) => h.ok && setBukaBank(false))}
      />

      <AlertDialog open={!!hapus} onOpenChange={(o) => !o && setHapus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pertanyaan nomor {hapus?.urutan}?</AlertDialogTitle>
            <AlertDialogDescription>
              {hapus?.pertanyaan}
              {(s.nilai[hapus?.id ?? ""] ?? "").trim() && <><br /><br /><strong>Jawaban yang sudah diketik juga ikut terhapus</strong> (isinya tetap tercatat di log audit).</>}
              {" "}Nomor pertanyaan sesudahnya akan menyesuaikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => { const b = hapus; setHapus(null); if (b) { await s.simpan(); await struktur(() => hapusPertanyaanSesi(sesi.id, b.id)); } }}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={konfirmSelesai} onOpenChange={setKonfirmSelesai}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{sesi.status === "selesai" ? "Susun ulang BAP?" : "Selesaikan pemeriksaan dan susun BAP?"}</AlertDialogTitle>
            <AlertDialogDescription>
              Semua jawaban disimpan{sesi.status !== "selesai" && ", sesi ditandai selesai dan jam selesai dicatat"}, lalu Berita Acara Pemeriksaan (.docx)
              disusun berisi seluruh tanya jawab. Dokumen dapat disunting sebelum dicetak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void selesai()}>{sesi.status === "selesai" ? "Susun ulang" : "Selesai & Susun BAP"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DialogPertanyaan({ buka, judul, awal, sibuk, onTutup, onSimpan }: {
  buka: boolean; judul: string; awal: string; sibuk: boolean; onTutup: () => void; onSimpan: (teks: string) => void;
}) {
  const [teks, setTeks] = useState(awal);
  useEffect(() => { if (buka) setTeks(awal); }, [buka, awal]);
  return (
    <Dialog open={buka} onOpenChange={(o) => !o && onTutup()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{judul}</DialogTitle>
          <DialogDescription>Pertanyaan substansi tambahan. Penomoran menyesuaikan otomatis.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="teks-pertanyaan">Pertanyaan</Label>
          <Textarea id="teks-pertanyaan" autoFocus rows={4} className="text-base" value={teks} onChange={(e) => setTeks(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && teks.trim()) onSimpan(teks.trim()); }}
            placeholder="Mis. Apakah Saudara mengakui telah menerima uang tersebut?" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onTutup}>Batal</Button>
          <Button disabled={sibuk || !teks.trim()} onClick={() => onSimpan(teks.trim())}>{sibuk && <Loader2 className="animate-spin" aria-hidden />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogBank({ buka, bank, daftar, sibuk, onTutup, onSimpan }: {
  buka: boolean; bank: SetBank[]; daftar: ButirQa[]; sibuk: boolean; onTutup: () => void; onSimpan: (setelah: number | null, ids: string[]) => void;
}) {
  const [set, setSet] = useState(bank[0]?.nama_set ?? "");
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [setelah, setSetelah] = useState<string>("");
  const aktif = bank.find((b) => b.nama_set === set);
  useEffect(() => { if (buka) setPilih(new Set(aktif?.butir.map((b) => b.id) ?? [])); }, [buka, aktif]);
  const posisi = daftar.filter((b, i) => b.kategori === "substansi" || (b.kategori === "pembuka" && daftar[i + 1]?.kategori !== "pembuka"));
  return (
    <Dialog open={buka} onOpenChange={(o) => !o && onTutup()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sisipkan dari bank pertanyaan</DialogTitle>
          <DialogDescription>Pilih set pertanyaan substansi yang sudah disiapkan admin.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pilih-set">Set pertanyaan</Label>
            <select id="pilih-set" value={set} onChange={(e) => setSet(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-base">
              {bank.map((b) => <option key={b.nama_set} value={b.nama_set}>{b.nama_set}{b.jenis_pelanggaran ? ` — ${b.jenis_pelanggaran}` : ""}</option>)}
            </select>
          </div>
          <fieldset className="space-y-1">
            <legend className="mb-1 text-sm font-medium">Pertanyaan ({pilih.size} dipilih)</legend>
            {aktif?.butir.map((b) => (
              <label key={b.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-accent">
                <input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" checked={pilih.has(b.id)}
                  onChange={(e) => setPilih((p) => { const n = new Set(p); if (e.target.checked) n.add(b.id); else n.delete(b.id); return n; })} />
                <span className="text-sm leading-snug">{b.pertanyaan}</span>
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="pilih-posisi">Sisipkan</Label>
            <select id="pilih-posisi" value={setelah} onChange={(e) => setSetelah(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-base">
              <option value="">Di akhir blok substansi</option>
              {posisi.map((b) => <option key={b.id} value={b.urutan}>Setelah nomor {b.urutan}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onTutup}>Batal</Button>
          <Button disabled={sibuk || !pilih.size} onClick={() => onSimpan(setelah ? Number(setelah) : null, [...pilih])}>
            {sibuk && <Loader2 className="animate-spin" aria-hidden />} Sisipkan {pilih.size} pertanyaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
