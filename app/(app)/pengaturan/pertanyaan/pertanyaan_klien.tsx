"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Eye, EyeOff, ListOrdered, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Kosong, Panel } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { useAksi } from "@/components/simpel/interaktif";
import { cn } from "@/lib/utils";
import {
  aktifkanBaku, buatSet, geserBaku, geserButir, hapusButir, tambahBaku, tambahButir, ubahBaku, ubahButir, ubahSet,
} from "./_aksi";

export type ButirBaku = { id: string; bagian: "pembuka" | "substansi" | "penutup"; urutan: number; pertanyaan: string; aktif: boolean };
export type ButirBank = { id: string; nama_set: string; jenis_pelanggaran: string | null; urutan: number; pertanyaan: string; aktif: boolean };

const BAGIAN = [
  { kode: "pembuka", judul: "Pembuka", ket: "Konfirmasi surat panggilan, kesehatan, kesediaan memberi keterangan, riwayat pekerjaan." },
  { kode: "substansi", judul: "Substansi", ket: "Pertanyaan umum tentang dugaan pelanggaran. Notulis dapat menyisipkan pertanyaan tambahan saat sidang." },
  { kode: "penutup", judul: "Penutup", ket: "Kesadaran akan implikasi, keterangan tambahan, penegasan tanpa tekanan." },
] as const;

const SARAN_JENIS = ["Ketidakhadiran (tidak masuk kerja)", "Penyalahgunaan wewenang", "Pelanggaran jam kerja", "Perbuatan tidak patut", "Gratifikasi", "Pelanggaran kode etik"];

export function KelolaPertanyaan({ baku, bank }: { baku: ButirBaku[]; bank: ButirBank[] }) {
  return (
    <Tabs defaultValue="baku">
      <TabsList className="mb-4 grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
        <TabsTrigger value="baku"><ListOrdered className="size-4" /> Pertanyaan baku BAP</TabsTrigger>
        <TabsTrigger value="bank"><BookOpen className="size-4" /> Bank pertanyaan</TabsTrigger>
      </TabsList>
      <TabsContent value="baku"><DaftarBaku baku={baku} /></TabsContent>
      <TabsContent value="bank"><DaftarBank bank={bank} /></TabsContent>
    </Tabs>
  );
}

// ------------------------------------------------------------------ baku

function DaftarBaku({ baku }: { baku: ButirBaku[] }) {
  const { jalankan, sibuk } = useAksi();
  const [form, setForm] = useState<{ buka: boolean; butir: ButirBaku | null; bagian: string }>({ buka: false, butir: null, bagian: "substansi" });
  let nomor = 0;
  return (
    <div className="space-y-5">
      {BAGIAN.map((b) => {
        const isi = baku.filter((x) => x.bagian === b.kode);
        return (
          <Panel key={b.kode} judul={`${b.judul} (${isi.filter((x) => x.aktif).length} aktif)`} deskripsi={b.ket}
            aksi={<Button variant="outline" onClick={() => setForm({ buka: true, butir: null, bagian: b.kode })}><Plus /> Tambah</Button>}>
            {isi.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada pertanyaan di bagian ini.</p>
            ) : (
              <ol className="space-y-2">
                {isi.map((x, i) => {
                  if (x.aktif) nomor += 1;
                  return (
                    <li key={x.id} className={cn("rounded-lg border p-3", !x.aktif && "bg-muted/40 text-muted-foreground")}>
                      <div className="flex gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">{x.aktif ? nomor : "–"}</span>
                        <p className="min-w-0 flex-1 leading-relaxed">{x.pertanyaan} {!x.aktif && <Lencana>Nonaktif</Lencana>}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label="Naikkan" disabled={sibuk || i === 0} onClick={() => jalankan(() => geserBaku(x.id, "naik"))}><ArrowUp /></Button>
                        <Button variant="ghost" size="icon" aria-label="Turunkan" disabled={sibuk || i === isi.length - 1} onClick={() => jalankan(() => geserBaku(x.id, "turun"))}><ArrowDown /></Button>
                        <Button variant="ghost" size="sm" disabled={sibuk} onClick={() => jalankan(() => aktifkanBaku(x.id, !x.aktif))}>
                          {x.aktif ? <><EyeOff /> Nonaktifkan</> : <><Eye /> Aktifkan</>}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setForm({ buka: true, butir: x, bagian: x.bagian })}><Pencil /> Ubah</Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        );
      })}
      <FormBaku key={`${form.butir?.id ?? form.bagian}-${form.buka}`} {...form} onTutup={() => setForm({ ...form, buka: false, butir: null })} />
    </div>
  );
}

function FormBaku({ buka, butir, bagian, onTutup }: { buka: boolean; butir: ButirBaku | null; bagian: string; onTutup: () => void }) {
  const [teks, setTeks] = useState(butir?.pertanyaan ?? "");
  const [bag, setBag] = useState<string>(butir?.bagian ?? bagian);
  const [aktif, setAktif] = useState(butir?.aktif ?? true);
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open={buka} onOpenChange={(b) => !b && onTutup()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{butir ? "Ubah pertanyaan baku" : "Tambah pertanyaan baku"}</DialogTitle>
          <DialogDescription>Gunakan sapaan &quot;Saudara&quot; seperti pada BAP resmi.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); jalankan(() => (butir ? ubahBaku(butir.id, { pertanyaan: teks, bagian: bag, aktif }) : tambahBaku(bag, teks)), { lalu: onTutup }); }}>
          <div className="space-y-1.5">
            <Label htmlFor="b-bag">Bagian</Label>
            <Select value={bag} onValueChange={setBag}>
              <SelectTrigger id="b-bag" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{BAGIAN.map((b) => <SelectItem key={b.kode} value={b.kode}>{b.judul}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-teks">Pertanyaan</Label>
            <Textarea id="b-teks" rows={4} required value={teks} onChange={(e) => setTeks(e.target.value)} />
          </div>
          {butir && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <Switch checked={aktif} onCheckedChange={setAktif} /> Aktif (muncul di sesi pemeriksaan baru)
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onTutup}>Batal</Button>
            <Button type="submit" disabled={sibuk || teks.trim().length < 5}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ bank

type DataSet = { nama: string; jenis: string | null; butir: ButirBank[]; aktif: boolean };

function DaftarBank({ bank }: { bank: ButirBank[] }) {
  const sets = useMemo(() => {
    const m = new Map<string, DataSet>();
    for (const b of bank) {
      const s = m.get(b.nama_set) ?? { nama: b.nama_set, jenis: b.jenis_pelanggaran, butir: [], aktif: false };
      s.butir.push(b);
      s.aktif = s.aktif || b.aktif;
      m.set(b.nama_set, s);
    }
    return [...m.values()];
  }, [bank]);
  const [setBaru, setSetBaru] = useState(false);
  const [ubah, setUbah] = useState<DataSet | null>(null);
  const daftarJenis = [...new Set([...SARAN_JENIS, ...sets.map((s) => s.jenis).filter(Boolean) as string[]])];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Set pertanyaan substansi per jenis pelanggaran. Di mode sidang, notulis dapat menyisipkan pertanyaan dari set yang aktif.</p>
        <Button onClick={() => setSetBaru(true)} className="shrink-0"><Plus /> Set baru</Button>
      </div>
      <datalist id="saran-jenis">{daftarJenis.map((j) => <option key={j} value={j} />)}</datalist>
      {sets.length === 0 ? (
        <Kosong ikon={BookOpen} judul="Bank pertanyaan masih kosong" deskripsi="Buat set pertama, misalnya untuk kasus ketidakhadiran, agar pemeriksa tidak mengetik ulang pertanyaan yang sama." />
      ) : (
        sets.map((s) => <KartuSet key={s.nama} s={s} onUbah={() => setUbah(s)} />)
      )}
      <FormSetBaru key={`baru-${setBaru}`} buka={setBaru} onTutup={() => setSetBaru(false)} />
      <FormUbahSet key={`ubah-${ubah?.nama ?? ""}`} s={ubah} onTutup={() => setUbah(null)} />
    </div>
  );
}

function KartuSet({ s, onUbah }: { s: DataSet; onUbah: () => void }) {
  const { jalankan, sibuk } = useAksi();
  const [baru, setBaru] = useState("");
  const [edit, setEdit] = useState<ButirBank | null>(null);
  return (
    <Panel
      className={cn(!s.aktif && "opacity-80")}
      judul={<span className="flex flex-wrap items-center gap-2">{s.nama} {!s.aktif && <Lencana>Set nonaktif</Lencana>}</span>}
      deskripsi={`${s.jenis ? `Jenis pelanggaran: ${s.jenis} · ` : ""}${s.butir.length} pertanyaan`}
      aksi={<Button variant="outline" size="sm" onClick={onUbah}><Pencil /> Ubah set</Button>}
    >
      <ol className="space-y-2">
        {s.butir.map((b, i) => (
          <li key={b.id} className={cn("rounded-lg border p-3", !b.aktif && "bg-muted/40 text-muted-foreground")}>
            <div className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">{i + 1}</span>
              <p className="min-w-0 flex-1 leading-relaxed">{b.pertanyaan} {!b.aktif && <Lencana>Nonaktif</Lencana>}</p>
            </div>
            <div className="mt-2 flex flex-wrap justify-end gap-1">
              <Button variant="ghost" size="icon" aria-label="Naikkan" disabled={sibuk || i === 0} onClick={() => jalankan(() => geserButir(b.id, "naik"))}><ArrowUp /></Button>
              <Button variant="ghost" size="icon" aria-label="Turunkan" disabled={sibuk || i === s.butir.length - 1} onClick={() => jalankan(() => geserButir(b.id, "turun"))}><ArrowDown /></Button>
              <Button variant="outline" size="sm" onClick={() => setEdit(b)}><Pencil /> Ubah</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-lewat" disabled={s.butir.length <= 1}><Trash2 /> Hapus</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus pertanyaan ini dari set?</AlertDialogTitle>
                    <AlertDialogDescription>BAP yang sudah memakai pertanyaan ini tidak terpengaruh. Penghapusan tercatat di log audit.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => jalankan(() => hapusButir(b.id))}>Hapus</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </li>
        ))}
      </ol>
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); jalankan(() => tambahButir(s.nama, baru), { lalu: () => setBaru("") }); }}>
        <Input value={baru} onChange={(e) => setBaru(e.target.value)} placeholder="Tulis pertanyaan baru untuk set ini…" aria-label={`Pertanyaan baru untuk ${s.nama}`} />
        <Button type="submit" variant="secondary" disabled={sibuk || baru.trim().length < 5} className="shrink-0"><Plus /> Tambahkan</Button>
      </form>
      <FormButir key={edit?.id ?? "tutup"} butir={edit} onTutup={() => setEdit(null)} />
    </Panel>
  );
}

function FormButir({ butir, onTutup }: { butir: ButirBank | null; onTutup: () => void }) {
  const [teks, setTeks] = useState(butir?.pertanyaan ?? "");
  const [aktif, setAktif] = useState(butir?.aktif ?? true);
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open={!!butir} onOpenChange={(b) => !b && onTutup()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ubah pertanyaan</DialogTitle>
          <DialogDescription>Set: {butir?.nama_set}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (butir) jalankan(() => ubahButir(butir.id, teks, aktif), { lalu: onTutup }); }}>
          <Textarea rows={4} value={teks} onChange={(e) => setTeks(e.target.value)} aria-label="Pertanyaan" />
          <label className="flex min-h-11 cursor-pointer items-center gap-3"><Switch checked={aktif} onCheckedChange={setAktif} /> Aktif</label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onTutup}>Batal</Button>
            <Button type="submit" disabled={sibuk || teks.trim().length < 5}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormSetBaru({ buka, onTutup }: { buka: boolean; onTutup: () => void }) {
  const [nama, setNama] = useState("");
  const [jenis, setJenis] = useState("");
  const [daftar, setDaftar] = useState("");
  const { jalankan, sibuk } = useAksi();
  const jumlah = daftar.split(/\r?\n/).filter((x) => x.trim().length >= 5).length;
  return (
    <Dialog open={buka} onOpenChange={(b) => !b && onTutup()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Set pertanyaan baru</DialogTitle>
          <DialogDescription>Tulis satu pertanyaan per baris. Nomor di awal baris akan dibuang otomatis.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); jalankan(() => buatSet(nama, jenis, daftar), { lalu: onTutup }); }}>
          <div className="space-y-1.5">
            <Label htmlFor="s-nama">Nama set</Label>
            <Input id="s-nama" required value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Ketidakhadiran — pendalaman" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-jenis">Jenis pelanggaran (boleh kosong)</Label>
            <Input id="s-jenis" list="saran-jenis" value={jenis} onChange={(e) => setJenis(e.target.value)} placeholder="Pilih atau ketik" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-daftar">Daftar pertanyaan</Label>
            <Textarea id="s-daftar" rows={8} value={daftar} onChange={(e) => setDaftar(e.target.value)}
              placeholder={"Pada tanggal berapa saja Saudara tidak masuk kerja?\nApakah Saudara telah memberitahukan atasan?\nApakah ada surat keterangan yang dapat Saudara tunjukkan?"} />
            <p className="text-sm text-muted-foreground">{jumlah} pertanyaan</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onTutup}>Batal</Button>
            <Button type="submit" disabled={sibuk || !jumlah}>{sibuk && <Loader2 className="animate-spin" />} Buat set</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormUbahSet({ s, onTutup }: { s: DataSet | null; onTutup: () => void }) {
  const [nama, setNama] = useState(s?.nama ?? "");
  const [jenis, setJenis] = useState(s?.jenis ?? "");
  const [aktif, setAktif] = useState(s?.aktif ?? true);
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open={!!s} onOpenChange={(b) => !b && onTutup()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ubah set pertanyaan</DialogTitle>
          <DialogDescription>Menonaktifkan set menyembunyikannya dari mode sidang tanpa menghapus isinya.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (s) jalankan(() => ubahSet(s.nama, nama, jenis, aktif), { lalu: onTutup }); }}>
          <div className="space-y-1.5">
            <Label htmlFor="u-nama">Nama set</Label>
            <Input id="u-nama" required value={nama} onChange={(e) => setNama(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-jenis">Jenis pelanggaran</Label>
            <Input id="u-jenis" list="saran-jenis" value={jenis} onChange={(e) => setJenis(e.target.value)} />
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3"><Switch checked={aktif} onCheckedChange={setAktif} /> Set aktif (semua pertanyaannya ikut aktif/nonaktif)</label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onTutup}>Batal</Button>
            <Button type="submit" disabled={sibuk}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
