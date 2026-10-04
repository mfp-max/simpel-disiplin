"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCircle2, FileSpreadsheet, Loader2, Lock, RotateCcw, Save, Upload, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Catatan, Panel } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { useAksi } from "@/components/simpel/interaktif";
import type { LembarExcel, PemetaanKolom } from "@/lib/simpega/excel";
import {
  FIELD_PEGAWAI, KETERANGAN_TERLARANG, LABEL_FIELD, LABEL_KOLOM, adalahField, hurufKolom, kolomTerlarang, pecahBatch, tebakPemetaan,
  validasiKumpulan, type BarisDitolak, type BarisMasuk, type FieldPegawai,
} from "@/lib/simpega/normalisasi";
import type { BarisDilewati, HasilBatch, KolomMasuk } from "@/lib/simpega/impor";
import { jalankanBatch, mulaiImpor, pratinjauBatch, selesaikanImpor, simpanProfil } from "./_aksi";

type Profil = { id: string; nama: string; pemetaan: Record<string, string> };

const LANGKAH = ["Unggah", "Pratinjau", "Pemetaan", "Validasi", "Konfirmasi", "Hasil"] as const;
const UKURAN_BATCH = 200;
const BATAS_MB = 30;

const kelasSelect =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

type Ringkasan = {
  baru: number; diperbarui: number; tanpaPerubahan: number; ditolak: BarisDitolak[]; dilewati: BarisDilewati[]; unitBaru: Set<string>;
  statusTakDikenal: Record<string, number>;
};
const ringkasanKosong = (): Ringkasan => ({ baru: 0, diperbarui: 0, tanpaPerubahan: 0, ditolak: [], dilewati: [], unitBaru: new Set(), statusTakDikenal: {} });
function gabung(r: Ringkasan, h: HasilBatch): Ringkasan {
  const st = { ...r.statusTakDikenal };
  for (const [k, n] of Object.entries(h.statusTakDikenal)) st[k] = (st[k] ?? 0) + n;
  return {
    baru: r.baru + h.baru, diperbarui: r.diperbarui + h.diperbarui, tanpaPerubahan: r.tanpaPerubahan + h.tanpaPerubahan,
    ditolak: [...r.ditolak, ...h.ditolak].sort((a, b) => a.baris - b.baris), dilewati: [...r.dilewati, ...h.dilewatiManual].sort((a, b) => a.baris - b.baris),
    unitBaru: new Set([...r.unitBaru, ...h.unitBaru]), statusTakDikenal: st,
  };
}

export function WizardImpor({ profil, statusDikenal }: { profil: Profil[]; statusDikenal: string[] }) {
  const router = useRouter();
  const [langkah, setLangkah] = useState(0);
  const [berkas, setBerkas] = useState<{ nama: string; lembar: LembarExcel } | null>(null);
  const [pemetaan, setPemetaan] = useState<PemetaanKolom>({});
  const [profilId, setProfilId] = useState<string | null>(null);
  const [membaca, setMembaca] = useState(false);
  const [galatBerkas, setGalatBerkas] = useState<string | null>(null);
  const [proses, setProses] = useState<{ jalan: boolean; selesai: number; total: number; galat: string | null }>({ jalan: false, selesai: 0, total: 0, galat: null });
  const [pratinjau, setPratinjau] = useState<Ringkasan | null>(null);
  const [hasil, setHasil] = useState<Ringkasan | null>(null);
  const judulRef = useRef<HTMLHeadingElement>(null);

  const kolom: KolomMasuk[] = useMemo(() => {
    if (!berkas) return [];
    const out: KolomMasuk[] = [];
    for (const [k, f] of Object.entries(pemetaan)) {
      const i = Number(k);
      if (f && adalahField(f) && !kolomTerlarang(berkas.lembar.header[i])) out.push({ indeks: i, header: berkas.lembar.header[i], field: f });
    }
    return out.sort((a, b) => a.indeks - b.indeks);
  }, [berkas, pemetaan]);

  const baris: BarisMasuk[] = useMemo(() => {
    if (!berkas) return [];
    return berkas.lembar.baris.map((r, idx) => {
      const o: BarisMasuk = { nomor: idx + 2 };
      for (const k of kolom) o[k.field as FieldPegawai] = r[k.indeks] ?? "";
      return o;
    });
  }, [berkas, kolom]);

  const validasi = useMemo(() => (langkah >= 3 && baris.length ? validasiKumpulan(baris, statusDikenal) : null), [langkah, baris, statusDikenal]);

  function ke(n: number) {
    setLangkah(n);
    requestAnimationFrame(() => judulRef.current?.focus());
  }

  function reset() {
    setBerkas(null); setPemetaan({}); setProfilId(null); setPratinjau(null); setHasil(null);
    setProses({ jalan: false, selesai: 0, total: 0, galat: null }); setGalatBerkas(null); ke(0);
  }

  async function bacaBerkas(file: File | undefined) {
    if (!file) return;
    setGalatBerkas(null);
    if (!/\.(xlsx|xls)$/i.test(file.name)) { setGalatBerkas("Pilih berkas Excel (.xlsx atau .xls)."); return; }
    if (file.size > BATAS_MB * 1024 * 1024) { setGalatBerkas(`Berkas lebih dari ${BATAS_MB} MB.`); return; }
    setMembaca(true);
    try {
      const { bacaWorkbook } = await import("@/lib/simpega/excel");
      const lembar = bacaWorkbook(new Uint8Array(await file.arrayBuffer()));
      if (!lembar.header.length || !lembar.baris.length) throw new Error("kosong");
      setBerkas({ nama: file.name, lembar });
      setPemetaan(tebakPemetaan(lembar.header));
      setProfilId(null); setPratinjau(null); setHasil(null);
      ke(1);
    } catch {
      setGalatBerkas("Berkas tidak dapat dibaca. Pastikan berkas Excel rekap Simpega dengan header di baris pertama.");
    } finally {
      setMembaca(false);
    }
  }

  async function jalankanPratinjau() {
    const batch = pecahBatch(baris, UKURAN_BATCH);
    setPratinjau(null);
    setProses({ jalan: true, selesai: 0, total: baris.length, galat: null });
    let r = ringkasanKosong();
    try {
      for (const b of batch) {
        const h = await pratinjauBatch(kolom, b);
        if (!h.ok) { setProses((p) => ({ ...p, jalan: false, galat: h.pesan })); return; }
        r = gabung(r, h.data);
        setProses((p) => ({ ...p, selesai: p.selesai + b.length }));
      }
      setPratinjau(r);
      setProses((p) => ({ ...p, jalan: false }));
    } catch {
      setProses((p) => ({ ...p, jalan: false, galat: "Gagal terhubung ke server. Periksa sambungan internet Anda lalu coba lagi." }));
    }
  }

  async function jalankanImpor() {
    if (!berkas) return;
    const batch = pecahBatch(baris, UKURAN_BATCH);
    setHasil(null);
    setProses({ jalan: true, selesai: 0, total: baris.length, galat: null });
    ke(5);
    let r = ringkasanKosong();
    try {
      const m = await mulaiImpor({ namaFile: berkas.nama, profilId, jumlahBaris: baris.length, kolom });
      if (!m.ok) { setProses((p) => ({ ...p, jalan: false, galat: m.pesan })); return; }
      for (const b of batch) {
        const h = await jalankanBatch(m.data.id, kolom, b);
        if (!h.ok) {
          setHasil(r);
          setProses((p) => ({ ...p, jalan: false, galat: `${h.pesan} Baris yang sudah terproses tetap tersimpan dan tercatat di riwayat impor.` }));
          return;
        }
        r = gabung(r, h.data);
        setProses((p) => ({ ...p, selesai: p.selesai + b.length }));
      }
      const s = await selesaikanImpor(m.data.id);
      if (!s.ok) toast.error(s.pesan);
      else toast.success("Impor selesai");
      setHasil(r);
      setProses((p) => ({ ...p, jalan: false }));
      router.refresh();
    } catch {
      setHasil(r);
      setProses((p) => ({ ...p, jalan: false, galat: "Sambungan terputus. Baris yang sudah terproses tetap tersimpan; lihat riwayat impor, lalu ulangi impor (baris yang sama akan diperbarui, tidak digandakan)." }));
    }
  }

  return (
    <Panel>
      <ol className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Tahapan impor">
        {LANGKAH.map((l, i) => (
          <li key={l} aria-current={i === langkah ? "step" : undefined}
            className={cn("flex items-center gap-2 rounded-lg border px-2 py-2 text-sm",
              i === langkah ? "border-primary bg-primary/10 font-semibold" : i < langkah ? "text-foreground" : "text-muted-foreground")}>
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              i < langkah ? "bg-aman text-white" : i === langkah ? "bg-primary text-primary-foreground" : "bg-secondary")}>
              {i < langkah ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className="truncate">{l}</span>
          </li>
        ))}
      </ol>

      <h2 ref={judulRef} tabIndex={-1} className="mb-4 text-lg font-semibold outline-none">
        Langkah {langkah + 1}: {["Unggah berkas Excel", "Pratinjau 10 baris pertama", "Petakan kolom ke isian SIMPEL", "Hasil validasi", "Konfirmasi", "Hasil impor"][langkah]}
      </h2>

      {langkah === 0 && (
        <div className="space-y-4">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); bacaBerkas(e.dataTransfer.files?.[0]); }}
            className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input px-4 py-8 text-center hover:border-primary/60 hover:bg-accent/50"
          >
            {membaca ? <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden /> : <FileSpreadsheet className="size-8 text-muted-foreground" aria-hidden />}
            <span className="font-medium">{membaca ? "Membaca berkas…" : "Pilih atau seret berkas Excel Simpega ke sini"}</span>
            <span className="text-sm text-muted-foreground">Format .xlsx · baris pertama berisi nama kolom · maks. {BATAS_MB} MB</span>
            <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
              disabled={membaca} onChange={(e) => { bacaBerkas(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {galatBerkas && <Catatan jenis="lewat">{galatBerkas}</Catatan>}
        </div>
      )}

      {langkah === 1 && berkas && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{berkas.nama}</strong> · lembar “{berkas.lembar.namaLembar}” · {berkas.lembar.baris.length} baris data · {berkas.lembar.header.length} kolom.
            Isi kolom data pribadi sensitif disembunyikan.
          </p>
          <div className="max-h-[28rem] overflow-auto rounded-lg border">
            <table className="w-max min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-muted text-[13px]">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Baris</th>
                  {berkas.lembar.header.map((h, i) => (
                    <th key={i} scope="col" className="max-w-56 px-3 py-2 font-semibold">
                      <span className="block text-xs font-normal text-muted-foreground">{hurufKolom(i)} · #{i}</span>
                      {h || <em className="font-normal text-muted-foreground">(tanpa nama)</em>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {berkas.lembar.baris.slice(0, 10).map((r, ri) => (
                  <tr key={ri}>
                    <td className="px-3 py-2 text-muted-foreground">{ri + 2}</td>
                    {r.map((v, i) => (
                      <td key={i} className="max-w-56 truncate px-3 py-2" data-pii>
                        {kolomTerlarang(berkas.lembar.header[i]) ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="size-3.5" aria-hidden />disembunyikan</span> : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Navigasi kembali={() => ke(0)} lanjut={() => ke(2)} labelKembali="Ganti berkas" />
        </div>
      )}

      {langkah === 2 && berkas && (
        <LangkahPemetaan
          lembar={berkas.lembar} pemetaan={pemetaan} setPemetaan={setPemetaan} profil={profil} profilId={profilId} setProfilId={setProfilId}
          kembali={() => ke(1)} lanjut={() => ke(3)}
        />
      )}

      {langkah === 3 && validasi && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Angka label="Baris dibaca" nilai={baris.length} />
            <Angka label="Lolos validasi" nilai={validasi.sah.length} warna="aman" />
            <Angka label="Ditolak" nilai={validasi.ditolak.length} warna={validasi.ditolak.length ? "lewat" : undefined} />
          </div>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <ItemMasalah ok={!validasi.masalah.nipGanda} teks={validasi.masalah.nipGanda ? `${validasi.masalah.nipGanda} baris dengan NIP (atau nama + tanggal lahir) ganda di berkas` : "Tidak ada NIP ganda di berkas"} />
            <ItemMasalah ok={!validasi.masalah.tanggal} teks={validasi.masalah.tanggal ? `${validasi.masalah.tanggal} isian tanggal tidak valid` : "Semua format tanggal valid"} />
            <ItemMasalah ok={!validasi.masalah.jenisKelamin} teks={validasi.masalah.jenisKelamin ? `${validasi.masalah.jenisKelamin} isian jenis kelamin bukan L/P` : "Jenis kelamin valid"} />
            <ItemMasalah ok={!Object.keys(validasi.statusTakDikenal).length} teks={Object.keys(validasi.statusTakDikenal).length ? `${Object.keys(validasi.statusTakDikenal).length} nilai Status Pegawai belum dikenal` : "Semua Status Pegawai dikenal"} />
          </ul>
          {Object.keys(validasi.statusTakDikenal).length > 0 && (
            <Catatan jenis="waspada" judul="Status Pegawai belum ada di tabel pemetaan">
              {Object.entries(validasi.statusTakDikenal).map(([s, n]) => `${s} (${n} baris)`).join(", ")}. Baris ini tetap diimpor dengan rezim
              “perlu verifikasi”. Tambahkan pemetaannya di{" "}
              <Link href="/pengaturan/status-pegawai" target="_blank" className="font-medium underline">Pengaturan → Status Pegawai</Link>, lalu tekan “Terapkan ulang ke pegawai”.
            </Catatan>
          )}
          {validasi.ditolak.length > 0 && <DaftarTolak ditolak={validasi.ditolak} />}
          <Navigasi kembali={() => ke(2)} lanjut={() => { ke(4); jalankanPratinjau(); }} labelLanjut="Periksa ke basis data" nonaktif={!validasi.sah.length} />
        </div>
      )}

      {langkah === 4 && (
        <div className="space-y-5">
          {proses.jalan && <Kemajuan label="Mencocokkan dengan data pegawai yang sudah ada…" selesai={proses.selesai} total={proses.total} />}
          {proses.galat && <Catatan jenis="lewat">{proses.galat}</Catatan>}
          {pratinjau && !proses.jalan && (
            <>
              <p className="text-base">
                Akan diproses: <strong>{pratinjau.baru} baris baru</strong>, <strong>{pratinjau.diperbarui} diperbarui</strong>
                {pratinjau.tanpaPerubahan ? ` (${pratinjau.tanpaPerubahan} di antaranya tanpa perubahan isi)` : ""},{" "}
                <strong className={pratinjau.ditolak.length ? "text-lewat" : undefined}>{pratinjau.ditolak.length} ditolak</strong>.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Angka label="Baru" nilai={pratinjau.baru} warna="info" />
                <Angka label="Diperbarui" nilai={pratinjau.diperbarui} />
                <Angka label="Ditolak" nilai={pratinjau.ditolak.length} warna={pratinjau.ditolak.length ? "lewat" : undefined} />
              </div>
              {pratinjau.unitBaru.size > 0 && <p className="text-sm text-muted-foreground">{pratinjau.unitBaru.size} unit kerja baru akan dibuat dari kolom Direktorat/Fakultas dan Unit Kerja.</p>}
              {pratinjau.dilewati.length > 0 && <DaftarDilewati dilewati={pratinjau.dilewati} />}
              {pratinjau.ditolak.length > 0 && <DaftarTolak ditolak={pratinjau.ditolak} />}
            </>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => ke(3)} disabled={proses.jalan}>Kembali</Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              {proses.galat && <Button variant="outline" onClick={jalankanPratinjau}><RotateCcw /> Coba lagi</Button>}
              <Button size="lg" onClick={jalankanImpor} disabled={proses.jalan || !pratinjau || pratinjau.baru + pratinjau.diperbarui === 0}>
                <Upload /> Jalankan impor
              </Button>
            </div>
          </div>
        </div>
      )}

      {langkah === 5 && (
        <div className="space-y-5">
          {proses.jalan && <Kemajuan label="Menyimpan data pegawai…" selesai={proses.selesai} total={proses.total} />}
          {proses.galat && <Catatan jenis="lewat">{proses.galat}</Catatan>}
          {hasil && !proses.jalan && (
            <>
              {!proses.galat && (
                <Catatan jenis="aman" judul="Impor selesai">
                  {hasil.baru} pegawai baru ditambahkan, {hasil.diperbarui} diperbarui, {hasil.ditolak.length} baris ditolak.
                  Impor ini tercatat di riwayat impor dan log audit.
                </Catatan>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <Angka label="Baru" nilai={hasil.baru} warna="info" />
                <Angka label="Diperbarui" nilai={hasil.diperbarui} />
                <Angka label="Ditolak" nilai={hasil.ditolak.length} warna={hasil.ditolak.length ? "lewat" : undefined} />
              </div>
              {hasil.unitBaru.size > 0 && (
                <p className="text-sm text-muted-foreground">
                  {hasil.unitBaru.size} unit kerja baru dibuat. Periksa hierarki dan delegasinya di{" "}
                  <Link href="/pengaturan/unit-kerja" className="font-medium underline">Pengaturan → Unit Kerja</Link>.
                </p>
              )}
              {hasil.dilewati.length > 0 && <DaftarDilewati dilewati={hasil.dilewati} />}
              {hasil.ditolak.length > 0 && <DaftarTolak ditolak={hasil.ditolak} />}
            </>
          )}
          {!proses.jalan && (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={reset}>Impor berkas lain</Button>
              <Button asChild><Link href="/pegawai">Lihat daftar pegawai</Link></Button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
function LangkahPemetaan({
  lembar, pemetaan, setPemetaan, profil, profilId, setProfilId, kembali, lanjut,
}: {
  lembar: LembarExcel; pemetaan: PemetaanKolom; setPemetaan: (p: PemetaanKolom) => void; profil: Profil[]; profilId: string | null;
  setProfilId: (id: string | null) => void; kembali: () => void; lanjut: () => void;
}) {
  const { jalankan, sibuk } = useAksi();
  const [namaProfil, setNamaProfil] = useState(() => profil.find((p) => p.id === profilId)?.nama ?? "");
  const [hanyaTerpetakan, setHanyaTerpetakan] = useState(false);

  const contoh = useMemo(
    () => lembar.header.map((_, i) => {
      const out: string[] = [];
      for (const r of lembar.baris) {
        if (r[i]) out.push(r[i]);
        if (out.length === 3) break;
      }
      return out;
    }),
    [lembar],
  );

  const dipakaiOleh = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, f] of Object.entries(pemetaan)) if (f) m.set(f, Number(k));
    return m;
  }, [pemetaan]);

  function pilih(i: number, f: string) {
    const baru: PemetaanKolom = { ...pemetaan };
    if (f && adalahField(f)) {
      const lama = dipakaiOleh.get(f);
      if (lama !== undefined && lama !== i) {
        baru[lama] = null;
        toast.info(`${LABEL_FIELD[f]} dipindahkan dari kolom #${lama} ke kolom #${i}.`);
      }
      baru[i] = f;
    } else baru[i] = null;
    setPemetaan(baru);
  }

  function terapkanProfil(id: string) {
    const p = profil.find((x) => x.id === id);
    if (!p) { setProfilId(null); return; }
    const baru: PemetaanKolom = {};
    let tolak = 0;
    for (const [k, f] of Object.entries(p.pemetaan)) {
      const i = Number(k);
      if (i >= lembar.header.length || !adalahField(f)) continue;
      if (kolomTerlarang(lembar.header[i])) { tolak++; continue; }
      baru[i] = f;
    }
    setPemetaan(baru);
    setProfilId(id);
    setNamaProfil(p.nama);
    toast.success(`Profil “${p.nama}” diterapkan${tolak ? ` (${tolak} pemetaan ke kolom terlarang diabaikan)` : ""}.`);
  }

  const terpetakan = Object.entries(pemetaan).filter(([k, f]) => f && !kolomTerlarang(lembar.header[Number(k)]));
  const adaNama = terpetakan.some(([, f]) => f === "nama_lengkap_gelar");
  const adaNip = terpetakan.some(([, f]) => f === "nip");
  const indeksTampil = lembar.header.map((_, i) => i).filter((i) => !hanyaTerpetakan || pemetaan[i]);

  const pilihan = (i: number) => (
    <select
      id={`peta-${i}`}
      className={kelasSelect}
      value={pemetaan[i] ?? ""}
      onChange={(e) => pilih(i, e.target.value)}
      aria-label={`Isian tujuan untuk kolom #${i} ${lembar.header[i] || "(tanpa nama)"}`}
    >
      <option value="">— Jangan impor —</option>
      {FIELD_PEGAWAI.map((f) => {
        const lain = dipakaiOleh.get(f.kode);
        return <option key={f.kode} value={f.kode}>{f.label}{lain !== undefined && lain !== i ? ` (kini dari kolom #${lain})` : ""}</option>;
      })}
    </select>
  );

  const terlarang = (
    <span className="inline-flex items-start gap-1.5 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden />{KETERANGAN_TERLARANG}</span>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pilih-profil">Profil pemetaan tersimpan</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select id="pilih-profil" className={kelasSelect} value={profilId ?? ""} onChange={(e) => terapkanProfil(e.target.value)}>
              <option value="">{profil.length ? "— Pilih profil —" : "Belum ada profil tersimpan"}</option>
              {profil.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
            </select>
            <Button type="button" variant="outline" onClick={() => { setPemetaan(tebakPemetaan(lembar.header)); setProfilId(null); }}>
              <Wand2 /> Tebak ulang
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="nama-profil">Simpan pemetaan ini sebagai profil</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="nama-profil" value={namaProfil} onChange={(e) => setNamaProfil(e.target.value)} placeholder="mis. Rekap Simpega standar" />
            <Button
              type="button" variant="outline" disabled={sibuk || !namaProfil.trim() || !terpetakan.length}
              onClick={() => {
                const sama = profil.find((p) => p.nama.toLowerCase() === namaProfil.trim().toLowerCase());
                jalankan(() => simpanProfil({ id: sama?.id ?? null, nama: namaProfil, pemetaan: Object.fromEntries(terpetakan.map(([k, f]) => [k, f as string])) }), {
                  lalu: (d) => setProfilId(d.id),
                });
              }}
            >
              {sibuk ? <Loader2 className="animate-spin" /> : <Save />} {profil.some((p) => p.nama.toLowerCase() === namaProfil.trim().toLowerCase()) ? "Perbarui profil" : "Simpan profil"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {terpetakan.length} dari {lembar.header.length} kolom dipetakan. Pemetaan berdasarkan <strong>posisi kolom</strong>, bukan nama — nama kolom Simpega ada yang berulang.
        </p>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={hanyaTerpetakan} onChange={(e) => setHanyaTerpetakan(e.target.checked)} />
          Tampilkan hanya kolom terpetakan
        </label>
      </div>

      {/* Ponsel: kartu */}
      <ul className="space-y-2 md:hidden">
        {indeksTampil.map((i) => (
          <li key={i} className={cn("rounded-lg border p-3", kolomTerlarang(lembar.header[i]) && "bg-muted/40")}>
            <p className="text-xs text-muted-foreground">Kolom {hurufKolom(i)} · indeks #{i}</p>
            <p className="font-medium">{lembar.header[i] || <em className="font-normal text-muted-foreground">(tanpa nama)</em>}</p>
            {kolomTerlarang(lembar.header[i]) ? <div className="mt-2">{terlarang}</div> : (
              <>
                <p className="mt-1 truncate text-sm text-muted-foreground" data-pii>{contoh[i].length ? contoh[i].join(" · ") : "(kosong)"}</p>
                <div className="mt-2">{pilihan(i)}</div>
              </>
            )}
          </li>
        ))}
      </ul>

      {/* Layar lebar: tabel */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-[13px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="w-24 px-3 py-2 font-semibold">Kolom</th>
              <th scope="col" className="px-3 py-2 font-semibold">Nama header</th>
              <th scope="col" className="px-3 py-2 font-semibold">Contoh isi</th>
              <th scope="col" className="w-80 px-3 py-2 font-semibold">Isian tujuan</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {indeksTampil.map((i) => {
              const dilarang = kolomTerlarang(lembar.header[i]);
              return (
                <tr key={i} className={cn(dilarang && "bg-muted/40")}>
                  <td className="px-3 py-2 align-top text-muted-foreground">{hurufKolom(i)} · #{i}</td>
                  <td className="px-3 py-2 align-top font-medium">
                    <label htmlFor={dilarang ? undefined : `peta-${i}`}>{lembar.header[i] || <em className="font-normal text-muted-foreground">(tanpa nama)</em>}</label>
                  </td>
                  <td className="max-w-80 px-3 py-2 align-top text-muted-foreground">
                    {dilarang ? "—" : contoh[i].length ? (
                      <ul className="space-y-0.5" data-pii>{contoh[i].map((c, j) => <li key={j} className="truncate">{c}</li>)}</ul>
                    ) : "(kosong)"}
                  </td>
                  <td className="px-3 py-2 align-top">{dilarang ? terlarang : pilihan(i)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!adaNama && <Catatan jenis="lewat">Kolom <strong>Nama lengkap (dengan gelar)</strong> wajib dipetakan.</Catatan>}
      {adaNama && !adaNip && <Catatan jenis="waspada">Kolom NIP belum dipetakan. Tanpa NIP, pegawai dicocokkan dengan nama persis + tanggal lahir.</Catatan>}
      <Navigasi kembali={kembali} lanjut={lanjut} nonaktif={!adaNama} labelLanjut="Validasi data" />
    </div>
  );
}

// ---------------------------------------------------------------------------
function Navigasi({ kembali, lanjut, labelKembali = "Kembali", labelLanjut = "Lanjut", nonaktif }: { kembali: () => void; lanjut: () => void; labelKembali?: string; labelLanjut?: string; nonaktif?: boolean }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
      <Button variant="outline" onClick={kembali}>{labelKembali}</Button>
      <Button size="lg" onClick={lanjut} disabled={nonaktif}>{labelLanjut}</Button>
    </div>
  );
}

function Angka({ label, nilai, warna }: { label: string; nilai: number; warna?: "aman" | "lewat" | "info" }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold tabular-nums", warna === "aman" && "text-aman", warna === "lewat" && "text-lewat", warna === "info" && "text-info")}>
        {new Intl.NumberFormat("id-ID").format(nilai)}
      </p>
    </div>
  );
}

function ItemMasalah({ ok, teks }: { ok: boolean; teks: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-aman" aria-hidden /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-waspada" aria-hidden />}
      <span>{teks}</span>
    </li>
  );
}

function Kemajuan({ label, selesai, total }: { label: string; selesai: number; total: number }) {
  const persen = total ? Math.round((selesai / total) * 100) : 0;
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden /> {label} {selesai} / {total} baris</p>
      <Progress value={persen} aria-label={`${persen}%`} />
    </div>
  );
}

function DaftarTolak({ ditolak }: { ditolak: BarisDitolak[] }) {
  const [semua, setSemua] = useState(false);
  const tampil = semua ? ditolak : ditolak.slice(0, 20);
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Baris yang ditolak ({ditolak.length})</h3>
      <ul className="divide-y rounded-lg border text-sm">
        {tampil.map((d, i) => (
          <li key={`${d.baris}-${i}`} className="px-3 py-2">
            <span className="font-medium">Baris {d.baris}</span>
            {(d.nama || d.nip) && <span className="text-muted-foreground"> · <span data-pii>{[d.nama, d.nip].filter(Boolean).join(" · ")}</span></span>}
            <span className="block text-lewat">{d.alasan}</span>
          </li>
        ))}
      </ul>
      {ditolak.length > 20 && <Button variant="ghost" onClick={() => setSemua(!semua)}>{semua ? "Ringkas" : `Tampilkan semua ${ditolak.length}`}</Button>}
    </div>
  );
}

function DaftarDilewati({ dilewati }: { dilewati: BarisDilewati[] }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Dilewati karena disunting manual ({dilewati.length} pegawai)</h3>
      <p className="text-sm text-muted-foreground">Isian berikut pernah disunting manual di SIMPEL sehingga tidak ditimpa oleh data Simpega.</p>
      <ul className="divide-y rounded-lg border text-sm">
        {dilewati.slice(0, 50).map((d, i) => (
          <li key={`${d.baris}-${i}`} className="px-3 py-2">
            <span className="font-medium">Baris {d.baris}</span> · <span data-pii>{d.nama ?? d.nip ?? "—"}</span>
            <span className="mt-1 flex flex-wrap gap-1">{d.field.map((f) => <Lencana key={f} warna="waspada">{LABEL_KOLOM[f] ?? f}</Lencana>)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
