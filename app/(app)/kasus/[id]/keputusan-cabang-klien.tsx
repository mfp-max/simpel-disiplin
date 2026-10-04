"use client";

import { useEffect, useState } from "react";
import { CheckSquare, Loader2, Octagon, Plus, RefreshCcw, Save, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Bidang } from "@/components/simpel/form-entri";
import { Catatan } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { useAksi } from "@/components/simpel/interaktif";
import { tanggalPanjang } from "@/lib/format";
import { aturPicAksi, catatHukumanAksi, gantiTingkatAksi, hentikanKasusAksi, hitungBerlakuAksi, simpanPembebasanAksi, simpanPenghentianGajiAksi, simpanUpayaAksi } from "../_aksi";

type Opsi = { kode: string; label: string };
export type JenisPilih = { id: string; nama: string; tingkat: string; tingkatKode: string; durasi: number | null; peringatan: string | null; pengganti: string | null };

export function FormKeputusan({ entriId, jenis, awal, penjatuhUsulan, terkunci }: {
  entriId: string; jenis: JenisPilih[];
  awal: { jenisHukumanId: string | null; nomorSk: string | null; tanggalSk: string | null; pejabatPenjatuh: string | null; tanggalDiterima: string | null; catatan: string | null } | null;
  penjatuhUsulan: string | null; terkunci: boolean;
}) {
  const [d, setD] = useState({
    jenisHukumanId: awal?.jenisHukumanId ?? "", nomorSk: awal?.nomorSk ?? "", tanggalSk: awal?.tanggalSk ?? "",
    pejabatPenjatuh: awal?.pejabatPenjatuh ?? penjatuhUsulan ?? "", tanggalDiterima: awal?.tanggalDiterima ?? "", catatan: awal?.catatan ?? "",
  });
  const [berlaku, setBerlaku] = useState<{ tanggal: string; aturan: string } | null>(null);
  const { jalankan, sibuk } = useAksi();
  const j = jenis.find((x) => x.id === d.jenisHukumanId);

  useEffect(() => {
    if (!d.tanggalDiterima) return setBerlaku(null);
    hitungBerlakuAksi(entriId, d.tanggalDiterima).then((h) => setBerlaku(h.ok ? h.data : null));
  }, [entriId, d.tanggalDiterima]);

  const perTingkat = jenis.reduce<Record<string, JenisPilih[]>>((a, x) => ((a[x.tingkat] ??= []).push(x), a), {});

  return (
    <div className="space-y-4">
      <Bidang label="Jenis hukuman disiplin" htmlFor="jh" keterangan={terkunci ? "Jenis hukuman sudah dibekukan pada keputusan ini dan tidak dapat diganti." : "Hanya jenis hukuman milik peraturan kasus ini."}>
        <Select value={d.jenisHukumanId} onValueChange={(v) => setD({ ...d, jenisHukumanId: v })} disabled={terkunci}>
          <SelectTrigger id="jh" className="h-auto min-h-11 w-full whitespace-normal text-left"><SelectValue placeholder="Pilih jenis hukuman" /></SelectTrigger>
          <SelectContent>
            {Object.entries(perTingkat).map(([t, xs]) => (
              <div key={t}>
                <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">{t}</div>
                {xs.map((x) => <SelectItem key={x.id} value={x.id} className="whitespace-normal">{x.nama}</SelectItem>)}
              </div>
            ))}
          </SelectContent>
        </Select>
      </Bidang>
      {j?.peringatan && <Catatan jenis="waspada" judul="Perhatian">{j.peringatan}</Catatan>}
      {j?.pengganti && <p className="text-sm">Yang dijatuhkan sementara: <strong>{j.pengganti}</strong></p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Bidang label="Nomor SK" htmlFor="nsk"><Input id="nsk" value={d.nomorSk} onChange={(e) => setD({ ...d, nomorSk: e.target.value })} /></Bidang>
        <Bidang label="Tanggal SK ditetapkan" htmlFor="tsk"><Input id="tsk" type="date" value={d.tanggalSk} onChange={(e) => setD({ ...d, tanggalSk: e.target.value })} /></Bidang>
        <Bidang label="Pejabat penjatuh" htmlFor="pj" keterangan={penjatuhUsulan ? `Menurut aturan kewenangan: ${penjatuhUsulan}` : undefined}>
          <Input id="pj" value={d.pejabatPenjatuh} onChange={(e) => setD({ ...d, pejabatPenjatuh: e.target.value })} />
        </Bidang>
        <Bidang label="Tanggal SK diterima pegawai" htmlFor="tdt"><Input id="tdt" type="date" value={d.tanggalDiterima} onChange={(e) => setD({ ...d, tanggalDiterima: e.target.value })} /></Bidang>
      </div>
      {berlaku && (
        <Catatan jenis="aman" judul={`Mulai berlaku: ${tanggalPanjang(berlaku.tanggal)}`}>
          Dihitung otomatis melewati akhir pekan & hari libur — aturan: {berlaku.aturan}.
          {j?.durasi ? <> Masa hukuman {j.durasi} bulan.</> : null}
        </Catatan>
      )}
      <Bidang label="Catatan" htmlFor="ck"><Textarea id="ck" rows={2} value={d.catatan} onChange={(e) => setD({ ...d, catatan: e.target.value })} /></Bidang>
      <Button size="lg" disabled={sibuk || !d.jenisHukumanId} onClick={() => jalankan(() => catatHukumanAksi(entriId, { ...d, nomorSk: d.nomorSk || null, tanggalSk: d.tanggalSk || null, pejabatPenjatuh: d.pejabatPenjatuh || null, tanggalDiterima: d.tanggalDiterima || null, catatan: d.catatan || null }))}>
        {sibuk ? <Loader2 className="animate-spin" /> : <Save />} Simpan keputusan
      </Button>
    </div>
  );
}

export function FormUpaya({ entriId, jenisUpaya, hasil, kepadaUsulan, awal }: {
  entriId: string; jenisUpaya: Opsi[]; hasil: Opsi[]; kepadaUsulan: Record<string, string>;
  awal?: { id: string; jenis: string; tanggal_pengajuan: string | null; diajukan_kepada: string | null; tanggal_putusan: string | null; hasil: string | null; nomor_putusan: string | null; catatan: string | null };
}) {
  const [buka, setBuka] = useState(false);
  const [d, setD] = useState({ jenis: awal?.jenis ?? jenisUpaya[0]?.kode ?? "keberatan", tanggal_pengajuan: awal?.tanggal_pengajuan ?? "", diajukan_kepada: awal?.diajukan_kepada ?? "", tanggal_putusan: awal?.tanggal_putusan ?? "", hasil: awal?.hasil ?? "", nomor_putusan: awal?.nomor_putusan ?? "", catatan: awal?.catatan ?? "" });
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open={buka} onOpenChange={setBuka}>
      <DialogTrigger asChild>{awal ? <Button variant="outline" size="sm">Ubah</Button> : <Button variant="outline"><Plus /> Catat upaya administratif</Button>}</DialogTrigger>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Upaya administratif</DialogTitle><DialogDescription>Keberatan atau banding administratif terhadap keputusan hukuman disiplin.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Bidang label="Jenis" htmlFor="uj">
            <Select value={d.jenis} onValueChange={(v) => setD({ ...d, jenis: v, diajukan_kepada: d.diajukan_kepada || kepadaUsulan[v] || "" })}>
              <SelectTrigger id="uj" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{jenisUpaya.map((x) => <SelectItem key={x.kode} value={x.kode}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
          </Bidang>
          <Bidang label="Tanggal pengajuan" htmlFor="utp"><Input id="utp" type="date" value={d.tanggal_pengajuan} onChange={(e) => setD({ ...d, tanggal_pengajuan: e.target.value })} /></Bidang>
          <Bidang label="Diajukan kepada" htmlFor="uk" keterangan={kepadaUsulan[d.jenis] ? `Menurut peraturan: ${kepadaUsulan[d.jenis]}` : undefined}><Input id="uk" value={d.diajukan_kepada} onChange={(e) => setD({ ...d, diajukan_kepada: e.target.value })} /></Bidang>
          <Bidang label="Tanggal putusan" htmlFor="utu"><Input id="utu" type="date" value={d.tanggal_putusan} onChange={(e) => setD({ ...d, tanggal_putusan: e.target.value })} /></Bidang>
          <Bidang label="Hasil" htmlFor="uh">
            <Select value={d.hasil} onValueChange={(v) => setD({ ...d, hasil: v })}>
              <SelectTrigger id="uh" className="w-full"><SelectValue placeholder="Belum diputus" /></SelectTrigger>
              <SelectContent>{hasil.map((x) => <SelectItem key={x.kode} value={x.kode}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
          </Bidang>
          <Bidang label="Nomor putusan" htmlFor="un"><Input id="un" value={d.nomor_putusan} onChange={(e) => setD({ ...d, nomor_putusan: e.target.value })} /></Bidang>
          <div className="sm:col-span-2"><Bidang label="Catatan" htmlFor="uc"><Textarea id="uc" rows={2} value={d.catatan} onChange={(e) => setD({ ...d, catatan: e.target.value })} /></Bidang></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBuka(false)}>Batal</Button>
          <Button disabled={sibuk} onClick={() => jalankan(() => simpanUpayaAksi(entriId, { id: awal?.id, ...d }), { lalu: () => setBuka(false) })}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FormPembebasan({ entriId, awal }: { entriId: string; awal: { nomor_sk: string | null; tanggal_sk: string | null; tanggal_mulai: string | null; tanggal_selesai: string | null; catatan: string | null } | null }) {
  const [d, setD] = useState({ nomor_sk: awal?.nomor_sk ?? "", tanggal_sk: awal?.tanggal_sk ?? "", tanggal_mulai: awal?.tanggal_mulai ?? "", tanggal_selesai: awal?.tanggal_selesai ?? "", catatan: awal?.catatan ?? "" });
  const { jalankan, sibuk } = useAksi();
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Bidang label="Nomor SK" htmlFor="bn"><Input id="bn" value={d.nomor_sk} onChange={(e) => setD({ ...d, nomor_sk: e.target.value })} /></Bidang>
        <Bidang label="Tanggal SK" htmlFor="bt"><Input id="bt" type="date" value={d.tanggal_sk} onChange={(e) => setD({ ...d, tanggal_sk: e.target.value })} /></Bidang>
        <Bidang label="Mulai" htmlFor="bm"><Input id="bm" type="date" value={d.tanggal_mulai} onChange={(e) => setD({ ...d, tanggal_mulai: e.target.value })} /></Bidang>
        <Bidang label="Selesai" htmlFor="bs"><Input id="bs" type="date" value={d.tanggal_selesai} onChange={(e) => setD({ ...d, tanggal_selesai: e.target.value })} /></Bidang>
      </div>
      <Bidang label="Catatan" htmlFor="bc"><Textarea id="bc" rows={2} value={d.catatan} onChange={(e) => setD({ ...d, catatan: e.target.value })} /></Bidang>
      <Button variant="outline" disabled={sibuk} onClick={() => jalankan(() => simpanPembebasanAksi(entriId, d))}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
    </div>
  );
}

const LANGKAH_GAJI = [
  { kolom: "tanggal_lapor_atasan", label: "Atasan langsung memberi tahu unit kepegawaian" },
  { kolom: "tanggal_verval", label: "Unit kepegawaian melakukan verifikasi dan validasi" },
  { kolom: "tanggal_ke_kpa", label: "Hasil disampaikan ke Kuasa Pengguna Anggaran (KPA)" },
  { kolom: "tanggal_sk_kpa", label: "KPA menetapkan keputusan penghentian pembayaran gaji" },
] as const;

export function ChecklistGaji({ entriId, awal }: { entriId: string; awal: Record<string, string | number | null> | null }) {
  const [d, setD] = useState<Record<string, string | number | null>>({
    tanggal_mulai_tmk: awal?.tanggal_mulai_tmk ?? "", jumlah_hari_berturut: awal?.jumlah_hari_berturut ?? null,
    tanggal_lapor_atasan: awal?.tanggal_lapor_atasan ?? "", tanggal_verval: awal?.tanggal_verval ?? "", tanggal_ke_kpa: awal?.tanggal_ke_kpa ?? "",
    tanggal_sk_kpa: awal?.tanggal_sk_kpa ?? "", nomor_sk_kpa: awal?.nomor_sk_kpa ?? "", catatan: awal?.catatan ?? "",
  });
  const { jalankan, sibuk } = useAksi();
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Bidang label="Mulai tidak masuk kerja" htmlFor="gm"><Input id="gm" type="date" value={String(d.tanggal_mulai_tmk ?? "")} onChange={(e) => setD({ ...d, tanggal_mulai_tmk: e.target.value })} /></Bidang>
        <Bidang label="Jumlah hari berturut-turut" htmlFor="gj"><Input id="gj" type="number" value={String(d.jumlah_hari_berturut ?? "")} onChange={(e) => setD({ ...d, jumlah_hari_berturut: e.target.value ? Number(e.target.value) : null })} /></Bidang>
      </div>
      <ol className="space-y-3">
        {LANGKAH_GAJI.map((l, i) => (
          <li key={l.kolom} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-start gap-2 text-sm">
              <CheckSquare className={d[l.kolom] ? "size-5 shrink-0 text-aman" : "size-5 shrink-0 text-muted-foreground"} />
              {i + 1}. {l.label}
            </span>
            <Input aria-label={l.label} type="date" className="sm:w-48" value={String(d[l.kolom] ?? "")} onChange={(e) => setD({ ...d, [l.kolom]: e.target.value })} />
          </li>
        ))}
      </ol>
      <Bidang label="Nomor keputusan KPA" htmlFor="gn"><Input id="gn" value={String(d.nomor_sk_kpa ?? "")} onChange={(e) => setD({ ...d, nomor_sk_kpa: e.target.value })} /></Bidang>
      <Button variant="outline" disabled={sibuk} onClick={() => jalankan(() => simpanPenghentianGajiAksi(entriId, d as never))}>{sibuk && <Loader2 className="animate-spin" />} Simpan checklist</Button>
    </div>
  );
}

export function AksiKepala({ entriId, tingkat, tingkatSaatIni, bolehGantiTingkat, alasanHenti, pengguna, picSaatIni, boleh }: {
  entriId: string; tingkat: Opsi[]; tingkatSaatIni: string | null; bolehGantiTingkat: boolean; alasanHenti: Opsi[];
  pengguna: { id: string; nama: string }[]; picSaatIni: string | null; boleh: { ubah: boolean; status: boolean };
}) {
  const [bukaT, setBukaT] = useState(false); const [tk, setTk] = useState(tingkatSaatIni ?? ""); const [alT, setAlT] = useState("");
  const [bukaH, setBukaH] = useState(false); const [ak, setAk] = useState(alasanHenti[0]?.kode ?? ""); const [alH, setAlH] = useState("");
  const [bukaP, setBukaP] = useState(false); const [pic, setPic] = useState(picSaatIni ?? "");
  const { jalankan, sibuk } = useAksi();
  return (
    <>
      {boleh.ubah && (
        <Dialog open={bukaP} onOpenChange={setBukaP}>
          <DialogTrigger asChild><Button variant="outline"><UserCog /> Penanggung jawab</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Penanggung jawab kasus</DialogTitle></DialogHeader>
            <Select value={pic} onValueChange={setPic}><SelectTrigger className="w-full"><SelectValue placeholder="Pilih pengguna" /></SelectTrigger><SelectContent>{pengguna.map((u) => <SelectItem key={u.id} value={u.id}>{u.nama}</SelectItem>)}</SelectContent></Select>
            <DialogFooter><Button disabled={sibuk} onClick={() => jalankan(() => aturPicAksi(entriId, pic || null), { lalu: () => setBukaP(false) })}>Simpan</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {boleh.ubah && bolehGantiTingkat && (
        <Dialog open={bukaT} onOpenChange={setBukaT}>
          <DialogTrigger asChild><Button variant="outline"><RefreshCcw /> Ganti tingkat</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Ganti dugaan tingkat hukuman</DialogTitle><DialogDescription>Tahapan dan kewenangan akan disusun ulang. Hanya bisa selama kasus masih di tahap telaah.</DialogDescription></DialogHeader>
            <Select value={tk} onValueChange={setTk}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{tingkat.map((t) => <SelectItem key={t.kode} value={t.kode} className="capitalize">{t.label}</SelectItem>)}</SelectContent></Select>
            <div className="space-y-1.5"><Label htmlFor="alt">Alasan</Label><Textarea id="alt" rows={2} value={alT} onChange={(e) => setAlT(e.target.value)} /></div>
            <DialogFooter><Button disabled={sibuk || alT.trim().length < 5 || tk === tingkatSaatIni} onClick={() => jalankan(() => gantiTingkatAksi(entriId, tk, alT.trim()), { lalu: () => setBukaT(false) })}>{sibuk && <Loader2 className="animate-spin" />} Ganti tingkat</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {boleh.status && (
        <Dialog open={bukaH} onOpenChange={setBukaH}>
          <DialogTrigger asChild><Button variant="outline"><Octagon /> Hentikan</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Hentikan kasus</DialogTitle><DialogDescription>Kasus berstatus “dihentikan” dan tidak lagi dihitung sebagai kasus aktif. Data tetap tersimpan.</DialogDescription></DialogHeader>
            <Select value={ak} onValueChange={setAk}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{alasanHenti.map((a) => <SelectItem key={a.kode} value={a.kode}>{a.label}</SelectItem>)}</SelectContent></Select>
            <div className="space-y-1.5"><Label htmlFor="alh">Penjelasan</Label><Textarea id="alh" rows={3} value={alH} onChange={(e) => setAlH(e.target.value)} /></div>
            <DialogFooter><Button variant="destructive" disabled={sibuk || alH.trim().length < 5} onClick={() => jalankan(() => hentikanKasusAksi(entriId, ak, alH.trim()), { lalu: () => setBukaH(false) })}>{sibuk && <Loader2 className="animate-spin" />} Hentikan kasus</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export { Lencana };
