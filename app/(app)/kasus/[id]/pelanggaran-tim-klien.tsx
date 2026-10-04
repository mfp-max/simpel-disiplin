"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Bidang } from "@/components/simpel/form-entri";
import { Lencana, LencanaVerifikasi } from "@/components/simpel/lencana";
import { PilihPegawai, useAksi, type PegawaiRingkas } from "@/components/simpel/interaktif";
import { kunciPasal } from "@/lib/regulasi/definisi";
import { daftarPasalAksi, simpanTimAksi, tambahAnggotaAksi, tambahPelanggaranAksi, usulTingkatAksi, hapusAnggotaAksi } from "../_aksi";

type Opsi = { kode: string; label: string };
type Pasal = { id: string; jenis: string; pasal: string; ayat: string | null; huruf: string | null; angka: string | null; teks: string; perlu_verifikasi: boolean };

export function TambahPelanggaran({ entriId, regulasiId, katalogLengkap, namaRegulasi, dampak }: { entriId: string; regulasiId: string; katalogLengkap: boolean; namaRegulasi: string; dampak: Opsi[] }) {
  const [buka, setBuka] = useState(false);
  const [pasal, setPasal] = useState<Pasal[]>([]);
  const [cari, setCari] = useState("");
  const [pilih, setPilih] = useState<Pasal | null>(null);
  const [bebas, setBebas] = useState("");
  const [uraian, setUraian] = useState("");
  const [dmp, setDmp] = useState<string | null>(null);
  const [waktu, setWaktu] = useState("");
  const [tempat, setTempat] = useState("");
  const [usulan, setUsulan] = useState<string | null>(null);
  const { jalankan, sibuk } = useAksi();

  useEffect(() => {
    if (buka && katalogLengkap && !pasal.length) daftarPasalAksi(regulasiId).then((h) => h.ok && setPasal(h.data));
  }, [buka, katalogLengkap, regulasiId, pasal.length]);
  useEffect(() => {
    if (!dmp) return setUsulan(null);
    usulTingkatAksi(regulasiId, pilih?.id ?? null, dmp).then((h) => setUsulan(h.ok && h.data ? `${h.data.nama}${h.data.rujukan ? ` (${h.data.rujukan})` : ""}` : null));
  }, [regulasiId, pilih, dmp]);
  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return pasal.filter((p) => !q || kunciPasal(p).toLowerCase().includes(q) || p.teks.toLowerCase().includes(q)).slice(0, 60);
  }, [pasal, cari]);

  function reset() { setPilih(null); setBebas(""); setUraian(""); setDmp(null); setWaktu(""); setTempat(""); setCari(""); }

  return (
    <Dialog open={buka} onOpenChange={(b) => { setBuka(b); if (!b) reset(); }}>
      <DialogTrigger asChild><Button><Plus /> Tambah pelanggaran</Button></DialogTrigger>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tambah pelanggaran</DialogTitle>
          <DialogDescription>Hanya pasal milik {namaRegulasi}. Bunyi pasal akan dibekukan pada kasus ini.</DialogDescription>
        </DialogHeader>
        {katalogLengkap ? (
          pilih ? (
            <div className="flex items-start justify-between gap-2 rounded-lg border bg-accent/50 p-3">
              <div><p className="font-semibold">{kunciPasal(pilih)} <Lencana>{pilih.jenis}</Lencana></p><p className="text-sm text-muted-foreground">{pilih.teks}</p></div>
              <Button variant="ghost" size="sm" onClick={() => setPilih(null)}>Ganti</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nomor pasal atau kata kunci" className="pl-9" />
              </div>
              <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                {tersaring.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => setPilih(p)} className="w-full px-3 py-2.5 text-left hover:bg-accent">
                      <span className="flex flex-wrap items-center gap-2 font-medium">{kunciPasal(p)} <Lencana>{p.jenis}</Lencana>{p.perlu_verifikasi && <LencanaVerifikasi />}</span>
                      <span className="line-clamp-2 text-sm text-muted-foreground">{p.teks}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : (
          <Bidang label="Pasal (teks bebas)" htmlFor="pb"><Input id="pb" value={bebas} onChange={(e) => setBebas(e.target.value)} /></Bidang>
        )}
        <Bidang label="Uraian perbuatan" htmlFor="ur"><Textarea id="ur" rows={3} value={uraian} onChange={(e) => setUraian(e.target.value)} /></Bidang>
        <div className="grid gap-3 sm:grid-cols-3">
          <Bidang label="Dampak" htmlFor="dm">
            <Select value={dmp ?? ""} onValueChange={setDmp}>
              <SelectTrigger id="dm" className="w-full"><SelectValue placeholder="Pilih" /></SelectTrigger>
              <SelectContent>{dampak.map((x) => <SelectItem key={x.kode} value={x.kode}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
          </Bidang>
          <Bidang label="Waktu" htmlFor="wk"><Input id="wk" value={waktu} onChange={(e) => setWaktu(e.target.value)} /></Bidang>
          <Bidang label="Tempat" htmlFor="tp"><Input id="tp" value={tempat} onChange={(e) => setTempat(e.target.value)} /></Bidang>
        </div>
        {usulan && <p className="text-sm">Usulan tingkat menurut pemetaan: <strong>{usulan}</strong></p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setBuka(false)}>Batal</Button>
          <Button disabled={sibuk} onClick={() => jalankan(() => tambahPelanggaranAksi(entriId, { pasalRegulasiId: pilih?.id ?? null, pasalTeksBebas: bebas || null, uraian: uraian || null, dampak: dmp, waktu: waktu || null, tempat: tempat || null }), { lalu: () => { setBuka(false); reset(); } })}>
            {sibuk && <Loader2 className="animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FormTim({ entriId, awal, jenisTim, pembentukUsulan, perluLaporSekjen }: {
  entriId: string;
  awal: { jenis: string; nomor_sk: string | null; tanggal_sk: string | null; pejabat_pembentuk: string | null; dilaporkan_ke_sekjen_pada: string | null; catatan: string | null } | null;
  jenisTim: Opsi[]; pembentukUsulan: string | null; perluLaporSekjen: boolean;
}) {
  const [d, setD] = useState({
    jenis: awal?.jenis ?? jenisTim[jenisTim.length - 1]?.kode ?? "um", nomor_sk: awal?.nomor_sk ?? "", tanggal_sk: awal?.tanggal_sk ?? "",
    pejabat_pembentuk: awal?.pejabat_pembentuk ?? pembentukUsulan ?? "", dilaporkan_ke_sekjen_pada: awal?.dilaporkan_ke_sekjen_pada ?? "", catatan: awal?.catatan ?? "",
  });
  const { jalankan, sibuk } = useAksi();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Bidang label="Jenis tim" htmlFor="jt">
          <Select value={d.jenis} onValueChange={(v) => setD({ ...d, jenis: v })}>
            <SelectTrigger id="jt" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{jenisTim.map((x) => <SelectItem key={x.kode} value={x.kode}>{x.label}</SelectItem>)}</SelectContent>
          </Select>
        </Bidang>
        <Bidang label="Pejabat pembentuk" htmlFor="pp" keterangan={pembentukUsulan ? `Menurut aturan: ${pembentukUsulan}` : undefined}>
          <Input id="pp" value={d.pejabat_pembentuk} onChange={(e) => setD({ ...d, pejabat_pembentuk: e.target.value })} />
        </Bidang>
        <Bidang label="Nomor SK pembentukan" htmlFor="nsk"><Input id="nsk" value={d.nomor_sk} onChange={(e) => setD({ ...d, nomor_sk: e.target.value })} /></Bidang>
        <Bidang label="Tanggal SK" htmlFor="tsk"><Input id="tsk" type="date" value={d.tanggal_sk} onChange={(e) => setD({ ...d, tanggal_sk: e.target.value })} /></Bidang>
        {perluLaporSekjen && (
          <Bidang label="Salinan SK dilaporkan ke Sekjen pada" htmlFor="lsj" keterangan="Wajib untuk Tim yang dibentuk Rektor berdasarkan delegasi Menteri.">
            <Input id="lsj" type="date" value={d.dilaporkan_ke_sekjen_pada} onChange={(e) => setD({ ...d, dilaporkan_ke_sekjen_pada: e.target.value })} />
          </Bidang>
        )}
      </div>
      <Button disabled={sibuk} onClick={() => jalankan(() => simpanTimAksi(entriId, d))}>{sibuk && <Loader2 className="animate-spin" />} Simpan data Tim</Button>
    </div>
  );
}

export function TambahAnggota({ entriId, unsur, jabatan }: { entriId: string; unsur: Opsi[]; jabatan: Opsi[] }) {
  const [buka, setBuka] = useState(false);
  const [luar, setLuar] = useState(false);
  const [pg, setPg] = useState<PegawaiRingkas | null>(null);
  const [nama, setNama] = useState(""); const [nip, setNip] = useState(""); const [jab, setJab] = useState(""); const [gol, setGol] = useState("");
  const [un, setUn] = useState(unsur[0]?.kode ?? ""); const [jt, setJt] = useState("anggota"); const [konflik, setKonflik] = useState(false);
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open={buka} onOpenChange={setBuka}>
      <DialogTrigger asChild><Button><UserPlus /> Tambah anggota</Button></DialogTrigger>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Tambah anggota Tim Pemeriksa</DialogTitle><DialogDescription>Sistem menolak anggota yang pangkat/jabatannya lebih rendah dari terperiksa.</DialogDescription></DialogHeader>
        <div className="flex items-center gap-2"><Switch id="luar" checked={luar} onCheckedChange={setLuar} /><Label htmlFor="luar" className="font-normal">Bukan dari master pegawai (mis. SPI/eksternal)</Label></div>
        {luar ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Bidang label="Nama" htmlFor="an"><Input id="an" value={nama} onChange={(e) => setNama(e.target.value)} /></Bidang>
            <Bidang label="NIP" htmlFor="ani"><Input id="ani" value={nip} onChange={(e) => setNip(e.target.value)} /></Bidang>
            <Bidang label="Jabatan" htmlFor="aj"><Input id="aj" value={jab} onChange={(e) => setJab(e.target.value)} /></Bidang>
            <Bidang label="Golongan ruang" htmlFor="ag" keterangan="mis. IV/a — untuk membandingkan jenjang"><Input id="ag" value={gol} onChange={(e) => setGol(e.target.value)} /></Bidang>
          </div>
        ) : (
          <PilihPegawai nilai={pg} onPilih={setPg} />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Bidang label="Unsur" htmlFor="un">
            <Select value={un} onValueChange={setUn}><SelectTrigger id="un" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{unsur.map((x) => <SelectItem key={x.kode} value={x.kode}>{x.label}</SelectItem>)}</SelectContent></Select>
          </Bidang>
          <Bidang label="Kedudukan dalam tim" htmlFor="jt2">
            <Select value={jt} onValueChange={setJt}><SelectTrigger id="jt2" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{jabatan.map((x) => <SelectItem key={x.kode} value={x.kode}>{x.label}</SelectItem>)}</SelectContent></Select>
          </Bidang>
        </div>
        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <Checkbox checked={konflik} onCheckedChange={(v) => setKonflik(!!v)} className="mt-0.5 size-5" />
          Anggota telah menyatakan tidak memiliki konflik kepentingan dengan terperiksa dalam perkara ini.
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBuka(false)}>Batal</Button>
          <Button disabled={sibuk} onClick={() => jalankan(() => tambahAnggotaAksi(entriId, { pegawaiId: luar ? null : pg?.id ?? null, namaBebas: luar ? nama : null, nipBebas: nip || null, jabatanBebas: jab || null, golonganRuang: gol || null, unsur: un, jabatanDalamTim: jt, pernyataanBebasKonflik: konflik }), {
            lalu: (peringatan) => { (peringatan as string[] | undefined)?.forEach((w) => toast.warning(w)); setBuka(false); setPg(null); setNama(""); setNip(""); setJab(""); setGol(""); setKonflik(false); },
          })}>{sibuk && <Loader2 className="animate-spin" />} Tambahkan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HapusAnggota({ id }: { id: string }) {
  const { jalankan, sibuk } = useAksi();
  return <Button variant="ghost" size="icon" aria-label="Hapus anggota" disabled={sibuk} onClick={() => { if (confirm("Hapus anggota ini dari tim?")) jalankan(() => hapusAnggotaAksi(id)); }}><Trash2 /></Button>;
}
