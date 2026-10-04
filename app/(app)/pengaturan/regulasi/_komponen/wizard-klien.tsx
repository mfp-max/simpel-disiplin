"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, CopyPlus, FilePlus2, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Catatan, Panel } from "@/components/simpel/dasar";
import { useAksi } from "@/components/simpel/interaktif";
import { Lencana } from "@/components/simpel/lencana";
import { buatKalender } from "@/lib/hari-kerja";
import { aturanDariDefinisi } from "@/lib/hukdis/dari-definisi";
import { jalankanFixture } from "@/lib/hukdis/mesin";
import { tanggalPanjang } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FORMAT_DEFINISI, kunciPasal, type DefinisiRegulasi, type DefRegulasi } from "@/lib/regulasi/definisi";
import type { RingkasRegresi } from "@/lib/regulasi/regresi";
import {
  SKEMA, barisKeDef, defKeBaris, jumlahIsi, periksaDefinisi, saranIdentitas, type Baris, type KonteksSkema, type SkemaTabel,
} from "../_skema";
import { muatDefinisiAksi, simpanWizardAksi } from "../_aksi";
import { DaftarBaris } from "./daftar-baris";
import { Pilih } from "./bidang";
import { DaftarFixtureDef } from "./regresi-klien";
import { UjiSkenario } from "./uji-skenario";

export type RegulasiPilihan = { id: string; kode: string; nama_singkat: string; judul: string; jenis: string; rezim_kode: string | null; utama: boolean; status: string };

const KUNCI_SIMPAN = "simpel.wizard-regulasi.v1";
const LANGKAH = ["Identitas", "Salin dari peraturan lama", "Kewajiban & larangan", "Tingkat, hukuman, ambang, tenggat, kewenangan, tahapan", "Uji dengan kasus contoh", "Aktifkan"];

type Draf = {
  langkah: number;
  def: DefinisiRegulasi;
  sumber: { id: string; nama: string } | null;
  manual: { kode: boolean; nama_singkat: boolean; nama_lengkap: boolean };
  alasan: string;
};

const drafKosong = (): Draf => ({
  langkah: 1,
  def: { format: FORMAT_DEFINISI, regulasi: { kode: "", jenis: "", judul: "", nama_singkat: "", utama: true, status: "draf", katalog_pasal_lengkap: true }, terkait: [] },
  sumber: null,
  manual: { kode: false, nama_singkat: false, nama_lengkap: false },
  alasan: "",
});

// ---------------------------------------------------------------------------
// Penggantian kode berantai di draf (tingkat/jenis/pasal diganti → rujukan ikut)
// ---------------------------------------------------------------------------
function gantiDalamKondisi(k: Record<string, unknown> | undefined, lama: string, baru: string) {
  if (!k) return k;
  const o = { ...k };
  if (o.tingkat_kode === lama) o.tingkat_kode = baru;
  if (Array.isArray(o.tingkat_kode_in)) o.tingkat_kode_in = o.tingkat_kode_in.map((x) => (x === lama ? baru : x));
  return o;
}

function gantiKode(def: DefinisiRegulasi, jenis: "tingkat" | "jenis" | "pasal", lama: string, baru: string): DefinisiRegulasi {
  if (!lama || lama === baru) return def;
  const d: DefinisiRegulasi = { ...def };
  const g = (v: string | null | undefined) => (v === lama ? baru : v);
  if (jenis === "tingkat") {
    d.jenis_hukuman = d.jenis_hukuman?.map((x) => ({ ...x, tingkat: g(x.tingkat) as string }));
    d.pasal = d.pasal?.map((x) => ({ ...x, tingkat: g(x.tingkat) }));
    d.ambang = d.ambang?.map((x) => ({ ...x, tingkat: g(x.tingkat) }));
    d.kewenangan = d.kewenangan?.map((x) => ({ ...x, tingkat: g(x.tingkat), syarat_tambahan: gantiDalamKondisi(x.syarat_tambahan, lama, baru) }));
    d.tahapan = d.tahapan?.map((x) => ({ ...x, tingkat: g(x.tingkat), kondisi: gantiDalamKondisi(x.kondisi, lama, baru) }));
    d.pemetaan = d.pemetaan?.map((x) => ({ ...x, tingkat: g(x.tingkat) as string }));
    d.kaidah = d.kaidah?.map((k) => {
      if (k.kunci === "tim_wajib_untuk" && Array.isArray(k.nilai)) return { ...k, nilai: k.nilai.map((x) => (x === lama ? baru : x)) };
      const t = (k.nilai as { tingkat?: unknown } | null)?.tingkat;
      if (k.kunci === "pemotongan_insentif_otomatis" && Array.isArray(t)) return { ...k, nilai: { ...(k.nilai as object), tingkat: t.map((x) => (x === lama ? baru : x)) } };
      return k;
    });
    d.fixture = d.fixture?.map((f) => ({
      ...f,
      masukan: f.masukan.tingkat === lama ? { ...f.masukan, tingkat: baru } : f.masukan,
      harapan: f.harapan.tingkat === lama ? { ...f.harapan, tingkat: baru } : f.harapan,
    }));
  } else if (jenis === "jenis") {
    d.jenis_hukuman = d.jenis_hukuman?.map((x) => ({ ...x, pengganti_sementara: g(x.pengganti_sementara) }));
    d.ambang = d.ambang?.map((x) => ({ ...x, jenis: g(x.jenis) }));
    d.fixture = d.fixture?.map((f) => ({ ...f, harapan: f.harapan.jenis_kode === lama ? { ...f.harapan, jenis_kode: baru } : f.harapan }));
  } else {
    d.pemetaan = d.pemetaan?.map((x) => ({ ...x, pasal: g(x.pasal) }));
  }
  return d;
}

function ujiDiMemori(def: DefinisiRegulasi, libur: string[]): RingkasRegresi {
  const kal = buatKalender(libur);
  let aturan;
  try {
    aturan = aturanDariDefinisi(def);
  } catch {
    return { jumlah: 0, lulus: 0, memburuk: [], hasil: [] };
  }
  const hasil = (def.fixture ?? []).map((f) => {
    try {
      const h = jalankanFixture(aturan, f.masukan ?? {}, f.harapan ?? {}, kal);
      return { id: null, nama: f.nama, lulus: h.lulus, lulusSebelumnya: null, selisih: h.selisih, hasil: h.hasil };
    } catch (e) {
      return { id: null, nama: f.nama, lulus: false, lulusSebelumnya: null, selisih: [(e as Error).message], hasil: {} };
    }
  });
  return { jumlah: hasil.length, lulus: hasil.filter((h) => h.lulus).length, memburuk: [], hasil };
}

// ---------------------------------------------------------------------------
// Editor satu bagian definisi (memakai daftar baris yang sama dengan editor)
// ---------------------------------------------------------------------------
type KunciDef = "tingkat" | "jenis_hukuman" | "pasal" | "ambang" | "tenggat" | "kewenangan" | "tahapan" | "pemetaan" | "kaidah";

function EditorDef({ skema, def, setDef, ctx }: { skema: SkemaTabel; def: DefinisiRegulasi; setDef: (d: DefinisiRegulasi) => void; ctx: KonteksSkema }) {
  const kunci = skema.def as KunciDef;
  const daftar = ((def[kunci] ?? []) as unknown as Record<string, unknown>[]);
  const baris: Baris[] = daftar.map((d, i) => ({ ...defKeBaris(skema, d), _i: i }));

  function kodeUnik(nilai: string, kecuali: number | null, ambil: (x: Record<string, unknown>) => unknown) {
    return !daftar.some((x, i) => i !== kecuali && String(ambil(x) ?? "") === nilai);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{skema.penjelasan}</p>
      <Catatan judul="Contoh">{skema.contoh}</Catatan>
      <DaftarBaris
        skema={skema}
        baris={baris}
        ctx={ctx}
        mode="def"
        simpanDef={(lama, data) => {
          const idx = lama ? Number(lama._i) : null;
          const lamaDef = idx !== null ? daftar[idx] : {};
          const baru = barisKeDef(skema, data, lamaDef);
          if (kunci === "tingkat" || kunci === "jenis_hukuman" || kunci === "tenggat") {
            if (!kodeUnik(String(baru.kode ?? ""), idx, (x) => x.kode)) return `Kode "${String(baru.kode)}" sudah dipakai baris lain.`;
          }
          if (kunci === "kaidah" && !kodeUnik(String(baru.kunci ?? ""), idx, (x) => x.kunci)) return `Kunci "${String(baru.kunci)}" sudah ada.`;
          if (kunci === "pasal" && !kodeUnik(kunciPasal(baru as never), idx, (x) => kunciPasal(x as never))) return `${kunciPasal(baru as never)} sudah ada.`;
          const arr = [...daftar];
          if (idx !== null) arr[idx] = baru;
          else arr.push(baru);
          let d = { ...def, [kunci]: arr } as DefinisiRegulasi;
          if (idx !== null) {
            if (kunci === "tingkat") d = gantiKode(d, "tingkat", String(lamaDef.kode ?? ""), String(baru.kode ?? ""));
            if (kunci === "jenis_hukuman") d = gantiKode(d, "jenis", String(lamaDef.kode ?? ""), String(baru.kode ?? ""));
            if (kunci === "pasal") d = gantiKode(d, "pasal", kunciPasal(lamaDef as never), kunciPasal(baru as never));
          }
          setDef(d);
          return null;
        }}
        ubahBebasDef={(b, kolom, nilai) => {
          const arr = [...daftar];
          arr[Number(b._i)] = { ...arr[Number(b._i)], [kolom]: nilai };
          setDef({ ...def, [kunci]: arr } as DefinisiRegulasi);
        }}
        hapusDef={(b) => {
          const x = daftar[Number(b._i)];
          const dipakai =
            (kunci === "tingkat" && [...(def.jenis_hukuman ?? []), ...(def.ambang ?? [])].some((y) => y.tingkat === x.kode)) ||
            (kunci === "jenis_hukuman" && (def.ambang ?? []).some((y) => y.jenis === x.kode));
          if (dipakai && !window.confirm("Baris ini masih dirujuk baris lain (mis. jenis hukuman atau ambang). Tetap hapus? Rujukannya perlu Anda perbaiki.")) return;
          setDef({ ...def, [kunci]: daftar.filter((_, i) => i !== Number(b._i)) } as DefinisiRegulasi);
        }}
        bawaanBaru={bawaanDef(kunci, def)}
      />
    </div>
  );
}

function bawaanDef(kunci: KunciDef, def: DefinisiRegulasi): Baris | undefined {
  switch (kunci) {
    case "tingkat": return { urutan: (def.tingkat?.length ?? 0) + 1 };
    case "jenis_hukuman": return { urutan: (def.jenis_hukuman?.length ?? 0) + 1 };
    case "tenggat": return { acuan_tanggal: "realisasi", arah: "sesudah", satuan: "hari_kerja", sifat: "wajib_hukum" };
    case "kewenangan": return { jenis: "penjatuh", prioritas: 100, syarat_tambahan: {}, hasil: {} };
    case "tahapan": return { kondisi: {}, jenis_dokumen: [], urutan: ((def.tahapan ?? []).reduce((m, t) => Math.max(m, t.urutan), 0) || 0) + 10 };
    case "pasal": return { jenis: "kewajiban" };
    default: return undefined;
  }
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------
export function WizardRegulasi({ daftar, ctxUmum, libur }: { daftar: RegulasiPilihan[]; ctxUmum: KonteksSkema; libur: string[] }) {
  const router = useRouter();
  const [draf, setDraf] = useState<Draf>(drafKosong);
  const [siap, setSiap] = useState(false);
  const [dipulihkan, setDipulihkan] = useState(false);
  const [pilihSalin, setPilihSalin] = useState<string>("");
  const { jalankan, sibuk } = useAksi();

  // Pulihkan draf dari localStorage
  useEffect(() => {
    try {
      const s = localStorage.getItem(KUNCI_SIMPAN);
      if (s) {
        const d = JSON.parse(s) as Draf;
        if (d?.def?.format === FORMAT_DEFINISI) {
          setDraf(d);
          setDipulihkan(true);
        }
      }
    } catch {
      // penyimpanan peramban tidak tersedia
    }
    setSiap(true);
  }, []);

  useEffect(() => {
    if (!siap) return;
    try {
      localStorage.setItem(KUNCI_SIMPAN, JSON.stringify(draf));
    } catch {
      // abaikan
    }
  }, [draf, siap]);

  const def = draf.def;
  const r = def.regulasi;
  const setDef = (d: DefinisiRegulasi) => setDraf((x) => ({ ...x, def: d }));
  const setReg = (ubah: Partial<DefRegulasi>, manual?: Partial<Draf["manual"]>) =>
    setDraf((x) => {
      const m = { ...x.manual, ...manual };
      let reg = { ...x.def.regulasi, ...ubah };
      const s = saranIdentitas(reg);
      if (!m.kode) reg = { ...reg, kode: s.kode };
      if (!m.nama_singkat) reg = { ...reg, nama_singkat: s.nama_singkat };
      if (!m.nama_lengkap) reg = { ...reg, nama_lengkap: s.nama_lengkap };
      return { ...x, manual: m, def: { ...x.def, regulasi: reg } };
    });
  const keLangkah = (n: number) => {
    setDraf((x) => ({ ...x, langkah: n }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const ctx: KonteksSkema = useMemo(() => {
    const tahap = new Map<string, string>();
    for (const t of def.tahapan ?? []) if (!tahap.has(t.kode_tahap)) tahap.set(t.kode_tahap, t.nama);
    return {
      opsi: {
        ...ctxUmum.opsi,
        tingkat: (def.tingkat ?? []).map((t) => ({ nilai: t.kode, label: t.nama })),
        kode_tingkat: (def.tingkat ?? []).map((t) => ({ nilai: t.kode, label: t.nama })),
        jenis: (def.jenis_hukuman ?? []).map((j) => ({ nilai: j.kode, label: j.nama })),
        pasal: (def.pasal ?? []).map((p) => ({ nilai: kunciPasal(p), label: kunciPasal(p) })),
        tahap: [...tahap.entries()].map(([nilai, label]) => ({ nilai, label })),
        kode_peran: [...new Set((def.kewenangan ?? []).map((k) => k.peran_kode))].map((k) => ({ nilai: k, label: k })),
        regulasi: daftar.map((d) => ({ nilai: d.kode, label: `${d.nama_singkat} — ${d.judul}` })),
      },
    };
  }, [def, ctxUmum, daftar]);

  const periksa = useMemo(() => periksaDefinisi(def), [def]);
  const aturan = useMemo(() => {
    try {
      return aturanDariDefinisi(def);
    } catch {
      return null;
    }
  }, [def]);
  const regresi = useMemo(() => ujiDiMemori(def, libur), [def, libur]);
  const kodeAda = daftar.find((d) => d.kode === r.kode.trim());
  const digantikan = daftar.find((d) => d.kode === r.menggantikan_kode);
  const jenisAda = useMemo(() => [...new Set(daftar.map((d) => d.jenis))], [daftar]);
  const adaIsi = jumlahIsi(def).some(([, n]) => n > 0);

  const galatLangkah1 = [
    !r.jenis?.trim() && "Jenis peraturan wajib diisi.",
    !r.judul?.trim() && "Judul wajib diisi.",
    !r.nama_singkat?.trim() && "Nama singkat wajib diisi.",
    !r.kode?.trim() && "Kode wajib diisi.",
    r.kode && /\s/.test(r.kode) && "Kode tidak boleh mengandung spasi.",
    kodeAda && `Kode ${r.kode} sudah dipakai oleh ${kodeAda.nama_singkat}. Gunakan kode lain.`,
  ].filter(Boolean) as string[];

  function salin(id: string) {
    const sumber = daftar.find((d) => d.id === id);
    if (!sumber) return;
    if (adaIsi && !window.confirm("Draf sudah berisi data. Salin ulang akan mengganti seluruh isi draf (identitas tetap). Lanjutkan?")) return;
    jalankan(() => muatDefinisiAksi(id), {
      segarkan: false,
      lalu: (d) => {
        setDraf((x) => ({
          ...x,
          sumber: { id, nama: sumber.nama_singkat },
          def: {
            ...d,
            format: FORMAT_DEFINISI,
            regulasi: { ...x.def.regulasi, rezim_kode: x.def.regulasi.rezim_kode ?? d.regulasi.rezim_kode ?? null },
            terkait: [],
          },
        }));
        toast.success(`Isi ${sumber.nama_singkat} tersalin ke draf. Silakan sunting.`);
      },
    });
  }

  function mulaiUlang() {
    if (!window.confirm("Hapus draf ini dan mulai dari awal?")) return;
    try {
      localStorage.removeItem(KUNCI_SIMPAN);
    } catch {
      // abaikan
    }
    setDraf(drafKosong());
    setDipulihkan(false);
  }

  function simpan() {
    jalankan(() => simpanWizardAksi(def, draf.alasan.trim(), draf.sumber?.nama ?? null), {
      lalu: (h) => {
        for (const p of h.peringatan) toast.info(p, { duration: 8000 });
        if (h.regresi.jumlah && h.regresi.lulus < h.regresi.jumlah) toast.warning(`${h.regresi.jumlah - h.regresi.lulus} uji regresi gagal — periksa tab Uji regresi.`);
        try {
          localStorage.removeItem(KUNCI_SIMPAN);
        } catch {
          // abaikan
        }
        router.push(`/pengaturan/regulasi/${h.regulasiId}`);
      },
    });
  }

  const L = draf.langkah;

  return (
    <div className="space-y-5">
      {dipulihkan && (
        <Catatan judul="Draf sebelumnya dipulihkan">
          Isian Anda tersimpan otomatis di peramban ini. <button type="button" className="font-semibold underline" onClick={mulaiUlang}>Mulai dari awal</button>
        </Catatan>
      )}
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {LANGKAH.map((nama, i) => {
          const n = i + 1;
          return (
            <li key={nama}>
              <button
                type="button"
                onClick={() => keLangkah(n)}
                disabled={n > 1 && galatLangkah1.length > 0}
                aria-current={L === n ? "step" : undefined}
                className={cn(
                  "flex min-h-14 w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50",
                  L === n ? "border-primary bg-primary text-primary-foreground" : n < L ? "bg-card" : "bg-card/70",
                )}
              >
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", L === n ? "bg-primary-foreground text-primary" : "bg-secondary")}>
                  {n < L ? <Check className="size-3.5" /> : n}
                </span>
                <span className="leading-snug">{nama}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {L === 1 && (
        <Panel judul="1. Identitas peraturan" deskripsi="Kode, nama singkat, dan nama lengkap disarankan otomatis dari jenis, nomor, dan tahun — boleh diubah.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="w-jenis">Jenis peraturan *</Label>
              <Input id="w-jenis" list="w-jenis-daftar" value={r.jenis} onChange={(e) => setReg({ jenis: e.target.value })} placeholder="mis. Peraturan Pemerintah" />
              <datalist id="w-jenis-daftar">{jenisAda.map((j) => <option key={j} value={j} />)}</datalist>
            </div>
            <div className="space-y-1.5"><Label htmlFor="w-nomor">Nomor</Label><Input id="w-nomor" value={r.nomor ?? ""} onChange={(e) => setReg({ nomor: e.target.value })} placeholder="mis. 99" /></div>
            <div className="space-y-1.5"><Label htmlFor="w-tahun">Tahun</Label><Input id="w-tahun" type="number" inputMode="numeric" value={r.tahun ?? ""} onChange={(e) => setReg({ tahun: e.target.value ? Number(e.target.value) : null })} placeholder="mis. 2030" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="w-judul">Judul (tentang …) *</Label><Input id="w-judul" value={r.judul} onChange={(e) => setReg({ judul: e.target.value })} placeholder="mis. Disiplin Pegawai Negeri Sipil" /></div>
            <div className="space-y-1.5"><Label htmlFor="w-kode">Kode *</Label><Input id="w-kode" value={r.kode} onChange={(e) => setReg({ kode: e.target.value }, { kode: true })} /></div>
            <div className="space-y-1.5"><Label htmlFor="w-singkat">Nama singkat *</Label><Input id="w-singkat" value={r.nama_singkat} onChange={(e) => setReg({ nama_singkat: e.target.value }, { nama_singkat: true })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="w-lengkap">Nama lengkap (dipakai di dokumen)</Label><Textarea id="w-lengkap" rows={2} value={r.nama_lengkap ?? ""} onChange={(e) => setReg({ nama_lengkap: e.target.value }, { nama_lengkap: true })} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="w-rezim">Rezim pegawai</Label>
              <Pilih id="w-rezim" nilai={r.rezim_kode ?? ""} onUbah={(v) => setReg({ rezim_kode: v || null })} opsi={ctxUmum.opsi.rezim ?? []} kosong="— Tanpa rezim (pelengkap) —" />
            </div>
            <div className="space-y-1.5"><Label htmlFor="w-berlaku">Berlaku dari</Label><Input id="w-berlaku" type="date" value={r.berlaku_dari ?? ""} onChange={(e) => setReg({ berlaku_dari: e.target.value || null })} /></div>
            <div className="space-y-1.5"><Label htmlFor="w-tetap">Ditetapkan pada</Label><Input id="w-tetap" type="date" value={r.ditetapkan_pada ?? ""} onChange={(e) => setReg({ ditetapkan_pada: e.target.value || null })} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="w-ganti">Peraturan yang digantikan</Label>
              <Pilih id="w-ganti" nilai={r.menggantikan_kode ?? ""} onUbah={(v) => { setReg({ menggantikan_kode: v || null }); const s = daftar.find((d) => d.kode === v); if (s) setPilihSalin(s.id); }}
                opsi={daftar.filter((d) => !r.rezim_kode || d.rezim_kode === r.rezim_kode).map((d) => ({ nilai: d.kode, label: `${d.nama_singkat} — ${d.judul}` }))} kosong="— Tidak menggantikan —" />
            </div>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm sm:col-span-2">
              <Checkbox checked={r.utama !== false} onCheckedChange={(c) => setReg({ utama: c === true })} className="mt-0.5" />
              Peraturan utama: dapat menjadi dasar kasus (dipilih otomatis menurut tanggal peristiwa). Kosongkan untuk peraturan pelengkap (juknis, delegasi).
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm sm:col-span-2">
              <Checkbox checked={r.katalog_pasal_lengkap !== false} onCheckedChange={(c) => setReg({ katalog_pasal_lengkap: c === true })} className="mt-0.5" />
              Katalog pasal lengkap (kosongkan untuk arsip lama yang pasalnya diisi teks bebas)
            </label>
          </div>
          {galatLangkah1.length > 0 && (r.jenis || r.judul) && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-lewat">{galatLangkah1.map((g) => <li key={g}>{g}</li>)}</ul>
          )}
        </Panel>
      )}

      {L === 2 && (
        <Panel judul="2. Salin dari peraturan lama" deskripsi="Pilih satu peraturan sebagai titik awal. Seluruh tingkat, jenis hukuman, pasal, ambang, tenggat, kewenangan, tahapan, kaidah, dan uji regresinya tersalin ke draf untuk disunting — Anda menyunting, bukan mengetik dari nol.">
          <div className="space-y-4">
            {draf.sumber && <Catatan jenis="aman" judul={`Draf berisi salinan ${draf.sumber.nama}`}>{jumlahIsi(def).map(([l, n]) => `${n} ${l.toLowerCase()}`).join(" · ")}</Catatan>}
            <fieldset className="space-y-2">
              <legend className="sr-only">Peraturan sumber</legend>
              {daftar.map((d) => (
                <label key={d.id} className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5", pilihSalin === d.id && "border-primary bg-accent")}>
                  <input type="radio" name="salin" className="mt-1 size-4" checked={pilihSalin === d.id} onChange={() => setPilihSalin(d.id)} />
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">{d.nama_singkat}</span> — {d.judul}
                    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                      {d.rezim_kode && <Lencana>Rezim {d.rezim_kode}</Lencana>}
                      {d.utama && <Lencana warna="info">Dasar kasus</Lencana>}
                      <Lencana>{d.status}</Lencana>
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!pilihSalin || sibuk} onClick={() => salin(pilihSalin)}>{sibuk ? <Loader2 className="animate-spin" /> : <CopyPlus />} Salin isi peraturan terpilih</Button>
              <Button variant="outline" onClick={() => keLangkah(3)}><FilePlus2 /> Mulai dari kosong / lewati</Button>
            </div>
          </div>
        </Panel>
      )}

      {L === 3 && (
        <Panel judul="3. Kewajiban dan larangan" deskripsi="Tambah, ubah, atau hapus butir pasal. Setiap butir: pasal, ayat, huruf, angka, dan bunyinya.">
          <EditorDef skema={SKEMA.pasal_regulasi} def={def} setDef={setDef} ctx={ctx} />
        </Panel>
      )}

      {L === 4 && (
        <Panel judul="4. Tingkat, jenis hukuman, ambang kehadiran, tenggat, kewenangan, tahapan" deskripsi="Sunting setiap bagian. Bila kode tingkat atau jenis hukuman diganti, rujukannya di bagian lain ikut diganti otomatis.">
          <Tabs defaultValue="tingkat">
            <TabsList className="mb-3 h-auto w-full flex-wrap justify-start gap-1 p-1">
              {([["tingkat", "Tingkat", def.tingkat], ["jenis", "Jenis hukuman", def.jenis_hukuman], ["ambang", "Ambang", def.ambang], ["tenggat", "Tenggat", def.tenggat], ["kewenangan", "Kewenangan", def.kewenangan], ["tahapan", "Tahapan", def.tahapan], ["pemetaan", "Pemetaan", def.pemetaan], ["kaidah", "Kaidah", def.kaidah]] as const).map(([k, l, xs]) => (
                <TabsTrigger key={k} value={k} className="min-h-10 flex-none">{l} <span className="text-xs text-muted-foreground">({xs?.length ?? 0})</span></TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="tingkat"><EditorDef skema={SKEMA.tingkat_hukuman} def={def} setDef={setDef} ctx={ctx} /></TabsContent>
            <TabsContent value="jenis"><EditorDef skema={SKEMA.jenis_hukuman} def={def} setDef={setDef} ctx={ctx} /></TabsContent>
            <TabsContent value="ambang"><EditorDef skema={SKEMA.ambang_kehadiran} def={def} setDef={setDef} ctx={ctx} /></TabsContent>
            <TabsContent value="tenggat"><EditorDef skema={SKEMA.aturan_tenggat} def={def} setDef={setDef} ctx={ctx} /></TabsContent>
            <TabsContent value="kewenangan"><EditorDef skema={SKEMA.aturan_kewenangan} def={def} setDef={setDef} ctx={ctx} /></TabsContent>
            <TabsContent value="tahapan"><EditorDef skema={SKEMA.aturan_tahapan} def={def} setDef={setDef} ctx={ctx} /></TabsContent>
            <TabsContent value="pemetaan"><EditorDef skema={SKEMA.aturan_pemetaan_pelanggaran} def={def} setDef={setDef} ctx={ctx} /></TabsContent>
            <TabsContent value="kaidah"><EditorDef skema={SKEMA.aturan_kaidah} def={def} setDef={setDef} ctx={ctx} /></TabsContent>
          </Tabs>
        </Panel>
      )}

      {L === 5 && (
        <div className="space-y-5">
          <Panel judul="5. Uji dengan kasus contoh" deskripsi="Masukkan skenario (mis. golongan III/b tidak masuk 18 hari). Periksa apakah tingkat, jenis, pejabat berwenang, tahapan, dan tenggat sesuai bunyi peraturan. Bisa diulang berkali-kali; tidak ada yang tersimpan.">
            {aturan ? <UjiSkenario aturan={aturan} libur={libur} /> : <Catatan jenis="lewat">Draf belum dapat diuji — periksa kelengkapan di bawah.</Catatan>}
          </Panel>
          <PeriksaKelengkapan periksa={periksa} />
          <Panel judul="Uji regresi" deskripsi="Kasus contoh beserta hasil yang benar. Disimpan bersama peraturan dan dijalankan ulang setiap kali katalog disunting. Sesuaikan uji yang tersalin dari peraturan lama.">
            <DaftarFixtureDef fixture={def.fixture ?? []} hasil={regresi} onUbah={(f) => setDef({ ...def, fixture: f })} />
          </Panel>
        </div>
      )}

      {L === 6 && (
        <div className="space-y-5">
          <Panel judul="6. Aktifkan" deskripsi="Pilih status dan tanggal mulai berlaku. Kasus baru dengan tanggal peristiwa sejak tanggal itu otomatis memakai peraturan ini; kasus lama tidak tersentuh.">
            <div className="space-y-4">
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="mb-1 text-sm font-medium">Status</legend>
                {([["draf", "Simpan sebagai draf", "Belum dipakai kasus baru. Bisa disunting dan diaktifkan kemudian."], ["aktif", "Aktifkan sekarang", "Dipakai untuk kasus dengan tanggal peristiwa sejak tanggal berlaku."]] as const).map(([v, l, k]) => (
                  <label key={v} className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5", r.status === v && "border-primary bg-accent")}>
                    <input type="radio" name="status" className="mt-1 size-4" checked={r.status === v} onChange={() => setReg({ status: v })} />
                    <span className="text-sm"><span className="font-medium">{l}</span><span className="block text-muted-foreground">{k}</span></span>
                  </label>
                ))}
              </fieldset>
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="w-berlaku6">Berlaku dari</Label>
                <Input id="w-berlaku6" type="date" value={r.berlaku_dari ?? ""} onChange={(e) => setReg({ berlaku_dari: e.target.value || null })} />
              </div>
              {digantikan && (
                <Catatan jenis="info" judul={`Menggantikan ${digantikan.nama_singkat}`}>
                  {r.status === "aktif"
                    ? <>Saat disimpan, {digantikan.nama_singkat} ditandai berakhir pada {r.berlaku_dari ? tanggalPanjang(r.berlaku_dari) : "(tanggal berlaku belum diisi)"} dan &quot;digantikan oleh&quot; peraturan ini. Kasus dengan tanggal peristiwa sebelum itu tetap memakai {digantikan.nama_singkat}.</>
                    : <>Tautan penggantian disimpan; {digantikan.nama_singkat} baru ditandai berakhir ketika peraturan ini diaktifkan.</>}
                </Catatan>
              )}
              {r.status === "aktif" && !r.berlaku_dari && <p className="text-sm text-waspada">Isi tanggal berlaku agar resolver dapat memilih peraturan ini berdasarkan tanggal peristiwa.</p>}
              <div className="space-y-1.5">
                <Label htmlFor="w-alasan">Alasan / dasar pendaftaran (wajib, tercatat di log audit)</Label>
                <Textarea id="w-alasan" rows={2} value={draf.alasan} onChange={(e) => setDraf((x) => ({ ...x, alasan: e.target.value }))} placeholder={`mis. Terbit ${r.nama_singkat || "peraturan baru"}; definisi telah diperiksa Bagian Hukum`} />
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-semibold">{r.nama_singkat} — {r.judul}</p>
                <p className="text-muted-foreground">Kode {r.kode}{draf.sumber ? ` · disalin dari ${draf.sumber.nama}` : ""}</p>
                <p className="mt-1">{jumlahIsi(def).map(([l, n]) => `${n} ${l.toLowerCase()}`).join(" · ")}</p>
                <p className="mt-1">Uji regresi: {regresi.lulus} dari {regresi.jumlah} lulus</p>
              </div>
              <PeriksaKelengkapan periksa={periksa} />
              <Button disabled={sibuk || periksa.galat.length > 0 || galatLangkah1.length > 0 || draf.alasan.trim().length < 5} onClick={simpan}>
                {sibuk ? <Loader2 className="animate-spin" /> : <Save />} Simpan peraturan
              </Button>
            </div>
          </Panel>
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          {L > 1 && <Button variant="outline" onClick={() => keLangkah(L - 1)}><ArrowLeft /> Kembali</Button>}
          <Button variant="ghost" onClick={mulaiUlang}><RotateCcw /> Mulai ulang</Button>
        </div>
        {L < 6 && <Button disabled={galatLangkah1.length > 0} onClick={() => keLangkah(L + 1)}>Lanjut <ArrowRight /></Button>}
      </div>
    </div>
  );
}

function PeriksaKelengkapan({ periksa }: { periksa: { galat: string[]; peringatan: string[] } }) {
  if (!periksa.galat.length && !periksa.peringatan.length) return <Catatan jenis="aman" judul="Pemeriksaan kelengkapan">Tidak ditemukan masalah.</Catatan>;
  return (
    <div className="space-y-3">
      {periksa.galat.length > 0 && (
        <Catatan jenis="lewat" judul={`${periksa.galat.length} hal harus diperbaiki sebelum disimpan`}>
          <ul className="list-disc pl-5">{periksa.galat.map((g) => <li key={g}>{g}</li>)}</ul>
        </Catatan>
      )}
      {periksa.peringatan.length > 0 && (
        <Catatan jenis="waspada" judul="Saran pemeriksaan">
          <ul className="list-disc pl-5">{periksa.peringatan.map((g) => <li key={g}>{g}</li>)}</ul>
        </Catatan>
      )}
    </div>
  );
}
