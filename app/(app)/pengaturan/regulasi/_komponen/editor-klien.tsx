"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CopyPlus, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Catatan, Kosong, Panel, Rincian } from "@/components/simpel/dasar";
import { useAksi } from "@/components/simpel/interaktif";
import { Lencana, LencanaVerifikasi } from "@/components/simpel/lencana";
import { labelKode, tanggalPanjang, waktuPendek } from "@/lib/format";
import type { AturanLengkap } from "@/lib/hukdis/jenis";
import type { ModeUbah } from "@/lib/regulasi/admin";
import type { RingkasRegresi } from "@/lib/regulasi/regresi";
import type { Hasil } from "@/lib/galat";
import { HASIL_KEWENANGAN_DIKENAL, KAIDAH_DIKENAL, SKEMA, SKEMA_REGULASI, labelOpsi, type Baris, type KonteksSkema, type SkemaTabel } from "../_skema";
import type { BarisRiwayat, DataKatalog } from "../_data";
import { buatVersiRegulasiAksi, simpanBaris, hapusBarisAksi, type HasilSimpanBaris } from "../_aksi";
import { DaftarBaris } from "./daftar-baris";
import { FormBaris } from "./bidang";
import { PanelRegresi } from "./regresi-klien";
import { UjiSkenario } from "./uji-skenario";
import { MatriksKewenangan } from "./matriks";

type Kat = NonNullable<DataKatalog>;

const TAB: { kode: string; label: string; tabel?: keyof typeof SKEMA }[] = [
  { kode: "identitas", label: "Identitas" },
  { kode: "tingkat", label: "Tingkat", tabel: "tingkat_hukuman" },
  { kode: "jenis", label: "Jenis hukuman", tabel: "jenis_hukuman" },
  { kode: "pasal", label: "Pasal", tabel: "pasal_regulasi" },
  { kode: "ambang", label: "Ambang kehadiran", tabel: "ambang_kehadiran" },
  { kode: "tenggat", label: "Tenggat", tabel: "aturan_tenggat" },
  { kode: "kewenangan", label: "Kewenangan", tabel: "aturan_kewenangan" },
  { kode: "tahapan", label: "Tahapan", tabel: "aturan_tahapan" },
  { kode: "pemetaan", label: "Pemetaan pelanggaran", tabel: "aturan_pemetaan_pelanggaran" },
  { kode: "kaidah", label: "Kaidah", tabel: "aturan_kaidah" },
  { kode: "regresi", label: "Uji regresi" },
  { kode: "riwayat", label: "Riwayat" },
];

const SKEMA_TERKAIT: SkemaTabel = {
  tabel: "regulasi_terkait", def: "terkait", judul: "Peraturan terkait", kekal: false, versi: false, punyaAktif: false,
  penjelasan: "", contoh: "Contoh: PerBKN 6/2022 sebagai petunjuk teknis (juknis).",
  kolom: [
    { kunci: "terkait_id", label: "Peraturan", jenis: "ref", ref: "regulasi", wajib: true },
    { kunci: "peran", label: "Peran", jenis: "pilihan", wajib: true, pilihan: [{ nilai: "juknis", label: "Petunjuk teknis" }, { nilai: "delegasi", label: "Delegasi kewenangan" }, { nilai: "pelengkap", label: "Pelengkap" }, { nilai: "dasar", label: "Dasar hukum" }] },
    { kunci: "urutan", label: "Urutan", jenis: "angka" },
    { kunci: "keterangan", label: "Keterangan", jenis: "teks_panjang" },
  ],
  ringkas: (b, ctx) => ({ judul: labelOpsi(ctx, "regulasi", b.terkait_id), sub: [labelKode(String(b.peran)), b.keterangan].filter(Boolean).join(" · ") }),
};

export function EditorRegulasi({
  kat, ctx, aturan, libur, riwayat, periksa, tabAwal,
}: { kat: Kat; ctx: KonteksSkema; aturan: AturanLengkap; libur: string[]; riwayat: BarisRiwayat[]; periksa: { galat: string[]; peringatan: string[] }; tabAwal: string }) {
  const reg = kat.regulasi;
  const regulasiId = String(reg.id);
  const [tab, setTab] = useState(TAB.some((t) => t.kode === tabAwal) ? tabAwal : "identitas");
  const [memburuk, setMemburuk] = useState<RingkasRegresi["memburuk"] | null>(null);
  const [formIdentitas, setFormIdentitas] = useState(false);
  const terpakaiSet = useMemo(() => new Set(kat.terpakaiBaris), [kat.terpakaiBaris]);
  const terkunci = useCallback((b: Baris) => kat.jumlahKasus > 0 || terpakaiSet.has(String(b.id)), [kat.jumlahKasus, terpakaiSet]);

  const laporRegresi = useCallback((r: RingkasRegresi | undefined) => {
    if (!r) return;
    if (r.memburuk.length) {
      setMemburuk(r.memburuk);
      toast.warning(`Perhatian: ${r.memburuk.length} uji regresi yang tadinya lulus sekarang gagal.`, { duration: 10000 });
    } else if (r.lulus === r.jumlah) {
      setMemburuk(null);
    }
  }, []);

  const setelahSimpan = useCallback(async (p: Promise<Hasil<HasilSimpanBaris>>) => {
    const h = await p;
    if (h.ok) {
      laporRegresi(h.data.regresi);
      for (const c of h.data.catatan) toast.info(c, { duration: 8000 });
    }
    return h;
  }, [laporRegresi]);

  const simpanDb = (tabel: string) => (lama: Baris | null, data: Baris, alasan: string, mode: ModeUbah) =>
    setelahSimpan(simpanBaris({ tabel, regulasiId, id: lama ? String(lama.id) : null, data, alasan, mode }));
  const ubahBebasDb = (tabel: string) => (b: Baris, kolom: "aktif" | "perlu_verifikasi", nilai: boolean, alasan: string) =>
    setelahSimpan(simpanBaris({ tabel, regulasiId, id: String(b.id), data: { [kolom]: nilai }, alasan, mode: "biasa" }));
  const hapusDb = (tabel: string) => async (b: Baris, alasan: string) => {
    const h = await hapusBarisAksi({ tabel, id: String(b.id), alasan });
    if (h.ok) laporRegresi(h.data.regresi);
    return h;
  };

  const hitung = (tabel: keyof typeof SKEMA) => {
    const rows = kat[tabel] as Baris[];
    return { n: rows.filter((r) => r.aktif !== false).length, v: rows.filter((r) => r.perlu_verifikasi && r.aktif !== false).length };
  };

  const gantiTab = (v: string) => {
    setTab(v);
    try {
      window.history.replaceState(null, "", `?tab=${v}`);
    } catch {
      // abaikan
    }
  };

  const panelTabel = (tabel: keyof typeof SKEMA, ekstra?: React.ReactNode) => {
    const s = SKEMA[tabel];
    return (
      <Panel judul={s.judul} deskripsi={s.penjelasan}>
        <div className="space-y-4">
          <Catatan judul="Contoh">{s.contoh}</Catatan>
          {ekstra}
          <DaftarBaris
            skema={s}
            baris={kat[tabel] as Baris[]}
            ctx={ctx}
            mode="db"
            terkunci={terkunci}
            simpanDb={simpanDb(tabel)}
            ubahBebasDb={ubahBebasDb(tabel)}
            hapusDb={tabel === "aturan_kaidah" ? hapusDb(tabel) : undefined}
            bawaanBaru={bawaanBaru(tabel)}
          />
        </div>
      </Panel>
    );
  };

  return (
    <div className="space-y-4">
      {kat.jumlahKasus > 0 && (
        <Catatan jenis="waspada" judul={`Peraturan ini sudah dipakai oleh ${kat.jumlahKasus} kasus`}>
          Supaya kasus lama tetap utuh, isi tingkat, jenis hukuman, pasal, ambang kehadiran, dan identitas tidak dapat diubah langsung. Untuk perubahan isi tersedia dua jalan:
          <b> Simpan sebagai versi baru</b> (baris lama dinonaktifkan dan tetap tersimpan, baris baru dipakai kasus berikutnya) atau
          <b> Koreksi salah ketik</b> (wajib alasan tertulis, tercatat di log audit). Kolom status — aktif, berlaku sampai, catatan, perlu verifikasi, peringatan, pengganti sementara, urutan — tetap bebas diubah.
          Tenggat, kewenangan, tahapan, pemetaan, dan kaidah selalu dapat disunting (setiap perubahan tercatat).
        </Catatan>
      )}
      {memburuk && memburuk.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-lg border border-lewat/40 bg-lewat-muda p-3 text-sm sm:p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-lewat" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold">Suntingan terakhir mengubah hasil perhitungan: {memburuk.length} uji regresi yang tadinya lulus sekarang gagal.</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {memburuk.map((m) => <li key={m.nama}><b>{m.nama}</b>: {m.selisih.join("; ")}</li>)}
            </ul>
            <p>Periksa kembali suntingan Anda, atau perbarui uji regresinya bila memang peraturannya berubah.</p>
            <Button variant="outline" onClick={() => gantiTab("regresi")}>Buka tab Uji regresi</Button>
          </div>
          <Button variant="ghost" size="icon" aria-label="Tutup peringatan" onClick={() => setMemburuk(null)}><X /></Button>
        </div>
      )}
      {(periksa.galat.length > 0 || periksa.peringatan.length > 0) && (
        <details className="rounded-lg border bg-card p-3 text-sm sm:p-4">
          <summary className="min-h-9 cursor-pointer font-medium">
            Pemeriksaan kelengkapan: {periksa.galat.length} masalah, {periksa.peringatan.length} saran
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {periksa.galat.map((g) => <li key={g} className="text-lewat">{g}</li>)}
            {periksa.peringatan.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </details>
      )}

      <Tabs value={tab} onValueChange={gantiTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
          {TAB.map((t) => {
            const h = t.tabel ? hitung(t.tabel) : null;
            const nFix = t.kode === "regresi" ? kat.fixture_regresi.length : null;
            return (
              <TabsTrigger key={t.kode} value={t.kode} className="min-h-10 flex-none">
                {t.label}
                {h && <span className="text-xs text-muted-foreground">({h.n})</span>}
                {nFix !== null && <span className="text-xs text-muted-foreground">({nFix})</span>}
                {h && h.v > 0 && <span className="size-2 rounded-full bg-waspada" aria-label={`${h.v} perlu verifikasi`} />}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="identitas" className="space-y-4">
          <Panel
            judul="Identitas peraturan"
            deskripsi="Data pengenal peraturan. Status, tanggal berakhir, catatan, peringatan, dan tanda verifikasi selalu bisa diubah."
            aksi={
              <>
                <Button variant="outline" onClick={() => setFormIdentitas(true)}><Pencil /> Sunting identitas</Button>
                <DialogVersiBaru reg={reg} />
              </>
            }
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Lencana warna={reg.status === "aktif" ? "aman" : reg.status === "draf" ? "info" : "netral"}>{labelKode(String(reg.status))}</Lencana>
                {!!reg.utama && <Lencana warna="info">Dasar kasus (utama)</Lencana>}
                <Lencana>Versi {String(reg.versi)}</Lencana>
                {!!reg.perlu_verifikasi && <LencanaVerifikasi />}
              </div>
              <Rincian
                items={[
                  { label: "Kode", nilai: String(reg.kode) },
                  { label: "Jenis", nilai: String(reg.jenis) },
                  { label: "Nomor / tahun", nilai: [reg.nomor, reg.tahun].filter(Boolean).join(" / ") },
                  { label: "Nama singkat", nilai: String(reg.nama_singkat) },
                  { label: "Judul", nilai: String(reg.judul), lebar: true },
                  { label: "Nama lengkap (di dokumen)", nilai: reg.nama_lengkap as string, lebar: true },
                  { label: "Rezim", nilai: (reg.rezim_nama as string) ?? "Tanpa rezim (pelengkap)" },
                  { label: "Berlaku", nilai: `${tanggalPanjang(reg.berlaku_dari as string)} – ${reg.berlaku_sampai ? tanggalPanjang(reg.berlaku_sampai as string) : "sekarang"}` },
                  { label: "Ditetapkan", nilai: tanggalPanjang(reg.ditetapkan_pada as string) },
                  { label: "Menggantikan", nilai: reg.menggantikan_nama as string },
                  { label: "Digantikan oleh", nilai: reg.digantikan_nama as string },
                  { label: "Katalog pasal", nilai: reg.katalog_pasal_lengkap ? "Lengkap" : "Teks bebas (arsip)" },
                  { label: "Peringatan", nilai: reg.peringatan as string, lebar: true },
                  { label: "Catatan", nilai: reg.catatan as string, lebar: true },
                ]}
              />
            </div>
          </Panel>
          <Panel judul="Peraturan terkait" deskripsi="Peraturan pelaksana, delegasi, atau pelengkap yang dibaca bersama peraturan ini.">
            <DaftarBaris
              skema={SKEMA_TERKAIT}
              baris={kat.regulasi_terkait}
              ctx={ctx}
              mode="db"
              simpanDb={simpanDb("regulasi_terkait")}
              hapusDb={hapusDb("regulasi_terkait")}
              bawaanBaru={{ peran: "pelengkap" }}
            />
          </Panel>
          <FormBaris
            buka={formIdentitas}
            onBuka={setFormIdentitas}
            judul="identitas peraturan"
            kolom={SKEMA_REGULASI}
            ctx={ctx}
            mode="db"
            awal={reg}
            terkunci={kat.jumlahKasus > 0}
            simpanDb={simpanDb("regulasi")}
          />
        </TabsContent>

        <TabsContent value="tingkat">{panelTabel("tingkat_hukuman")}</TabsContent>
        <TabsContent value="jenis">{panelTabel("jenis_hukuman")}</TabsContent>
        <TabsContent value="pasal">{panelTabel("pasal_regulasi")}</TabsContent>
        <TabsContent value="ambang">{panelTabel("ambang_kehadiran")}</TabsContent>
        <TabsContent value="tenggat">{panelTabel("aturan_tenggat")}</TabsContent>
        <TabsContent value="kewenangan">
          {panelTabel("aturan_kewenangan", (
            <div className="space-y-3">
              <h3 className="font-semibold">Matriks kewenangan saat ini</h3>
              <MatriksKewenangan
                tingkat={aturan.tingkat.map((t) => ({ kunci: t.kode, nama: t.nama }))}
                baris={aturan.kewenangan.map((k) => ({ tingkat: k.tingkat_kode, jenis: k.jenis, nama_peran: k.nama_peran, syarat: k.syarat_tambahan, prioritas: k.prioritas, perlu_verifikasi: k.perlu_verifikasi }))}
              />
              <details className="text-sm">
                <summary className="min-h-9 cursor-pointer py-1 font-medium">Kunci &quot;akibat&quot; yang dikenal</summary>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {Object.entries(HASIL_KEWENANGAN_DIKENAL).map(([k, v]) => <li key={k}><code>{k}</code>: {v}</li>)}
                </ul>
              </details>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="tahapan">{panelTabel("aturan_tahapan")}</TabsContent>
        <TabsContent value="pemetaan">{panelTabel("aturan_pemetaan_pelanggaran")}</TabsContent>
        <TabsContent value="kaidah">
          {panelTabel("aturan_kaidah", (
            <details className="rounded-lg border p-3 text-sm">
              <summary className="min-h-9 cursor-pointer font-medium">Kunci kaidah yang dikenal sistem dan artinya</summary>
              <dl className="mt-2 space-y-2">
                {Object.entries(KAIDAH_DIKENAL).map(([k, v]) => (
                  <div key={k}><dt><code className="font-semibold">{k}</code></dt><dd className="text-muted-foreground">{v}</dd></div>
                ))}
              </dl>
            </details>
          ))}
        </TabsContent>

        <TabsContent value="regresi" className="space-y-4">
          <Panel judul="Uji regresi hukum" deskripsi="Kasus contoh beserta hasil yang benar. Seluruh uji dijalankan ulang otomatis setiap kali katalog peraturan ini disunting; bila ada hasil yang berubah dari lulus menjadi gagal, muncul peringatan.">
            <PanelRegresi regulasiId={regulasiId} fixture={kat.fixture_regresi} onRegresi={laporRegresi} />
          </Panel>
          <Panel judul="Coba kasus contoh" deskripsi="Masukkan skenario untuk melihat tingkat, jenis, pejabat berwenang, tahapan, dan tenggat yang dihasilkan katalog saat ini. Tidak menyimpan apa pun.">
            <UjiSkenario aturan={aturan} libur={libur} />
          </Panel>
        </TabsContent>

        <TabsContent value="riwayat">
          <Panel judul="Riwayat perubahan" deskripsi="Jejak versi definisi: siapa mengubah apa, kapan, nilai sebelum dan sesudah, serta alasannya (300 terbaru).">
            {riwayat.length === 0 ? (
              <Kosong judul="Belum ada perubahan tercatat" />
            ) : (
              <ul className="space-y-2">
                {riwayat.map((r) => <ItemRiwayat key={r.id} r={r} />)}
              </ul>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function bawaanBaru(tabel: keyof typeof SKEMA): Baris | undefined {
  switch (tabel) {
    case "aturan_tenggat": return { acuan_tanggal: "realisasi", arah: "sesudah", satuan: "hari_kerja", sifat: "wajib_hukum" };
    case "aturan_kewenangan": return { jenis: "penjatuh", prioritas: 100, syarat_tambahan: {}, hasil: {} };
    case "aturan_tahapan": return { kondisi: {}, jenis_dokumen: [] };
    case "pasal_regulasi": return { jenis: "kewajiban" };
    default: return undefined;
  }
}

const LABEL_AKSI: Record<string, string> = { buat: "Menambah", ubah: "Mengubah", koreksi: "Koreksi salah ketik", hapus: "Menghapus", impor: "Mengimpor", ekspor: "Mengekspor", cetak: "Mencetak" };

function ItemRiwayat({ r }: { r: BarisRiwayat }) {
  const perubahan = (r.ringkasan?.perubahan ?? null) as Record<string, { sebelum: unknown; sesudah: unknown }> | null;
  return (
    <li className="rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Lencana warna={r.aksi === "koreksi" ? "waspada" : r.aksi === "hapus" ? "lewat" : "info"}>{LABEL_AKSI[r.aksi] ?? r.aksi}</Lencana>
        <span className="font-medium">{labelKode(r.tabel)}</span>
        <span className="text-muted-foreground">{waktuPendek(r.waktu)} · {r.email ?? "sistem"}</span>
      </div>
      {r.alasan && <p className="mt-1"><span className="text-muted-foreground">Alasan:</span> {r.alasan}</p>}
      {perubahan && Object.keys(perubahan).length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {Object.entries(perubahan).map(([k, v]) => (
            <li key={k} className="break-words">
              <span className="font-medium">{labelKode(k)}</span>: <span className="text-muted-foreground line-through decoration-1">{tampil(v?.sebelum)}</span> → {tampil(v?.sesudah)}
            </li>
          ))}
        </ul>
      )}
      {typeof r.ringkasan?.keterangan === "string" && <p className="mt-1 text-muted-foreground">{r.ringkasan.keterangan}</p>}
    </li>
  );
}

function tampil(v: unknown) {
  if (v === null || v === undefined || v === "") return "(kosong)";
  if (typeof v === "boolean") return v ? "ya" : "tidak";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

function DialogVersiBaru({ reg }: { reg: Baris }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const saran = `${String(reg.kode).replace(/_V\d+$/i, "")}_V${Number(reg.versi ?? 1) + 1}`;
  const [kode, setKode] = useState(saran);
  const [berlaku, setBerlaku] = useState("");
  const [alasan, setAlasan] = useState("");
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open={buka} onOpenChange={setBuka}>
      <DialogTrigger asChild><Button variant="outline"><CopyPlus /> Buat versi baru peraturan</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buat versi baru peraturan</DialogTitle>
          <DialogDescription>
            Seluruh isi aktif peraturan ini disalin ke peraturan baru berstatus draf (versi {Number(reg.versi ?? 1) + 1}) untuk disunting. Saat versi baru diaktifkan, peraturan ini otomatis berakhir pada tanggal mulai berlaku versi baru dan ditandai &quot;digantikan&quot;. Kasus lama tetap memakai versi ini.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="vb-kode">Kode versi baru</Label><Input id="vb-kode" value={kode} onChange={(e) => setKode(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="vb-berlaku">Berlaku dari</Label><Input id="vb-berlaku" type="date" value={berlaku} onChange={(e) => setBerlaku(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="vb-alasan">Alasan (wajib)</Label><Textarea id="vb-alasan" rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. terbit Peraturan perubahan …" /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setBuka(false)}>Batal</Button>
          <Button
            disabled={sibuk || alasan.trim().length < 5 || !kode.trim()}
            onClick={() => jalankan(() => buatVersiRegulasiAksi({ regulasiId: String(reg.id), kode: kode.trim(), berlakuDari: berlaku || null, alasan: alasan.trim() }), {
              lalu: (h) => {
                setBuka(false);
                for (const p of h.peringatan) toast.info(p);
                router.push(`/pengaturan/regulasi/${h.regulasiId}`);
              },
            })}
          >
            {sibuk && <Loader2 className="animate-spin" />} Buat versi baru
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
