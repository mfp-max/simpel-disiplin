"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ClipboardPaste, List, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Kosong, Panel } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { useAksi } from "@/components/simpel/interaktif";
import { namaBulan, namaHari, tanggalPanjang } from "@/lib/format";
import { cn } from "@/lib/utils";
import { hapusLibur, simpanLibur, tempelLibur, type IsianLibur } from "./_aksi";

export type BarisLibur = { id: string; tanggal: string; nama: string; jenis: "libur_nasional" | "cuti_bersama"; keterangan: string | null };

const LABEL_JENIS = { libur_nasional: "Libur nasional", cuti_bersama: "Cuti bersama" } as const;
const HARI_SINGKAT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function LencanaJenis({ jenis }: { jenis: BarisLibur["jenis"] }) {
  return <Lencana warna={jenis === "libur_nasional" ? "lewat" : "waspada"}>{LABEL_JENIS[jenis]}</Lencana>;
}

export function KalenderLibur({ tahun, libur }: { tahun: number; libur: BarisLibur[] }) {
  const [form, setForm] = useState<{ buka: boolean; baris: BarisLibur | null; tanggal?: string }>({ buka: false, baris: null });
  const [tempel, setTempel] = useState(false);
  const peta = useMemo(() => new Map(libur.map((l) => [l.tanggal, l])), [libur]);
  const nNasional = libur.filter((l) => l.jenis === "libur_nasional").length;

  return (
    <Panel
      judul={`Tahun ${tahun}`}
      deskripsi={`${libur.length} tanggal · ${nNasional} libur nasional · ${libur.length - nNasional} cuti bersama`}
      aksi={
        <>
          <Button variant="outline" onClick={() => setTempel(true)}><ClipboardPaste /> Tempel banyak</Button>
          <Button onClick={() => setForm({ buka: true, baris: null, tanggal: `${tahun}-01-01` })}><Plus /> Tambah</Button>
        </>
      }
    >
      <Tabs defaultValue="daftar">
        <TabsList className="mb-4">
          <TabsTrigger value="daftar"><List className="size-4" /> Daftar</TabsTrigger>
          <TabsTrigger value="kalender"><CalendarDays className="size-4" /> Kalender</TabsTrigger>
        </TabsList>

        <TabsContent value="daftar">
          {libur.length === 0 ? (
            <Kosong ikon={CalendarDays} judul={`Belum ada hari libur tahun ${tahun}`} deskripsi="Tambahkan satu per satu atau tempel daftar dari SKB 3 Menteri sekaligus." />
          ) : (
            <>
              <ul className="space-y-2 md:hidden">
                {libur.map((l) => (
                  <li key={l.id} className="rounded-lg border p-3">
                    <p className="font-semibold">{namaHari(l.tanggal)}, {tanggalPanjang(l.tanggal)}</p>
                    <p>{l.nama}</p>
                    <div className="mt-1"><LencanaJenis jenis={l.jenis} /></div>
                    {l.keterangan && <p className="mt-1 text-sm text-muted-foreground">{l.keterangan}</p>}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => setForm({ buka: true, baris: l })}><Pencil /> Ubah</Button>
                      <TombolHapus l={l} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-lg border md:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Tanggal</th>
                      <th className="px-3 py-2.5 font-semibold">Hari</th>
                      <th className="px-3 py-2.5 font-semibold">Nama</th>
                      <th className="px-3 py-2.5 font-semibold">Jenis</th>
                      <th className="px-3 py-2.5 font-semibold">Keterangan</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {libur.map((l) => {
                      const akhirPekan = ["Sabtu", "Minggu"].includes(namaHari(l.tanggal));
                      return (
                        <tr key={l.id} className="border-t align-top">
                          <td className="whitespace-nowrap px-3 py-3 font-medium">{tanggalPanjang(l.tanggal)}</td>
                          <td className={cn("px-3 py-3", akhirPekan && "text-muted-foreground")}>{namaHari(l.tanggal)}{akhirPekan && " (akhir pekan)"}</td>
                          <td className="px-3 py-3">{l.nama}</td>
                          <td className="px-3 py-3"><LencanaJenis jenis={l.jenis} /></td>
                          <td className="max-w-72 px-3 py-3 text-muted-foreground">{l.keterangan ?? "—"}</td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => setForm({ buka: true, baris: l })}><Pencil /> Ubah</Button>
                              <TombolHapus l={l} kecil />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="kalender">
          <div className="mb-3 flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-2"><span className="size-4 rounded bg-lewat-muda ring-1 ring-lewat/40" /> Libur nasional</span>
            <span className="inline-flex items-center gap-2"><span className="size-4 rounded bg-waspada-muda ring-1 ring-waspada/40" /> Cuti bersama</span>
            <span className="inline-flex items-center gap-2"><span className="size-4 rounded bg-muted" /> Akhir pekan</span>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">Ketuk tanggal untuk menambah atau mengubah hari libur.</p>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 12 }, (_, i) => (
              <Bulan key={i} tahun={tahun} bulan={i + 1} peta={peta}
                onPilih={(t) => { const l = peta.get(t); setForm(l ? { buka: true, baris: l } : { buka: true, baris: null, tanggal: t }); }} />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <FormLibur key={`${form.baris?.id ?? form.tanggal ?? ""}-${form.buka}`} buka={form.buka} baris={form.baris} tanggalAwal={form.tanggal}
        onTutup={() => setForm({ buka: false, baris: null })} />
      <DialogTempel buka={tempel} onTutup={() => setTempel(false)} tahun={tahun} />
    </Panel>
  );
}

function Bulan({ tahun, bulan, peta, onPilih }: { tahun: number; bulan: number; peta: Map<string, BarisLibur>; onPilih: (t: string) => void }) {
  const jumlahHari = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
  const awal = (new Date(Date.UTC(tahun, bulan - 1, 1)).getUTCDay() + 6) % 7; // Senin = 0
  const sel: (number | null)[] = [...Array(awal).fill(null), ...Array.from({ length: jumlahHari }, (_, i) => i + 1)];
  const n = [...peta.keys()].filter((t) => t.startsWith(`${tahun}-${String(bulan).padStart(2, "0")}`)).length;
  return (
    <section className="rounded-lg border p-3">
      <h3 className="mb-2 flex items-center justify-between font-semibold">
        {namaBulan(bulan)} <span className="text-xs font-normal text-muted-foreground">{n ? `${n} libur` : ""}</span>
      </h3>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`${namaBulan(bulan)} ${tahun}`}>
        {HARI_SINGKAT.map((h) => <div key={h} className="pb-1 text-xs font-medium text-muted-foreground">{h}</div>)}
        {sel.map((d, i) => {
          if (!d) return <div key={`k${i}`} />;
          const t = `${tahun}-${String(bulan).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const l = peta.get(t);
          const akhirPekan = i % 7 >= 5;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onPilih(t)}
              title={l ? `${l.nama} (${LABEL_JENIS[l.jenis]})` : undefined}
              aria-label={`${d} ${namaBulan(bulan)}${l ? `: ${l.nama}` : ""}`}
              className={cn(
                "flex aspect-square min-h-9 items-center justify-center rounded-md text-sm transition-colors hover:ring-2 hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                l?.jenis === "libur_nasional" && "bg-lewat-muda font-semibold text-lewat ring-1 ring-lewat/40",
                l?.jenis === "cuti_bersama" && "bg-waspada-muda font-semibold text-waspada ring-1 ring-waspada/40",
                !l && akhirPekan && "bg-muted text-muted-foreground",
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TombolHapus({ l, kecil }: { l: BarisLibur; kecil?: boolean }) {
  const { jalankan, sibuk } = useAksi();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size={kecil ? "sm" : "default"} className="text-lewat"><Trash2 /> Hapus</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus {l.nama}?</AlertDialogTitle>
          <AlertDialogDescription>
            {tanggalPanjang(l.tanggal)} akan dihitung sebagai hari kerja biasa. Penghapusan tercatat di log audit.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction disabled={sibuk} onClick={() => jalankan(() => hapusLibur(l.id))} className="bg-destructive text-white hover:bg-destructive/90">Hapus</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FormLibur({ buka, baris, tanggalAwal, onTutup }: { buka: boolean; baris: BarisLibur | null; tanggalAwal?: string; onTutup: () => void }) {
  const [d, setD] = useState<IsianLibur>({
    tanggal: baris?.tanggal ?? tanggalAwal ?? "", nama: baris?.nama ?? "", jenis: baris?.jenis ?? "libur_nasional", keterangan: baris?.keterangan ?? "",
  });
  const { jalankan, sibuk } = useAksi();
  return (
    <Dialog open={buka} onOpenChange={(b) => !b && onTutup()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{baris ? "Ubah hari libur" : "Tambah hari libur"}</DialogTitle>
          <DialogDescription>{d.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(d.tanggal) ? `${namaHari(d.tanggal)}, ${tanggalPanjang(d.tanggal)}` : "Pilih tanggal"}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); jalankan(() => simpanLibur(baris?.id ?? null, d), { lalu: onTutup }); }}>
          <div className="space-y-1.5">
            <Label htmlFor="l-tgl">Tanggal</Label>
            <Input id="l-tgl" type="date" required value={d.tanggal} onChange={(e) => setD({ ...d, tanggal: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-nama">Nama</Label>
            <Input id="l-nama" required value={d.nama} onChange={(e) => setD({ ...d, nama: e.target.value })} placeholder="mis. Idul Fitri 1448 H" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-jenis">Jenis</Label>
            <Select value={d.jenis} onValueChange={(v) => setD({ ...d, jenis: v })}>
              <SelectTrigger id="l-jenis" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="libur_nasional">Libur nasional</SelectItem>
                <SelectItem value="cuti_bersama">Cuti bersama</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-ket">Keterangan (boleh kosong)</Label>
            <Textarea id="l-ket" rows={2} value={d.keterangan} onChange={(e) => setD({ ...d, keterangan: e.target.value })} placeholder="mis. SKB 3 Menteri Nomor … Tahun …" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onTutup}>Batal</Button>
            <Button type="submit" disabled={sibuk}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type BarisTempel = { nomor: number; teks: string; data?: IsianLibur; galat?: string };

function normalTanggal(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function sahTanggal(t: string) {
  const [y, m, d] = t.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
}

function normalJenis(s: string | undefined): string | null {
  const t = (s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!t || t === "libur_nasional" || t === "nasional" || t === "libur") return "libur_nasional";
  if (t === "cuti_bersama" || t === "cuti") return "cuti_bersama";
  return null;
}

function urai(teks: string): BarisTempel[] {
  return teks.split(/\r?\n/).map((l, i) => ({ l: l.trim(), i })).filter((x) => x.l && !x.l.startsWith("#")).map(({ l, i }) => {
    const bagian = l.split(/\s*[;\t|]\s*/);
    const tanggal = normalTanggal(bagian[0] ?? "");
    if (!tanggal || !sahTanggal(tanggal)) return { nomor: i + 1, teks: l, galat: "Tanggal tidak dikenali (pakai 2027-01-01 atau 01-01-2027)" };
    const nama = (bagian[1] ?? "").trim();
    if (nama.length < 3) return { nomor: i + 1, teks: l, galat: "Nama hari libur kosong" };
    const jenis = normalJenis(bagian[2]);
    if (!jenis) return { nomor: i + 1, teks: l, galat: "Jenis harus libur_nasional atau cuti_bersama" };
    return { nomor: i + 1, teks: l, data: { tanggal, nama, jenis, keterangan: (bagian.slice(3).join("; ") ?? "").trim() } };
  });
}

function DialogTempel({ buka, onTutup, tahun }: { buka: boolean; onTutup: () => void; tahun: number }) {
  const [teks, setTeks] = useState("");
  const [timpa, setTimpa] = useState(false);
  const { jalankan, sibuk } = useAksi();
  const hasil = useMemo(() => urai(teks), [teks]);
  const sah = hasil.filter((h) => h.data);
  const galat = hasil.filter((h) => h.galat);

  function simpan() {
    jalankan(() => tempelLibur(sah.map((h) => h.data!), timpa), {
      sukses: "",
      lalu: (r) => {
        toast.success(`${r.baru} tanggal baru disimpan${r.diperbarui ? `, ${r.diperbarui} diperbarui` : ""}${r.dilewati ? `, ${r.dilewati} dilewati karena sudah ada` : ""}.`);
        setTeks("");
        onTutup();
      },
    });
  }

  return (
    <Dialog open={buka} onOpenChange={(b) => !b && onTutup()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tempel banyak hari libur</DialogTitle>
          <DialogDescription>
            Satu tanggal per baris: <code className="rounded bg-muted px-1">tanggal; nama; jenis; keterangan</code>. Jenis: <code className="rounded bg-muted px-1">libur_nasional</code> atau <code className="rounded bg-muted px-1">cuti_bersama</code> (boleh dikosongkan = libur nasional).
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={8}
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          className="font-mono text-sm"
          placeholder={`${tahun + 1}-01-01; Tahun Baru ${tahun + 1} Masehi; libur_nasional\n${tahun + 1}-03-10; Cuti bersama Idul Fitri; cuti_bersama; SKB 3 Menteri`}
          aria-label="Daftar hari libur"
        />
        {hasil.length > 0 && (
          <div className="space-y-2 text-sm">
            <p><strong>{sah.length}</strong> baris siap disimpan{galat.length ? <>, <strong className="text-lewat">{galat.length}</strong> baris bermasalah (tidak disimpan)</> : ""}.</p>
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {hasil.map((h) => (
                <li key={h.nomor} className={cn("rounded px-2 py-1", h.galat ? "bg-lewat-muda" : "")}>
                  {h.data ? (
                    <span>{namaHari(h.data.tanggal)}, {tanggalPanjang(h.data.tanggal)} — {h.data.nama} <span className="text-muted-foreground">({LABEL_JENIS[h.data.jenis as BarisLibur["jenis"]]})</span></span>
                  ) : (
                    <span>Baris {h.nomor}: <span className="font-mono">{h.teks}</span> — <strong>{h.galat}</strong></span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <Checkbox checked={timpa} onCheckedChange={(v) => setTimpa(!!v)} />
          Timpa nama/jenis bila tanggalnya sudah tercatat (bawaan: dilewati)
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onTutup}>Batal</Button>
          <Button onClick={simpan} disabled={sibuk || !sah.length}>{sibuk && <Loader2 className="animate-spin" />} Simpan {sah.length || ""} tanggal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
