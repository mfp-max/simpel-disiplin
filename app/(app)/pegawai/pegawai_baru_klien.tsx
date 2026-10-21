"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAksi } from "@/components/simpel/interaktif";
import { FIELD_PEGAWAI } from "@/lib/simpega/normalisasi";
import { tambahPegawai } from "./_aksi";

export const ALASAN_KELUAR = ["Pensiun", "Meninggal dunia", "Berhenti / mengundurkan diri", "Diberhentikan", "Pindah instansi", "Lainnya"];

const kelasSelect =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const UTAMA = ["nama_lengkap_gelar", "nip", "status_pegawai", "golongan_pangkat", "jabatan_fungsional", "jabatan_tambahan", "unit_kerja", "direktorat_fakultas", "pejabat_penilai_nip"];
const CONTOH: Record<string, string> = {
  nama_lengkap_gelar: "mis. Drs. Sutrisno, M.Pd.",
  nip: "18 digit, boleh dikosongkan bila tidak ada",
  golongan_pangkat: "mis. Penata, III/c",
  jabatan_fungsional: "mis. Lektor / Pengadministrasi Umum",
  unit_kerja: "unit kerja terakhir",
};
const field = (k: string) => FIELD_PEGAWAI.find((f) => f.kode === k)!;

/** Formulir tambah pegawai manual (di luar impor Simpega), termasuk pegawai yang sudah pensiun. */
export function DialogTambahPegawai({ statusOpsi }: { statusOpsi: string[] }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [isi, setIsi] = useState<Record<string, string>>({});
  const [aktif, setAktif] = useState(true);
  const [keluar, setKeluar] = useState({ tanggal: "", alasan: "Pensiun" });
  const { jalankan, sibuk } = useAksi();
  const lain = FIELD_PEGAWAI.filter((f) => !UTAMA.includes(f.kode) && f.kode !== "tanggal_keluar");

  const kolom = (kode: string) => {
    const f = field(kode);
    return (
      <div key={f.kode} className="space-y-1.5">
        <Label htmlFor={`tp-${f.kode}`}>
          {f.label} {f.kode === "nama_lengkap_gelar" && <span className="text-lewat" aria-label="wajib">*</span>}
        </Label>
        {f.jenis === "jk" ? (
          <select id={`tp-${f.kode}`} className={kelasSelect} value={isi[f.kode] ?? ""} onChange={(e) => setIsi({ ...isi, [f.kode]: e.target.value })}>
            <option value="">—</option>
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </select>
        ) : (
          <Input
            id={`tp-${f.kode}`}
            type={f.jenis === "tanggal" ? "date" : f.jenis === "email" ? "email" : "text"}
            inputMode={f.jenis === "nip" ? "numeric" : undefined}
            list={f.kode === "status_pegawai" ? "daftar-status-pegawai" : undefined}
            placeholder={CONTOH[f.kode]}
            value={isi[f.kode] ?? ""}
            onChange={(e) => setIsi({ ...isi, [f.kode]: e.target.value })}
            required={f.kode === "nama_lengkap_gelar"}
            data-pii={["nip", "nip_lama", "nama_lengkap_gelar", "nama_tanpa_gelar"].includes(f.kode) ? "" : undefined}
          />
        )}
      </div>
    );
  };

  return (
    <Dialog open={buka} onOpenChange={(b) => { setBuka(b); if (b) { setIsi({}); setAktif(true); setKeluar({ tanggal: "", alasan: "Pensiun" }); } }}>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline"><UserPlus /> Tambah manual</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tambah pegawai manual</DialogTitle>
          <DialogDescription>
            Untuk pegawai yang tidak ada di rekap Simpega, misalnya yang sudah pensiun sebelum SIMPEL dipakai. Isi data <strong>terakhir</strong> yang diketahui;
            jabatan saat kasus lama terjadi dicatat terpisah di Arsip Lampau. Bila kelak pegawai ini muncul di impor Simpega (NIP sama), datanya diperbarui otomatis.
          </DialogDescription>
        </DialogHeader>
        <form
          id="form-tambah-pegawai"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            jalankan(
              () => tambahPegawai(
                Object.fromEntries(Object.entries(isi).map(([k, v]) => [k, v.trim() || null])),
                { aktif, tanggalKeluar: aktif ? null : keluar.tanggal || null, alasanKeluar: aktif ? null : keluar.alasan },
              ),
              { lalu: (id) => { setBuka(false); router.push(`/pegawai/${id}`); }, segarkan: false },
            );
          }}
        >
          <datalist id="daftar-status-pegawai">{statusOpsi.map((s) => <option key={s} value={s} />)}</datalist>
          <div className="grid gap-4 sm:grid-cols-2">{UTAMA.map(kolom)}</div>

          <fieldset className="space-y-3 rounded-lg border p-3 sm:p-4">
            <legend className="px-1 font-medium">Status keaktifan</legend>
            <div className="flex items-center gap-3">
              <Switch id="tp-aktif" checked={aktif} onCheckedChange={setAktif} />
              <Label htmlFor="tp-aktif" className="font-normal">{aktif ? "Masih aktif bekerja" : "Sudah tidak aktif"}</Label>
            </div>
            {!aktif && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tp-alasan">Alasan</Label>
                  <select id="tp-alasan" className={kelasSelect} value={keluar.alasan} onChange={(e) => setKeluar({ ...keluar, alasan: e.target.value })}>
                    {ALASAN_KELUAR.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tp-keluar">Tanggal keluar / pensiun (bila diketahui)</Label>
                  <Input id="tp-keluar" type="date" value={keluar.tanggal} onChange={(e) => setKeluar({ ...keluar, tanggal: e.target.value })} />
                </div>
              </div>
            )}
          </fieldset>

          <details className="rounded-lg border p-3 sm:p-4">
            <summary className="cursor-pointer font-medium">Data lainnya (opsional)</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">{lain.map((f) => kolom(f.kode))}</div>
          </details>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBuka(false)}>Batal</Button>
          <Button type="submit" form="form-tambah-pegawai" disabled={sibuk || !isi.nama_lengkap_gelar?.trim()}>
            {sibuk ? <Loader2 className="animate-spin" /> : <Save />} Simpan pegawai
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
