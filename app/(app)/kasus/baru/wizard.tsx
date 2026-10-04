"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Plus, Scale, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bidang } from "@/components/simpel/form-entri";
import { Catatan } from "@/components/simpel/dasar";
import { Lencana, LencanaVerifikasi } from "@/components/simpel/lencana";
import { PilihPegawai, useAksi, type PegawaiRingkas } from "@/components/simpel/interaktif";
import { kunciPasal } from "@/lib/regulasi/definisi";
import { tanggalPanjang } from "@/lib/format";
import { buatKasusAksi, daftarPasalAksi, pratinjauKasusAksi, usulTingkatAksi } from "../_aksi";

type Opsi = { kode: string; label: string };
type Reg = { id: string; nama_singkat: string; rezim_kode: string | null; berlaku_dari: string | null; berlaku_sampai: string | null };
type Pasal = { id: string; jenis: string; pasal: string; ayat: string | null; huruf: string | null; angka: string | null; teks: string; perlu_verifikasi: boolean };
type Pelanggaran = { pasalRegulasiId: string | null; pasalLabel: string; pasalTeksBebas: string | null; uraian: string; dampak: string | null; waktu: string; tempat: string; usulan?: string | null };
type Pratinjau = Extract<Awaited<ReturnType<typeof pratinjauKasusAksi>>, { ok: true }>["data"];

type Data = {
  pegawai: PegawaiRingkas | null; tanggalPeristiwa: string; judul: string; ringkasan: string; sumberInformasi: string | null;
  pelaporNama: string; pelaporKontak: string; kehadiran: boolean; hariTmk: number | null; hariTmkBerturut: number | null;
  regulasiId: string | null; tingkatKode: string | null; pelanggaran: Pelanggaran[]; berasalDariId: string | null;
};

const LANGKAH = ["Terperiksa & peristiwa", "Peraturan & tingkat", "Pelanggaran", "Tinjau & simpan"];
const KUNCI = "simpel-draf-kasus";

export function WizardKasus({ awal, regulasi, sumber, dampak }: { awal: Partial<Data> | null; regulasi: Reg[]; sumber: Opsi[]; dampak: Opsi[] }) {
  const router = useRouter();
  const { jalankan, sibuk } = useAksi();
  const [langkah, setLangkah] = useState(0);
  const [d, setD] = useState<Data>({
    pegawai: null, tanggalPeristiwa: "", judul: "", ringkasan: "", sumberInformasi: null, pelaporNama: "", pelaporKontak: "",
    kehadiran: false, hariTmk: null, hariTmkBerturut: null, regulasiId: null, tingkatKode: null, pelanggaran: [], berasalDariId: null,
    ...(awal ?? {}),
  });
  const [pra, setPra] = useState<Pratinjau | null>(null);
  const [memuatPra, setMemuatPra] = useState(false);

  useEffect(() => {
    if (awal) return;
    try { const s = localStorage.getItem(KUNCI); if (s) setD((x) => ({ ...x, ...JSON.parse(s) })); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { try { localStorage.setItem(KUNCI, JSON.stringify(d)); } catch {} }, [d]);

  const set = <K extends keyof Data>(k: K, v: Data[K]) => setD((x) => ({ ...x, [k]: v }));

  const muatPratinjau = useCallback(async (over: Partial<Data> = {}) => {
    const x = { ...d, ...over };
    if (!x.pegawai || !x.tanggalPeristiwa) return;
    setMemuatPra(true);
    const h = await pratinjauKasusAksi({
      pegawaiId: x.pegawai.id, tanggalPeristiwa: x.tanggalPeristiwa, regulasiId: x.regulasiId, tingkatKode: x.tingkatKode,
      hariTmk: x.kehadiran ? x.hariTmk : null, hariTmkBerturut: x.kehadiran ? x.hariTmkBerturut : null,
    });
    setMemuatPra(false);
    if (!h.ok) { toast.error(h.pesan); return; }
    setPra(h.data);
    if (!x.tingkatKode && h.data.tingkatKode) set("tingkatKode", h.data.tingkatKode);
  }, [d]);

  function lanjut() {
    if (langkah === 0) {
      if (!d.pegawai) return toast.error("Pilih pegawai terperiksa dari master pegawai.");
      if (!d.tanggalPeristiwa) return toast.error("Isi tanggal peristiwa — dipakai untuk menentukan peraturan yang berlaku.");
      if (!d.judul.trim()) return toast.error("Isi judul kasus.");
      muatPratinjau();
    }
    if (langkah === 1) {
      if (!pra?.regulasi) return toast.error("Peraturan dasar belum ditentukan. Pilih secara manual.");
      if (!d.tingkatKode) return toast.error("Pilih dugaan tingkat hukuman disiplin.");
    }
    setLangkah((l) => Math.min(LANGKAH.length - 1, l + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function simpan() {
    await jalankan(
      () => buatKasusAksi({
        pegawaiId: d.pegawai!.id, tanggalPeristiwa: d.tanggalPeristiwa, regulasiId: pra?.regulasi?.id ?? d.regulasiId, tingkatKode: d.tingkatKode,
        hariTmk: d.kehadiran ? d.hariTmk : null, hariTmkBerturut: d.kehadiran ? d.hariTmkBerturut : null,
        judul: d.judul, ringkasan: d.ringkasan || null, sumberInformasi: d.sumberInformasi, pelaporNama: d.pelaporNama || null, pelaporKontak: d.pelaporKontak || null,
        adaBukti: false, berasalDariId: d.berasalDariId,
        pelanggaran: d.pelanggaran.map((p) => ({ pasalRegulasiId: p.pasalRegulasiId, pasalTeksBebas: p.pasalTeksBebas, uraian: p.uraian || null, dampak: p.dampak, waktu: p.waktu || null, tempat: p.tempat || null })),
      }),
      { lalu: (id) => { try { localStorage.removeItem(KUNCI); } catch {} router.push(`/kasus/${id}`); }, segarkan: false },
    );
  }

  return (
    <div className="space-y-6">
      {/* Indikator kemajuan */}
      <ol className="grid grid-cols-4 gap-2" aria-label="Langkah">
        {LANGKAH.map((l, i) => (
          <li key={l}>
            <button type="button" disabled={i > langkah} onClick={() => setLangkah(i)} className="flex w-full flex-col items-start gap-1.5 text-left disabled:cursor-default" aria-current={i === langkah ? "step" : undefined}>
              <span className={cn("h-1.5 w-full rounded-full", i < langkah ? "bg-aman" : i === langkah ? "bg-primary" : "bg-border")} />
              <span className={cn("text-xs font-medium sm:text-sm", i === langkah ? "text-foreground" : "text-muted-foreground")}>
                <span className="sm:hidden">{i + 1}</span><span className="hidden sm:inline">{i + 1}. {l}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <h2 className="text-lg font-semibold sm:hidden">{langkah + 1}. {LANGKAH[langkah]}</h2>

      {langkah === 0 && (
        <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
          <Bidang label="Pegawai terperiksa" wajib keterangan="Rezim dan peraturan ditentukan dari status pegawai ini.">
            <PilihPegawai nilai={d.pegawai} onPilih={(p) => { set("pegawai", p); setPra(null); set("regulasiId", null); set("tingkatKode", null); }} />
          </Bidang>
          <div className="grid gap-4 sm:grid-cols-2">
            <Bidang label="Tanggal peristiwa" htmlFor="tgl" wajib keterangan="Kasus dinilai dengan aturan yang berlaku saat perbuatan terjadi.">
              <Input id="tgl" type="date" value={d.tanggalPeristiwa} onChange={(e) => { set("tanggalPeristiwa", e.target.value); setPra(null); set("regulasiId", null); }} />
            </Bidang>
            <Bidang label="Sumber informasi" htmlFor="sumber">
              <Select value={d.sumberInformasi ?? ""} onValueChange={(v) => set("sumberInformasi", v)}>
                <SelectTrigger id="sumber" className="w-full"><SelectValue placeholder="Pilih sumber" /></SelectTrigger>
                <SelectContent>{sumber.map((s) => <SelectItem key={s.kode} value={s.kode}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </Bidang>
          </div>
          <Bidang label="Judul kasus" htmlFor="judul" wajib keterangan="Contoh: Dugaan tidak masuk kerja tanpa alasan yang sah">
            <Input id="judul" value={d.judul} onChange={(e) => set("judul", e.target.value)} />
          </Bidang>
          <Bidang label="Ringkasan / kronologi singkat" htmlFor="ringkasan">
            <Textarea id="ringkasan" rows={4} value={d.ringkasan} onChange={(e) => set("ringkasan", e.target.value)} />
          </Bidang>
          <div className="grid gap-4 sm:grid-cols-2">
            <Bidang label="Nama pelapor" htmlFor="pelapor"><Input id="pelapor" value={d.pelaporNama} onChange={(e) => set("pelaporNama", e.target.value)} /></Bidang>
            <Bidang label="Kontak pelapor" htmlFor="kontak"><Input id="kontak" value={d.pelaporKontak} onChange={(e) => set("pelaporKontak", e.target.value)} /></Bidang>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="kehadiran" className="text-[15px]">Pelanggaran kehadiran (tidak masuk kerja)</Label>
              <Switch id="kehadiran" checked={d.kehadiran} onCheckedChange={(v) => set("kehadiran", v)} />
            </div>
            {d.kehadiran && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Bidang label="Jumlah hari kerja tidak masuk tanpa alasan sah (kumulatif tahun berjalan)" htmlFor="tmk">
                  <Input id="tmk" type="number" min={0} inputMode="numeric" value={d.hariTmk ?? ""} onChange={(e) => set("hariTmk", e.target.value ? Number(e.target.value) : null)} />
                </Bidang>
                <Bidang label="Hari berturut-turut terpanjang (bila ada)" htmlFor="tmkb">
                  <Input id="tmkb" type="number" min={0} inputMode="numeric" value={d.hariTmkBerturut ?? ""} onChange={(e) => set("hariTmkBerturut", e.target.value ? Number(e.target.value) : null)} />
                </Bidang>
                <p className="text-sm text-muted-foreground sm:col-span-2">Sistem akan mengusulkan tingkat dan jenis hukuman berdasarkan tabel ambang peraturan yang berlaku pada tanggal peristiwa.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {langkah === 1 && (
        <section className="space-y-5">
          {memuatPra && <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Menghitung peraturan dan kewenangan…</div>}
          {pra && (
            <>
              <div className="rounded-xl border bg-card p-4 sm:p-6">
                <h3 className="mb-3 flex items-center gap-2 font-semibold"><Scale className="size-5" /> Peraturan dasar kasus</h3>
                {pra.regulasi && pra.resolusi?.status !== "ganda" ? (
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">{pra.regulasi.nama_singkat}</p>
                    <p className="text-sm text-muted-foreground">{pra.regulasi.nama_lengkap}</p>
                    <p className="text-sm">
                      {d.regulasiId ? "Dipilih manual." : <>Otomatis: berlaku {tanggalPanjang(pra.regulasi.berlaku_dari)}{pra.regulasi.berlaku_sampai ? ` s.d. ${tanggalPanjang(pra.regulasi.berlaku_sampai)}` : " hingga kini"}, mencakup tanggal peristiwa {tanggalPanjang(d.tanggalPeristiwa)}.</>}
                    </p>
                  </div>
                ) : null}
                {(!pra.regulasi || pra.resolusi?.status !== "tunggal" || d.regulasiId) && (
                  <div className="mt-3 space-y-2">
                    {pra.resolusi?.pesan && !d.regulasiId && <Catatan jenis="waspada">{pra.resolusi.pesan}</Catatan>}
                    <Bidang label="Pilih peraturan secara manual" htmlFor="reg">
                      <Select value={d.regulasiId ?? ""} onValueChange={(v) => { set("regulasiId", v); set("tingkatKode", null); muatPratinjau({ regulasiId: v, tingkatKode: null }); }}>
                        <SelectTrigger id="reg" className="w-full"><SelectValue placeholder="Pilih peraturan" /></SelectTrigger>
                        <SelectContent>
                          {regulasi.map((r) => <SelectItem key={r.id} value={r.id}>{r.nama_singkat} · rezim {r.rezim_kode} ({r.berlaku_dari?.slice(0, 4)}–{r.berlaku_sampai?.slice(0, 4) ?? "kini"})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Bidang>
                  </div>
                )}
              </div>

              {pra.usulanKehadiran && (
                <Catatan jenis="info" judul="Usulan dari jumlah hari tidak masuk kerja">
                  Tingkat <strong>{pra.usulanKehadiran.tingkat}</strong>, jenis <strong>{pra.usulanKehadiran.jenis}</strong>
                  {pra.usulanKehadiran.diganti && <> — sementara dijatuhkan <strong>{pra.usulanKehadiran.jenisEfektif}</strong></>}.
                  {pra.usulanKehadiran.pasal && <> Dasar: {pra.usulanKehadiran.pasal}.</>}
                  {pra.usulanKehadiran.akibat && <> Akibat tambahan: {pra.usulanKehadiran.akibat}.</>}
                  {pra.usulanKehadiran.alur === "penghentian_gaji" && <> Checklist penghentian pembayaran gaji akan tersedia di halaman kasus.</>}
                  {pra.usulanKehadiran.peringatanJenis && <span className="mt-1 block text-waspada">{pra.usulanKehadiran.peringatanJenis}</span>}
                </Catatan>
              )}

              {pra.tingkat.length > 0 && (
                <div className="rounded-xl border bg-card p-4 sm:p-6">
                  <h3 className="mb-3 font-semibold">Dugaan tingkat hukuman disiplin</h3>
                  <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
                    {pra.tingkat.map((t) => (
                      <button key={t.kode} type="button" role="radio" aria-checked={d.tingkatKode === t.kode}
                        onClick={() => { set("tingkatKode", t.kode); muatPratinjau({ tingkatKode: t.kode }); }}
                        className={cn("flex min-h-14 items-center justify-between rounded-lg border-2 px-4 py-3 text-left font-medium capitalize transition-colors", d.tingkatKode === t.kode ? "border-primary bg-accent" : "border-border hover:border-primary/50")}>
                        {t.nama}
                        {pra.usulanKehadiran?.tingkat === t.kode && <Lencana warna="info">usulan</Lencana>}
                        {d.tingkatKode === t.kode && <Check className="size-5 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pra.kewenangan && (
                <div className="rounded-xl border bg-card p-4 sm:p-6">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold"><Users className="size-5" /> Kewenangan (dihitung sistem)</h3>
                  <dl className="grid gap-4 sm:grid-cols-3">
                    {([["Pemeriksa", pra.kewenangan.pemeriksa], ["Pembentuk Tim Pemeriksa", pra.kewenangan.pembentuk_tim], ["Pejabat penjatuh hukuman", pra.kewenangan.penjatuh]] as const).map(([label, k]) => (
                      <div key={label}>
                        <dt className="text-sm text-muted-foreground">{label}</dt>
                        <dd className="font-semibold">{k?.nama ?? (label.startsWith("Pembentuk") ? "Tidak dibentuk Tim" : "—")}</dd>
                        {k?.pasal && <dd className="text-xs text-muted-foreground">{k.pasal}</dd>}
                      </div>
                    ))}
                  </dl>
                  {pra.kewenangan.bentukTim === "tidak" && <p className="mt-3 text-sm">Untuk tingkat ini <strong>tidak dibentuk Tim Pemeriksa</strong>; pemeriksaan oleh atasan langsung.</p>}
                  {pra.pemotonganIk && <div className="mt-3"><Lencana warna="waspada">Otomatis disertai pemotongan insentif kinerja</Lencana></div>}
                </div>
              )}

              {pra.peringatan.length > 0 && (
                <div className="space-y-2">{pra.peringatan.map((w) => <Catatan key={w} jenis="waspada">{w}</Catatan>)}</div>
              )}

              {pra.tahapan.length > 0 && (
                <div className="rounded-xl border bg-card p-4 sm:p-6">
                  <h3 className="mb-3 font-semibold">Tahapan yang akan dijalani</h3>
                  <ol className="space-y-2">
                    {pra.tahapan.map((t, i) => (
                      <li key={t.kode} className="flex items-start gap-3 text-sm">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{i + 1}</span>
                        <span>{t.nama} {t.opsional && <span className="text-muted-foreground">(bila perlu)</span>}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {langkah === 2 && pra?.regulasi && (
        <LangkahPelanggaran
          regulasiId={pra.regulasi.id} namaRegulasi={pra.regulasi.nama_singkat} katalogLengkap={pra.regulasi.katalog_pasal_lengkap}
          dampak={dampak} daftar={d.pelanggaran} ubah={(x) => set("pelanggaran", x)}
        />
      )}

      {langkah === 3 && pra && (
        <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
          <h3 className="font-semibold">Periksa sebelum menyimpan</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-sm text-muted-foreground">Terperiksa</dt><dd className="font-medium" data-pii>{d.pegawai?.nama_lengkap_gelar} · {d.pegawai?.nip}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Tanggal peristiwa</dt><dd className="font-medium">{tanggalPanjang(d.tanggalPeristiwa)}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Peraturan</dt><dd className="font-medium">{pra.regulasi?.nama_singkat}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Dugaan tingkat</dt><dd className="font-medium capitalize">{pra.tingkat.find((t) => t.kode === d.tingkatKode)?.nama}</dd></div>
            <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Judul</dt><dd className="font-medium">{d.judul}</dd></div>
            <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Pelanggaran</dt>
              <dd>{d.pelanggaran.length ? <ul className="list-disc pl-5">{d.pelanggaran.map((p, i) => <li key={i}>{p.pasalLabel || p.pasalTeksBebas} {p.uraian && `— ${p.uraian}`}</li>)}</ul> : <span className="text-muted-foreground">Belum diisi (dapat ditambahkan nanti)</span>}</dd>
            </div>
          </dl>
          <Catatan>Setelah disimpan, sistem membekukan identitas peraturan, identitas terperiksa, dan kutipan pasal. Perubahan katalog di kemudian hari tidak mengubah kasus ini.</Catatan>
        </section>
      )}

      <div className="sticky bottom-20 z-10 flex items-center justify-between gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur md:bottom-4">
        <Button variant="outline" onClick={() => setLangkah((l) => Math.max(0, l - 1))} disabled={langkah === 0}><ArrowLeft /> Kembali</Button>
        {langkah < LANGKAH.length - 1 ? (
          <Button size="lg" onClick={lanjut} disabled={memuatPra}>{memuatPra ? <Loader2 className="animate-spin" /> : null} Lanjut <ArrowRight /></Button>
        ) : (
          <Button size="lg" onClick={simpan} disabled={sibuk}>{sibuk ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Simpan kasus</Button>
        )}
      </div>
    </div>
  );
}

function LangkahPelanggaran({ regulasiId, namaRegulasi, katalogLengkap, dampak, daftar, ubah }: {
  regulasiId: string; namaRegulasi: string; katalogLengkap: boolean; dampak: Opsi[]; daftar: Pelanggaran[]; ubah: (x: Pelanggaran[]) => void;
}) {
  const [pasal, setPasal] = useState<Pasal[]>([]);
  const [cari, setCari] = useState("");
  const [baru, setBaru] = useState<Pelanggaran>({ pasalRegulasiId: null, pasalLabel: "", pasalTeksBebas: null, uraian: "", dampak: null, waktu: "", tempat: "" });
  const [usulan, setUsulan] = useState<string | null>(null);

  useEffect(() => {
    if (!katalogLengkap) return;
    daftarPasalAksi(regulasiId).then((h) => { if (h.ok) setPasal(h.data); });
  }, [regulasiId, katalogLengkap]);

  useEffect(() => {
    if (!baru.dampak) { setUsulan(null); return; }
    usulTingkatAksi(regulasiId, baru.pasalRegulasiId, baru.dampak).then((h) => setUsulan(h.ok && h.data ? `${h.data.nama}${h.data.rujukan ? ` (${h.data.rujukan})` : ""}` : null));
  }, [regulasiId, baru.pasalRegulasiId, baru.dampak]);

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return pasal.filter((p) => !q || kunciPasal(p).toLowerCase().includes(q) || p.teks.toLowerCase().includes(q)).slice(0, 60);
  }, [pasal, cari]);

  function tambah() {
    if (!baru.pasalRegulasiId && !baru.pasalTeksBebas?.trim() && !baru.uraian.trim()) return toast.error("Pilih pasal atau tuliskan uraian.");
    ubah([...daftar, { ...baru, usulan }]);
    setBaru({ pasalRegulasiId: null, pasalLabel: "", pasalTeksBebas: null, uraian: "", dampak: null, waktu: "", tempat: "" });
    setCari("");
  }

  return (
    <section className="space-y-5">
      <Catatan>Hanya pasal milik <strong>{namaRegulasi}</strong> yang ditawarkan, sehingga tidak mungkin terjadi rujukan pasal lintas peraturan. Langkah ini boleh dilewati dan dilengkapi nanti.</Catatan>
      <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        {katalogLengkap ? (
          <Bidang label="Pasal kewajiban / larangan yang dilanggar">
            {baru.pasalRegulasiId ? (
              <div className="flex items-start justify-between gap-2 rounded-lg border bg-accent/50 p-3">
                <div><p className="font-semibold">{baru.pasalLabel}</p></div>
                <Button variant="ghost" size="sm" onClick={() => setBaru({ ...baru, pasalRegulasiId: null, pasalLabel: "" })}>Ganti</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nomor pasal atau kata kunci, mis. 'masuk kerja'" className="pl-9" />
                </div>
                <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
                  {tersaring.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setBaru({ ...baru, pasalRegulasiId: p.id, pasalLabel: `${kunciPasal(p)} (${p.jenis})` })} className="w-full px-3 py-2.5 text-left hover:bg-accent">
                        <span className="flex flex-wrap items-center gap-2 font-medium">{kunciPasal(p)} <Lencana>{p.jenis}</Lencana>{p.perlu_verifikasi && <LencanaVerifikasi />}</span>
                        <span className="line-clamp-2 text-sm text-muted-foreground">{p.teks}</span>
                      </button>
                    </li>
                  ))}
                  {!tersaring.length && <li className="px-3 py-4 text-sm text-muted-foreground">Tidak ada pasal yang cocok.</li>}
                </ul>
              </div>
            )}
          </Bidang>
        ) : (
          <Bidang label="Pasal (teks bebas)" htmlFor="pasal-bebas" keterangan="Peraturan ini tidak memiliki katalog pasal lengkap (arsip lama).">
            <Input id="pasal-bebas" value={baru.pasalTeksBebas ?? ""} onChange={(e) => setBaru({ ...baru, pasalTeksBebas: e.target.value })} />
          </Bidang>
        )}
        <Bidang label="Uraian perbuatan" htmlFor="uraian"><Textarea id="uraian" rows={3} value={baru.uraian} onChange={(e) => setBaru({ ...baru, uraian: e.target.value })} /></Bidang>
        <div className="grid gap-4 sm:grid-cols-3">
          <Bidang label="Dampak" htmlFor="dampak">
            <Select value={baru.dampak ?? ""} onValueChange={(v) => setBaru({ ...baru, dampak: v })}>
              <SelectTrigger id="dampak" className="w-full"><SelectValue placeholder="Pilih dampak" /></SelectTrigger>
              <SelectContent>{dampak.map((x) => <SelectItem key={x.kode} value={x.kode}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
          </Bidang>
          <Bidang label="Waktu" htmlFor="waktu"><Input id="waktu" value={baru.waktu} onChange={(e) => setBaru({ ...baru, waktu: e.target.value })} placeholder="mis. Januari–Maret 2026" /></Bidang>
          <Bidang label="Tempat" htmlFor="tempat"><Input id="tempat" value={baru.tempat} onChange={(e) => setBaru({ ...baru, tempat: e.target.value })} /></Bidang>
        </div>
        {usulan && <p className="text-sm">Usulan tingkat menurut pemetaan pelanggaran: <strong>{usulan}</strong></p>}
        <Button variant="secondary" onClick={tambah}><Plus /> Tambahkan pelanggaran</Button>
      </div>

      {daftar.length > 0 && (
        <ul className="space-y-2">
          {daftar.map((p, i) => (
            <li key={i} className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="min-w-0 space-y-1">
                <p className="font-semibold">{p.pasalLabel || p.pasalTeksBebas || "Uraian"}</p>
                {p.uraian && <p className="text-sm">{p.uraian}</p>}
                <p className="text-sm text-muted-foreground">{[dampak.find((x) => x.kode === p.dampak)?.label, p.waktu, p.tempat].filter(Boolean).join(" · ")}</p>
                {p.usulan && <p className="text-xs text-muted-foreground">Usulan tingkat: {p.usulan}</p>}
              </div>
              <Button variant="ghost" size="icon" aria-label="Hapus" onClick={() => ubah(daftar.filter((_, j) => j !== i))}><Trash2 /></Button>
            </li>
          ))}
          {daftar.length > 1 && <Catatan jenis="info"><AlertTriangle className="mr-1 inline size-4" />Beberapa pelanggaran dalam satu pemeriksaan hanya menghasilkan satu jenis hukuman, yaitu yang terberat.</Catatan>}
        </ul>
      )}
    </section>
  );
}
