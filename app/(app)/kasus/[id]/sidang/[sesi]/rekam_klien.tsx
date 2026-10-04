"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Download, FileSignature, FileUp, Loader2, Lock, Mic, Pause, Play, ShieldCheck, Square, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Catatan } from "@/components/simpel/dasar";
import { unggahLangsung, useAksi } from "@/components/simpel/interaktif";
import { tanggalPanjang } from "@/lib/format";
import type { Hasil } from "@/lib/galat";
import {
  aturPenolakanRekam, aturPersetujuanRekam, konfirmasiPotonganRekaman, konfirmasiUnggahPersetujuan, mulaiRekaman,
  perpanjangRetensiRekaman, selesaikanRekaman, siapkanPotonganRekaman, siapkanUnggahPersetujuan,
} from "../_aksi";
import { alasanRekamTerkunci, formatDurasi, type SesiKlien } from "../_jenis";

// ---------------------------------------------------------------------------
// Antrean potongan di IndexedDB: potongan yang gagal terunggah tidak hilang
// walau halaman dimuat ulang / peramban tertutup.
// ---------------------------------------------------------------------------
type Potongan = { kunci: string; sesiId: string; nomor: number; blob: Blob };
const NAMA_DB = "simpel-rekaman";

function bukaDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const r = indexedDB.open(NAMA_DB, 1);
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore("potongan", { keyPath: "kunci" });
        s.createIndex("sesi", "sesiId");
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await bukaDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction("potongan", mode).objectStore("potongan"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

const simpanIdb = (p: Potongan) => idb("readwrite", (s) => s.put(p));
const hapusIdb = (kunci: string) => idb("readwrite", (s) => s.delete(kunci));
const muatIdb = async (sesiId: string) => ((await idb<Potongan[]>("readonly", (s) => s.index("sesi").getAll(sesiId))) ?? []).sort((a, b) => a.nomor - b.nomor);

const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pilihMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* lanjut */
    }
  }
  return "";
}

async function unggahPotongan(sesiId: string, p: Potongan) {
  const s = await siapkanPotonganRekaman(sesiId, p.nomor);
  if (!s.ok) throw new Error(s.pesan);
  if (!s.data.sudahAda) {
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", p.blob, `${String(p.nomor).padStart(5, "0")}.webm`);
    const r = await fetch(s.data.signedUrl, { method: "PUT", body, headers: { "x-upsert": "false" } });
    if (!r.ok) {
      const teks = await r.text().catch(() => "");
      if (!/duplicate|already exists/i.test(teks)) throw new Error("Unggahan potongan terputus.");
    }
  }
  const k = await konfirmasiPotonganRekaman(sesiId, p.nomor);
  if (!k.ok) throw new Error(k.pesan);
  return k.data.jumlah;
}

// ---------------------------------------------------------------------------
// Hook perekam
// ---------------------------------------------------------------------------
export type StatusRekam = "diam" | "menyiapkan" | "merekam" | "jeda" | "menyimpan";

type AturSesi = React.Dispatch<React.SetStateAction<SesiKlien>>;

export function usePerekam(sesi: SesiKlien, setSesi: AturSesi) {
  const sesiId = sesi.id;
  const [status, setStatus] = useState<StatusRekam>("diam");
  const [detik, setDetik] = useState(0);
  const [antre, setAntre] = useState(0);
  const [galatUnggah, setGalatUnggah] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const nomor = useRef(1);
  const antrean = useRef<Potongan[]>([]);
  const sibukAntre = useRef(false);
  const hidup = useRef(true);
  const waktu = useRef<{ mulai: number; terkumpul: number }>({ mulai: 0, terkumpul: 0 });
  const sesiRef = useRef(sesi);
  useEffect(() => { sesiRef.current = sesi; }, [sesi]);

  const proses = useCallback(async () => {
    if (sibukAntre.current) return;
    sibukAntre.current = true;
    let jeda = 2000;
    try {
      while (hidup.current && antrean.current.length) {
        const p = antrean.current[0];
        try {
          const jumlah = await unggahPotongan(sesiId, p);
          antrean.current.shift();
          await hapusIdb(p.kunci);
          setAntre(antrean.current.length);
          setGalatUnggah(null);
          setSesi((x) => ({ ...x, rekaman_jumlah_potongan: jumlah, potongan_belum_digabung: x.potongan_belum_digabung + Math.max(0, jumlah - x.rekaman_jumlah_potongan) }));
          jeda = 2000;
        } catch (e) {
          setGalatUnggah(navigator.onLine ? (e as Error).message : "Tidak tersambung — potongan rekaman disimpan di perangkat ini dan akan diunggah otomatis.");
          await tunggu(jeda);
          jeda = Math.min(jeda * 2, 30000);
        }
      }
    } finally {
      sibukAntre.current = false;
    }
  }, [sesiId, setSesi]);

  const masukkan = useCallback(async (n: number, blob: Blob) => {
    const p: Potongan = { kunci: `${sesiId}:${n}:${Date.now()}`, sesiId, nomor: n, blob };
    antrean.current.push(p);
    setAntre(antrean.current.length);
    await simpanIdb(p);
    void proses();
  }, [proses, sesiId]);

  // Pulihkan potongan tertunda dari IndexedDB (mis. setelah peramban tertutup saat merekam).
  useEffect(() => {
    hidup.current = true;
    let batal = false;
    muatIdb(sesiId).then((daftar) => {
      if (batal || !daftar.length) return;
      const ada = new Set(antrean.current.map((x) => x.kunci));
      antrean.current.push(...daftar.filter((x) => !ada.has(x.kunci)));
      antrean.current.sort((a, b) => a.nomor - b.nomor);
      setAntre(antrean.current.length);
      toast.info(`Mengunggah ${daftar.length} potongan rekaman yang tertunda…`);
      void proses();
    });
    const online = () => void proses();
    window.addEventListener("online", online);
    return () => {
      batal = true;
      hidup.current = false;
      window.removeEventListener("online", online);
    };
  }, [proses, sesiId]);

  // Penghitung durasi rekaman (tanpa waktu jeda)
  useEffect(() => {
    if (status !== "merekam") return;
    const t = setInterval(() => setDetik(Math.floor((waktu.current.terkumpul + Date.now() - waktu.current.mulai) / 1000)), 500);
    return () => clearInterval(t);
  }, [status]);

  // Peringatan bila menutup halaman saat merekam / masih ada potongan tertunda
  useEffect(() => {
    if (status === "diam" && antre === 0) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [status, antre]);

  const mulai = useCallback(async () => {
    const kunci = alasanRekamTerkunci(sesiRef.current);
    if (kunci) { toast.error(kunci); return; }
    const mime = pilihMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Peramban ini tidak mendukung perekaman. Gunakan Chrome, Edge, atau Safari versi terbaru.");
      return;
    }
    setStatus("menyiapkan");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setStatus("diam");
      toast.error("Mikrofon tidak dapat dipakai. Izinkan akses mikrofon di peramban lalu coba lagi.");
      return;
    }
    const h = await mulaiRekaman(sesiId).catch(() => ({ ok: false, pesan: "Gagal terhubung ke server." }) as Hasil<never>);
    if (!h.ok) {
      stream.getTracks().forEach((t) => t.stop());
      setStatus("diam");
      toast.error(h.pesan);
      return;
    }
    nomor.current = h.data.nomorBerikut;
    const r = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
    r.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) void masukkan(nomor.current++, ev.data);
    };
    r.onstop = () => stream.getTracks().forEach((t) => t.stop());
    r.onerror = () => toast.error("Perekaman terhenti karena gangguan perangkat. Tekan Hentikan & simpan.");
    rec.current = r;
    waktu.current = { mulai: Date.now(), terkumpul: 0 };
    setDetik(0);
    r.start(h.data.detikPotongan * 1000);
    setStatus("merekam");
  }, [masukkan, sesiId]);

  const jedaLanjut = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    if (r.state === "recording") {
      r.pause();
      waktu.current.terkumpul += Date.now() - waktu.current.mulai;
      setStatus("jeda");
    } else if (r.state === "paused") {
      r.resume();
      waktu.current.mulai = Date.now();
      setStatus("merekam");
    }
  }, []);

  /** Gabungkan potongan di server (setelah antrean kosong). */
  const gabungkan = useCallback(async (durasi: number | null) => {
    setStatus("menyimpan");
    const batas = Date.now() + 90_000;
    while (antrean.current.length && Date.now() < batas) await tunggu(500);
    if (antrean.current.length) {
      setStatus("diam");
      toast.error("Masih ada potongan rekaman yang belum terunggah. Rekaman akan disimpan setelah sambungan pulih — tekan Gabungkan & simpan nanti.");
      return;
    }
    const h = await selesaikanRekaman(sesiId, durasi).catch(() => ({ ok: false, pesan: "Gagal terhubung ke server." }) as Hasil<never>);
    setStatus("diam");
    if (!h.ok) { toast.error(h.pesan); return; }
    setSesi(h.data.sesi);
    if (h.data.hilang.length) toast.warning(`Rekaman tersimpan, tetapi ${h.data.hilang.length} potongan tidak terbaca (nomor ${h.data.hilang.slice(0, 5).join(", ")}${h.data.hilang.length > 5 ? "…" : ""}).`);
    else toast.success("Rekaman tersimpan di penyimpanan privat.");
  }, [sesiId, setSesi]);

  const hentikan = useCallback(async () => {
    const r = rec.current;
    if (!r) return;
    if (r.state === "recording") waktu.current.terkumpul += Date.now() - waktu.current.mulai;
    const durasi = Math.round(waktu.current.terkumpul / 1000);
    setStatus("menyimpan");
    await new Promise<void>((res) => {
      r.addEventListener("stop", () => res(), { once: true });
      try { r.stop(); } catch { res(); }
    });
    rec.current = null;
    await tunggu(50); // beri waktu ondataavailable terakhir masuk antrean
    await gabungkan(durasi);
  }, [gabungkan]);

  return { status, detik, antre, galatUnggah, mulai, jedaLanjut, hentikan, gabungkan };
}

export type Perekam = ReturnType<typeof usePerekam>;

// ---------------------------------------------------------------------------
// Spanduk "SEDANG MEREKAM" — terlihat oleh semua orang di ruangan
// ---------------------------------------------------------------------------
export function SpandukRekam({ perekam }: { perekam: Perekam }) {
  if (perekam.status !== "merekam" && perekam.status !== "jeda" && perekam.status !== "menyimpan") return null;
  const jeda = perekam.status === "jeda";
  const simpan = perekam.status === "menyimpan";
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-white shadow-lg sm:px-6", jeda || simpan ? "bg-amber-700" : "bg-red-700")}>
      <p className="flex min-w-0 flex-1 items-center gap-3 text-base font-bold sm:text-lg">
        <span className={cn("inline-block size-4 shrink-0 rounded-full bg-white", !jeda && !simpan && "kedip-rekam")} aria-hidden />
        <span className={cn(!jeda && !simpan && "kedip-rekam")}>
          {simpan ? "MENYIMPAN REKAMAN…" : jeda ? "⏸ PEREKAMAN DIJEDA" : "● SEDANG MEREKAM"}
        </span>
        <span className="hidden font-medium sm:inline">— pemeriksaan ini direkam atas persetujuan terperiksa</span>
      </p>
      <span className="font-mono text-lg font-bold tabular-nums">{formatDurasi(perekam.detik)}</span>
      {!simpan && (
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={perekam.jedaLanjut} className="bg-white/90 text-black hover:bg-white">
            {jeda ? <><Play aria-hidden /> Lanjutkan</> : <><Pause aria-hidden /> Jeda</>}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void perekam.hentikan()} className="bg-white text-red-800 hover:bg-white/90">
            <Square aria-hidden /> Hentikan &amp; simpan
          </Button>
        </div>
      )}
      <p className="w-full text-sm font-medium sm:hidden">Pemeriksaan ini direkam atas persetujuan terperiksa.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel perekaman: persetujuan, tombol rekam, pemutaran, retensi
// ---------------------------------------------------------------------------
export function PanelRekaman({
  sesi, setSesi, perekam, bolehUbah, admin, retensiHari,
}: { sesi: SesiKlien; setSesi: AturSesi; perekam: Perekam; bolehUbah: boolean; admin: boolean; retensiHari: number }) {
  const { jalankan, sibuk } = useAksi();
  const [unggah, setUnggah] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const kunci = alasanRekamTerkunci(sesi);
  const aktif = perekam.status !== "diam";
  const ubah = (h: Promise<Hasil<SesiKlien>>) => jalankan(() => h, { segarkan: false, lalu: setSesi });

  async function unggahSurat(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setUnggah(true);
    try {
      let baru: SesiKlien | null = null;
      await unggahLangsung(f, f.name, (info) => siapkanUnggahPersetujuan(sesi.id, info), async (info) => {
        const h = await konfirmasiUnggahPersetujuan(sesi.id, info);
        if (h.ok) baru = h.data;
        return h;
      });
      if (baru) setSesi(baru);
      toast.success("Surat persetujuan perekaman tersimpan.");
    } catch (e) {
      toast.error((e as Error).message || "Unggahan gagal.");
    } finally {
      setUnggah(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      {sesi.rekaman_dihapus_pada ? (
        <Catatan jenis="info" judul="Rekaman telah dihapus">
          Rekaman sesi ini dihapus otomatis pada {tanggalPanjang(sesi.rekaman_dihapus_pada)} karena masa simpannya berakhir.
        </Catatan>
      ) : sesi.persetujuan_ditolak ? (
        <Catatan jenis="info" judul="Terperiksa menolak perekaman">
          Pemeriksaan tetap berjalan normal tanpa rekaman. Penolakan dicatat di Berita Acara Pemeriksaan.
          <strong> Menolak perekaman adalah hak terperiksa dan tidak menjadi hal yang memberatkan.</strong>
        </Catatan>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Perekaman hanya boleh dengan persetujuan tertulis terperiksa. Rekaman disimpan di penyimpanan privat, hanya dapat diputar
            oleh pengguna SIMPEL (setiap pemutaran tercatat), dan dihapus otomatis {retensiHari} hari setelah kasus selesai atau dihentikan.
          </p>
          <Button asChild variant="outline" className="w-full justify-start">
            <Link href={`/kasus/${sesi.entri_id}?tab=dokumen`}>
              <FileSignature aria-hidden /> Buat Surat Persetujuan Perekaman
            </Link>
          </Button>
          <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3", sesi.persetujuan_rekam && "border-aman/50 bg-aman-muda")}>
            <Checkbox
              className="mt-0.5 size-5"
              checked={sesi.persetujuan_rekam}
              disabled={!bolehUbah || sibuk || aktif}
              onCheckedChange={(v) => ubah(aturPersetujuanRekam(sesi.id, v === true))}
            />
            <span className="text-sm leading-snug">Terperiksa telah menyetujui perekaman dan menandatangani surat persetujuan.</span>
          </label>
          <div className="rounded-lg border p-3">
            {sesi.ada_file_persetujuan ? (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <ShieldCheck className="size-5 text-aman" aria-hidden />
                <span className="font-medium">Surat persetujuan bertanda tangan sudah diunggah.</span>
                {sesi.berkas_persetujuan_id && (
                  <a className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline" href={`/api/berkas/${sesi.berkas_persetujuan_id}`} target="_blank" rel="noreferrer">Lihat</a>
                )}
              </p>
            ) : (
              <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><FileUp className="size-5" aria-hidden /> Surat persetujuan bertanda tangan belum diunggah.</p>
            )}
            {bolehUbah && (
              <>
                <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" id={`surat-${sesi.id}`} onChange={(e) => unggahSurat(e.target.files)} />
                <Button type="button" variant="outline" className="mt-1 w-full" disabled={unggah || aktif} onClick={() => input.current?.click()}>
                  {unggah ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
                  {sesi.ada_file_persetujuan ? "Ganti pindaian surat" : "Unggah pindaian surat (PDF/foto)"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {!sesi.rekaman_dihapus_pada && bolehUbah && (
        <label className="flex min-h-11 cursor-pointer items-start justify-between gap-3 rounded-lg border p-3">
          <span className="text-sm leading-snug">
            <span className="font-medium">Terperiksa menolak perekaman</span>
            <span className="block text-muted-foreground">Pemeriksaan tetap berjalan; penolakan dicatat di BAP dan tidak memberatkan.</span>
          </span>
          <Switch checked={sesi.persetujuan_ditolak} disabled={sibuk || aktif} onCheckedChange={(v) => ubah(aturPenolakanRekam(sesi.id, v))} />
        </label>
      )}

      {/* Tombol rekam — terkunci sampai persetujuan dicentang DAN surat terunggah */}
      {!sesi.persetujuan_ditolak && !sesi.rekaman_dihapus_pada && bolehUbah && (
        <div className="space-y-2">
          {perekam.status === "diam" || perekam.status === "menyiapkan" ? (
            <Button type="button" size="lg" className="w-full bg-red-700 text-white hover:bg-red-800" disabled={!!kunci || perekam.status === "menyiapkan" || perekam.antre > 0}
              onClick={() => void perekam.mulai()} aria-describedby={kunci ? `kunci-${sesi.id}` : undefined}>
              {kunci ? <Lock aria-hidden /> : perekam.status === "menyiapkan" ? <Loader2 className="animate-spin" aria-hidden /> : <Mic aria-hidden />}
              {sesi.rekaman_ada ? "Rekam lanjutan" : "Mulai merekam"}
            </Button>
          ) : (
            <p className="rounded-lg bg-red-700/10 p-3 text-sm font-semibold text-red-800 dark:text-red-300">
              {perekam.status === "menyimpan" ? "Menyimpan rekaman…" : `Sedang merekam · ${formatDurasi(perekam.detik)}`}
            </p>
          )}
          {kunci && <p id={`kunci-${sesi.id}`} className="flex gap-2 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden />{kunci}</p>}
          {perekam.antre > 0 && <p className="text-sm text-waspada">{perekam.antre} potongan rekaman menunggu diunggah…</p>}
          {perekam.galatUnggah && <p className="text-sm text-lewat">{perekam.galatUnggah}</p>}
          {perekam.status === "diam" && perekam.antre === 0 && sesi.potongan_belum_digabung > 0 && (
            <Catatan jenis="waspada" judul="Ada potongan rekaman yang belum disatukan">
              {sesi.potongan_belum_digabung} potongan sudah terunggah tetapi belum digabung (mis. karena halaman tertutup saat merekam).
              <Button type="button" className="mt-2 w-full" onClick={() => void perekam.gabungkan(null)}>Gabungkan &amp; simpan rekaman</Button>
            </Catatan>
          )}
        </div>
      )}

      {sesi.rekaman_ada && !sesi.rekaman_dihapus_pada && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Rekaman tersimpan{sesi.rekaman_durasi_detik ? ` · ${formatDurasi(sesi.rekaman_durasi_detik)}` : ""}</p>
          {/* preload="none": tautan bertanda hanya dibuat (dan dicatat) saat diputar */}
          <audio controls preload="none" src={`/api/rekaman/${sesi.id}`} className="w-full">
            Peramban tidak dapat memutar rekaman.
          </audio>
          <Button asChild variant="outline" className="w-full">
            <a href={`/api/rekaman/${sesi.id}?unduh=1`}><Download aria-hidden /> Unduh rekaman</a>
          </Button>
          <p className="text-xs text-muted-foreground">Setiap pemutaran dan pengunduhan tercatat di log audit. Bila rekaman lanjutan tidak terputar di peramban, unduh dan buka dengan pemutar seperti VLC.</p>
        </div>
      )}

      {(sesi.rekaman_ada || sesi.rekaman_hapus_pada) && !sesi.rekaman_dihapus_pada && (
        <div className="space-y-2 text-sm">
          <p className="flex gap-2">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            {sesi.rekaman_hapus_pada
              ? <span>Dihapus otomatis pada <strong>{tanggalPanjang(sesi.rekaman_hapus_pada)}</strong>{sesi.rekaman_diperpanjang && " (sudah diperpanjang)"}.</span>
              : <span>Akan dihapus otomatis {retensiHari} hari setelah kasus selesai atau dihentikan.</span>}
          </p>
          {sesi.rekaman_diperpanjang && sesi.rekaman_alasan_perpanjangan && (
            <p className="text-muted-foreground">Alasan perpanjangan: {sesi.rekaman_alasan_perpanjangan}</p>
          )}
          {admin && sesi.rekaman_hapus_pada && !sesi.rekaman_diperpanjang && <DialogPerpanjang sesi={sesi} setSesi={setSesi} />}
        </div>
      )}
    </div>
  );
}

function DialogPerpanjang({ sesi, setSesi }: { sesi: SesiKlien; setSesi: AturSesi }) {
  const [buka, setBuka] = useState(false);
  const [tanggal, setTanggal] = useState("");
  const [alasan, setAlasan] = useState("");
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open={buka} onOpenChange={setBuka}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full">Perpanjang masa simpan (sekali)</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Perpanjang masa simpan rekaman</DialogTitle>
          <DialogDescription>
            Perpanjangan hanya dapat dilakukan <strong>satu kali</strong> dengan alasan tertulis dan tercatat di log audit.
            Tanggal hapus sekarang: {tanggalPanjang(sesi.rekaman_hapus_pada)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tgl-perpanjang">Tanggal hapus baru</Label>
            <Input id="tgl-perpanjang" type="date" value={tanggal} min={sesi.rekaman_hapus_pada ?? undefined} onChange={(e) => setTanggal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alasan-perpanjang">Alasan (wajib)</Label>
            <Textarea id="alasan-perpanjang" rows={3} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. rekaman masih diperlukan untuk upaya administratif yang sedang berjalan." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBuka(false)}>Batal</Button>
          <Button disabled={sibuk || !tanggal || alasan.trim().length < 10}
            onClick={() => jalankan(() => perpanjangRetensiRekaman(sesi.id, tanggal, alasan.trim()), { segarkan: false, lalu: (s) => { setSesi(s); setBuka(false); } })}>
            {sibuk && <Loader2 className="animate-spin" aria-hidden />} Perpanjang
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
