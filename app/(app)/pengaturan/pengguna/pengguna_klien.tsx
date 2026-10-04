"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, Loader2, Pencil, Plus, RefreshCw, ShieldAlert, UserCheck, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Catatan, Kosong, Panel } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { DialogAlasan, useAksi } from "@/components/simpel/interaktif";
import { waktuPendek } from "@/lib/format";
import type { Hasil } from "@/lib/galat";
import { aturAktif, perbaikiSinkronisasi, periksaSinkronisasi, tambahPengguna, ubahPengguna, type HasilSinkron, type IsianPengguna } from "./_aksi";

export type BarisPengguna = {
  id: string; email: string; nama: string; jabatan: string | null; peran_kode: string; peran_nama: string; kelola_pengaturan: boolean;
  aktif: boolean; terakhir_masuk: string | null; tertaut: boolean;
};
type Peran = { kode: string; nama: string; keterangan: string | null };

function tampilkanHasil(h: Hasil<HasilSinkron>) {
  if (h.ok && h.data?.peringatan) toast.warning(h.data.peringatan, { duration: 12000 });
  if (h.ok && h.data?.catatan) toast.info(h.data.catatan);
}

export function DaftarPengguna({ pengguna, peran, saya }: { pengguna: BarisPengguna[]; peran: Peran[]; saya: string }) {
  const [form, setForm] = useState<{ buka: boolean; baris: BarisPengguna | null }>({ buka: false, baris: null });
  const jumlahAktif = pengguna.filter((u) => u.aktif).length;

  return (
    <div className="space-y-6">
      <Catatan jenis="info" judul="Cara pengguna masuk">
        <ul className="list-disc space-y-1 pl-5">
          <li>Setelah ditambahkan di sini, email pengguna otomatis dimasukkan ke <strong>daftar izin login</strong>. Email di luar daftar ini tidak bisa mendaftar maupun masuk.</li>
          <li>Pengguna masuk dengan <strong>Google</strong> (akun Google apa pun yang alamat email-nya sama persis dengan yang didaftarkan) atau dengan <strong>email + kata sandi</strong> yang dibuat saat pertama kali masuk.</li>
          <li><strong>Verifikasi dua langkah wajib</strong> untuk semua akun. Saat pertama kali masuk, pengguna akan dipandu memasang aplikasi autentikator atau kode cadangan.</li>
          <li>Menonaktifkan pengguna langsung menghentikan aksesnya: email dihapus dari daftar izin dan sesi yang sedang terbuka diakhiri. Data pengguna tidak dihapus, sehingga jejak auditnya tetap utuh.</li>
        </ul>
      </Catatan>

      <Panel
        judul={`Daftar pengguna (${jumlahAktif} aktif)`}
        aksi={<Button onClick={() => setForm({ buka: true, baris: null })}><Plus /> Tambah pengguna</Button>}
      >
        {pengguna.length === 0 ? (
          <Kosong ikon={Users} judul="Belum ada pengguna" />
        ) : (
          <>
            {/* Ponsel: kartu */}
            <ul className="space-y-3 md:hidden">
              {pengguna.map((u) => (
                <li key={u.id} className={`rounded-lg border p-3 ${u.aktif ? "" : "bg-muted/40 text-muted-foreground"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{u.nama} {u.id === saya && <Lencana warna="info">Anda</Lencana>}</p>
                      <p className="break-all text-sm">{u.email}</p>
                      {u.jabatan && <p className="text-sm text-muted-foreground">{u.jabatan}</p>}
                    </div>
                    <StatusAktif aktif={u.aktif} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    <Lencana>{u.peran_nama}</Lencana>
                    <StatusTaut u={u} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setForm({ buka: true, baris: u })}><Pencil /> Ubah</Button>
                    <TombolAktif u={u} saya={saya} />
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop: tabel */}
            <div className="hidden overflow-x-auto rounded-lg border md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Nama & email</th>
                    <th className="px-3 py-2.5 font-semibold">Jabatan</th>
                    <th className="px-3 py-2.5 font-semibold">Peran</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Login</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {pengguna.map((u) => (
                    <tr key={u.id} className={`border-t align-top ${u.aktif ? "" : "bg-muted/30 text-muted-foreground"}`}>
                      <td className="px-3 py-3">
                        <div className="font-medium">{u.nama} {u.id === saya && <Lencana warna="info">Anda</Lencana>}</div>
                        <div className="break-all">{u.email}</div>
                      </td>
                      <td className="px-3 py-3">{u.jabatan ?? "—"}</td>
                      <td className="px-3 py-3"><Lencana>{u.peran_nama}</Lencana></td>
                      <td className="px-3 py-3"><StatusAktif aktif={u.aktif} /></td>
                      <td className="px-3 py-3"><StatusTaut u={u} /></td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setForm({ buka: true, baris: u })}><Pencil /> Ubah</Button>
                          <TombolAktif u={u} saya={saya} kecil />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <PanelSinkron />

      <FormPengguna
        key={form.baris?.id ?? (form.buka ? "baru" : "tutup")}
        buka={form.buka}
        onTutup={() => setForm({ buka: false, baris: null })}
        baris={form.baris}
        peran={peran}
      />
    </div>
  );
}

function StatusAktif({ aktif }: { aktif: boolean }) {
  return aktif ? <Lencana warna="aman">Aktif</Lencana> : <Lencana warna="lewat">Nonaktif</Lencana>;
}

function StatusTaut({ u }: { u: BarisPengguna }) {
  if (!u.tertaut) return <span className="text-sm text-muted-foreground">Belum pernah masuk</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <KeyRound className="size-4 text-aman" aria-hidden />
      <span>Tertaut akun login{u.terakhir_masuk ? ` · ${waktuPendek(u.terakhir_masuk)}` : ""}</span>
    </span>
  );
}

function TombolAktif({ u, saya, kecil }: { u: BarisPengguna; saya: string; kecil?: boolean }) {
  const diriSendiri = u.id === saya;
  if (u.aktif) {
    return (
      <DialogAlasan
        pemicu={
          <Button variant="outline" size={kecil ? "sm" : "default"} disabled={diriSendiri} title={diriSendiri ? "Anda tidak dapat menonaktifkan akun sendiri" : undefined} className="text-lewat">
            <UserX /> Nonaktifkan
          </Button>
        }
        judul={`Nonaktifkan ${u.nama}?`}
        deskripsi="Akses langsung dihentikan: email dihapus dari daftar izin login dan sesi yang sedang terbuka diakhiri. Data dan riwayat audit pengguna tetap tersimpan, dan pengguna dapat diaktifkan kembali kapan saja."
        labelTombol="Nonaktifkan"
        variant="destructive"
        aksi={async (alasan) => { const h = await aturAktif(u.id, false, alasan); tampilkanHasil(h); return h; }}
      />
    );
  }
  return (
    <DialogAlasan
      pemicu={<Button variant="outline" size={kecil ? "sm" : "default"}><UserCheck /> Aktifkan</Button>}
      judul={`Aktifkan kembali ${u.nama}?`}
      deskripsi="Email akan dimasukkan lagi ke daftar izin login sehingga pengguna dapat masuk kembali."
      labelTombol="Aktifkan"
      aksi={async (alasan) => { const h = await aturAktif(u.id, true, alasan); tampilkanHasil(h); return h; }}
    />
  );
}

function FormPengguna({ buka, onTutup, baris, peran }: { buka: boolean; onTutup: () => void; baris: BarisPengguna | null; peran: Peran[] }) {
  const [d, setD] = useState<IsianPengguna>({
    email: baris?.email ?? "", nama: baris?.nama ?? "", jabatan: baris?.jabatan ?? "", peran_kode: baris?.peran_kode ?? "",
  });
  const { jalankan, sibuk } = useAksi();
  const ket = peran.find((x) => x.kode === d.peran_kode)?.keterangan;

  function simpan(e: React.FormEvent) {
    e.preventDefault();
    jalankan(() => (baris ? ubahPengguna(baris.id, d) : tambahPengguna(d)), {
      lalu: (data) => { tampilkanHasil({ ok: true, data }); onTutup(); },
    });
  }

  return (
    <Dialog open={buka} onOpenChange={(b) => !b && onTutup()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{baris ? "Ubah data pengguna" : "Tambah pengguna"}</DialogTitle>
          <DialogDescription>
            {baris ? "Perubahan tercatat di log audit." : "Email akan langsung dimasukkan ke daftar izin login. Pengguna tidak dikirimi email otomatis — beri tahu mereka secara langsung."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={simpan} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-email">Email</Label>
            <Input id="p-email" type="email" inputMode="email" autoComplete="off" required value={d.email} disabled={!!baris?.tertaut}
              onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="nama@um.ac.id" />
            {baris?.tertaut && <p className="text-xs text-muted-foreground">Email tidak dapat diubah karena pengguna sudah pernah masuk dengan email ini.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-nama">Nama lengkap</Label>
            <Input id="p-nama" required value={d.nama} onChange={(e) => setD({ ...d, nama: e.target.value })} placeholder="Nama dengan gelar" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-jabatan">Jabatan (boleh kosong)</Label>
            <Input id="p-jabatan" value={d.jabatan} onChange={(e) => setD({ ...d, jabatan: e.target.value })} placeholder="mis. Kepala Seksi Disiplin" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-peran">Peran</Label>
            <Select value={d.peran_kode} onValueChange={(v) => setD({ ...d, peran_kode: v })}>
              <SelectTrigger id="p-peran" className="w-full"><SelectValue placeholder="Pilih peran…" /></SelectTrigger>
              <SelectContent>
                {peran.map((x) => <SelectItem key={x.kode} value={x.kode}>{x.nama}</SelectItem>)}
              </SelectContent>
            </Select>
            {ket && <p className="text-sm text-muted-foreground">{ket}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onTutup}>Batal</Button>
            <Button type="submit" disabled={sibuk || !d.peran_kode}>{sibuk && <Loader2 className="animate-spin" />} Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type HasilPeriksa = Awaited<ReturnType<typeof periksaSinkronisasi>>;

function PanelSinkron() {
  const { jalankan, sibuk } = useAksi();
  const [hasil, setHasil] = useState<Extract<HasilPeriksa, { ok: true }>["data"] | null>(null);
  const [pilihTambah, setPilihTambah] = useState<string[]>([]);
  const [pilihHapus, setPilihHapus] = useState<string[]>([]);

  function periksa() {
    jalankan(() => periksaSinkronisasi(), {
      segarkan: false,
      lalu: (d) => {
        setHasil(d);
        setPilihTambah(d.kurang);
        setPilihHapus(d.lebih.filter((x) => d.nonaktif.includes(x.identifier.toLowerCase())).map((x) => x.id));
      },
    });
  }
  function perbaiki() {
    jalankan(() => perbaikiSinkronisasi(pilihTambah, pilihHapus), {
      lalu: (r) => {
        toast.success(`Sinkronisasi selesai: ${r.ditambah} ditambahkan, ${r.dihapus} dihapus.`);
        if (r.gagal.length) toast.warning(`Sebagian gagal: ${r.gagal.join("; ")}`, { duration: 12000 });
        periksa();
      },
    });
  }
  const sinkron = hasil && !hasil.kurang.length && !hasil.lebih.length;
  const ubah = (daftar: string[], set: (x: string[]) => void, v: string, on: boolean) => set(on ? [...daftar, v] : daftar.filter((x) => x !== v));

  return (
    <Panel
      judul="Sinkronisasi daftar izin login"
      deskripsi="Bandingkan pengguna aktif di SIMPEL dengan daftar izin di layanan login (Clerk)."
      aksi={<Button variant="outline" onClick={periksa} disabled={sibuk}>{sibuk ? <Loader2 className="animate-spin" /> : <RefreshCw />} Periksa sinkronisasi</Button>}
    >
      {!hasil ? (
        <p className="text-sm text-muted-foreground">Tekan <strong>Periksa sinkronisasi</strong> bila ada pengguna yang tidak bisa masuk, atau setelah muncul peringatan gagal sinkron.</p>
      ) : sinkron ? (
        <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-5 text-aman" aria-hidden /> Sudah sinkron — {hasil.cocok} pengguna aktif ada di daftar izin, tidak ada email lain.</p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm">{hasil.cocok} pengguna aktif sudah cocok.</p>
          {hasil.kurang.length > 0 && (
            <div className="space-y-2">
              <p className="font-semibold">Pengguna aktif yang belum ada di daftar izin (tidak bisa masuk):</p>
              <ul className="space-y-1">
                {hasil.kurang.map((e) => (
                  <li key={e}>
                    <label className="flex min-h-11 items-center gap-3 rounded-md px-2 hover:bg-accent">
                      <Checkbox checked={pilihTambah.includes(e)} onCheckedChange={(v) => ubah(pilihTambah, setPilihTambah, e, !!v)} />
                      <span className="break-all">Tambahkan <strong>{e}</strong></span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasil.lebih.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 font-semibold"><ShieldAlert className="size-5 text-waspada" aria-hidden /> Ada di daftar izin tetapi bukan pengguna aktif SIMPEL:</p>
              <ul className="space-y-1">
                {hasil.lebih.map((x) => (
                  <li key={x.id}>
                    <label className="flex min-h-11 items-center gap-3 rounded-md px-2 hover:bg-accent">
                      <Checkbox checked={pilihHapus.includes(x.id)} onCheckedChange={(v) => ubah(pilihHapus, setPilihHapus, x.id, !!v)} />
                      <span className="break-all">
                        Hapus <strong>{x.identifier}</strong>
                        <span className="text-muted-foreground"> — {hasil.nonaktif.includes(x.identifier.toLowerCase()) ? "pengguna nonaktif" : x.jenis === "email_address" ? "tidak terdaftar di SIMPEL" : "bukan alamat email"}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">Orang dengan email ini memang tidak bisa membuka data SIMPEL, tetapi sebaiknya dihapus agar daftar izin tetap bersih.</p>
            </div>
          )}
          <Button onClick={perbaiki} disabled={sibuk || (!pilihTambah.length && !pilihHapus.length)}>
            {sibuk && <Loader2 className="animate-spin" />} Perbaiki yang dipilih
          </Button>
        </div>
      )}
    </Panel>
  );
}
