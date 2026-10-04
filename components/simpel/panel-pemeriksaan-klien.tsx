"use client";

import { useState } from "react";
import { CalendarPlus, Loader2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { jadwalkanSesi, tandaiTidakHadirSesi } from "@/app/(app)/kasus/[id]/sidang/_aksi";
import { useAksi } from "./interaktif";

const pilihCss = "h-11 w-full rounded-md border border-input bg-background px-3 text-base";

export function FormJadwalSesi({ entriId, moda, pengguna, notulisBawaan }: {
  entriId: string; moda: { kode: string; label: string }[]; pengguna: { id: string; nama: string }[]; notulisBawaan: string | null;
}) {
  const [buka, setBuka] = useState(false);
  const [tanggal, setTanggal] = useState("");
  const [jam, setJam] = useState("09:00");
  const [tempat, setTempat] = useState("");
  const [m, setM] = useState(moda[0]?.kode ?? "tatap_muka");
  const [notulis, setNotulis] = useState(notulisBawaan ?? "");
  const { jalankan, sibuk } = useAksi();

  return (
    <Dialog open={buka} onOpenChange={setBuka}>
      <DialogTrigger asChild>
        <Button><CalendarPlus aria-hidden /> Jadwalkan sesi</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Jadwalkan sesi pemeriksaan</DialogTitle>
          <DialogDescription>Nomor sesi (I, II, dan seterusnya) diberikan otomatis.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            jalankan(() => jadwalkanSesi(entriId, { tanggal, jam: jam || null, tempat: tempat || null, moda: m, notulisId: notulis || null }), {
              lalu: () => { setBuka(false); setTanggal(""); setTempat(""); },
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sesi-tanggal">Tanggal</Label>
              <Input id="sesi-tanggal" type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sesi-jam">Jam</Label>
              <Input id="sesi-jam" type="time" value={jam} onChange={(e) => setJam(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sesi-tempat">Tempat</Label>
            <Input id="sesi-tempat" value={tempat} onChange={(e) => setTempat(e.target.value)} placeholder="Mis. Ruang Rapat Gedung A3 lantai 2" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sesi-moda">Moda</Label>
              <select id="sesi-moda" className={pilihCss} value={m} onChange={(e) => setM(e.target.value)}>
                {moda.map((x) => <option key={x.kode} value={x.kode}>{x.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sesi-notulis">Notulis</Label>
              <select id="sesi-notulis" className={pilihCss} value={notulis} onChange={(e) => setNotulis(e.target.value)}>
                <option value="">Belum ditentukan</option>
                {pengguna.map((u) => <option key={u.id} value={u.id}>{u.nama}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBuka(false)}>Batal</Button>
            <Button type="submit" disabled={sibuk || !tanggal}>{sibuk && <Loader2 className="animate-spin" aria-hidden />} Jadwalkan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TombolTidakHadir({ sesiId }: { sesiId: string }) {
  const { jalankan, sibuk } = useAksi();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={sibuk}><UserX aria-hidden /> Tandai tidak hadir</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Terperiksa tidak hadir?</AlertDialogTitle>
          <AlertDialogDescription>
            Sesi ini akan ditutup dengan catatan terperiksa tidak hadir. Setelah itu siapkan Berita Acara Ketidakhadiran
            atau jadwalkan pemanggilan berikutnya.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={() => jalankan(() => tandaiTidakHadirSesi(sesiId))}>Tandai tidak hadir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
