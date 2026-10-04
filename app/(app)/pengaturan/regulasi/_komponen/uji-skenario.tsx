"use client";

import { useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Catatan } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { buatKalender, tambahHariKerja } from "@/lib/hari-kerja";
import {
  hitungAmbangKehadiran, hitungTanggalSelesai, hitungTanggalTenggat, kenaPemotonganIk, susunTahapanKasus,
} from "@/lib/hukdis/mesin";
import type { AturanLengkap } from "@/lib/hukdis/jenis";
import type { Konteks } from "@/lib/hukdis/kondisi";
import { namaHari, tanggalPanjang } from "@/lib/format";
import { LABEL_SATUAN, LABEL_SIFAT } from "../_skema";
import { Pilih } from "./bidang";

function hariIni() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** "Uji dengan kasus contoh" (PRD §18.6 langkah 5) — dihitung di memori, tidak menyimpan apa pun. */
export function UjiSkenario({ aturan, libur }: { aturan: AturanLengkap; libur: string[] }) {
  const kal = useMemo(() => buatKalender(libur), [libur]);
  const [tingkatPilih, setTingkatPilih] = useState("");
  const [hari, setHari] = useState("");
  const [berturut, setBerturut] = useState(false);
  const [golongan, setGolongan] = useState("");
  const [delegasi, setDelegasi] = useState(false);
  const [pimpinan, setPimpinan] = useState(false);
  const [dasar, setDasar] = useState(hariIni());
  const [jarak, setJarak] = useState("5");

  const hasil = useMemo(() => {
    const nHari = Number(hari) || 0;
    const ambang = nHari > 0 ? hitungAmbangKehadiran(aturan, berturut ? 0 : nHari, berturut ? nHari : null) : null;
    const tingkatKode = tingkatPilih || ambang?.tingkat?.kode || "";
    const konteks: Konteks = { terperiksa_pimpinan_unit: pimpinan, unit_punya_delegasi: delegasi, golongan_ruang: golongan || null, rezim_kode: aturan.regulasi.rezim_kode };
    if (!tingkatKode) return { ambang, tingkatKode, susun: null, tanggal: new Map<string, string>(), tenggat: [], ik: false, selesai: null as string | null };
    const susun = susunTahapanKasus(aturan, tingkatKode, konteks);
    // Contoh lini waktu: tahap pertama = tanggal dasar, berikutnya + jarak hari kerja.
    const tanggal = new Map<string, string>();
    let cur = /^\d{4}-\d{2}-\d{2}$/.test(dasar) ? dasar : hariIni();
    const j = Math.max(0, Number(jarak) || 0);
    susun.tahapan.forEach((t, i) => {
      if (i > 0) cur = tambahHariKerja(cur, j, kal);
      tanggal.set(t.kode_tahap, cur);
    });
    const tenggat = aturan.tenggat
      .filter((t) => tanggal.has(t.dihitung_dari))
      .map((t) => ({ aturan: t, dasar: tanggal.get(t.dihitung_dari)!, hasil: hitungTanggalTenggat(t, tanggal.get(t.dihitung_dari)!, kal), adaTahap: tanggal.has(t.kode_tahap) }));
    const jenisPakai = ambang?.jenisEfektif ?? null;
    const berlaku = tenggat.find((t) => t.aturan.kode_tahap === "berlaku")?.hasil ?? null;
    return { ambang, tingkatKode, susun, tanggal, tenggat, ik: kenaPemotonganIk(aturan, tingkatKode), selesai: hitungTanggalSelesai(berlaku, jenisPakai) };
  }, [aturan, kal, hari, berturut, tingkatPilih, pimpinan, delegasi, golongan, dasar, jarak]);

  const namaTahap = (k: string) => hasil.susun?.tahapan.find((t) => t.kode_tahap === k)?.nama ?? aturan.tahapan.find((t) => t.kode_tahap === k)?.nama ?? k;
  const kw = hasil.susun?.kewenangan;
  const tingkatNama = aturan.tingkat.find((t) => t.kode === hasil.tingkatKode)?.nama;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="uji-hari">Jumlah hari tidak masuk kerja tanpa alasan sah</Label>
          <Input id="uji-hari" type="number" inputMode="numeric" min={0} value={hari} onChange={(e) => setHari(e.target.value)} placeholder="mis. 18" />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end rounded-md border px-3 py-2.5 text-sm">
          <Checkbox checked={berturut} onCheckedChange={(c) => setBerturut(c === true)} /> Hari tersebut berturut-turut
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="uji-tingkat">Tingkat (kosong = ikut ambang kehadiran)</Label>
          <Pilih id="uji-tingkat" nilai={tingkatPilih} onUbah={setTingkatPilih} opsi={aturan.tingkat.map((t) => ({ nilai: t.kode, label: t.nama }))} kosong="— Otomatis dari ambang —" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="uji-gol">Golongan terperiksa</Label>
          <Input id="uji-gol" value={golongan} onChange={(e) => setGolongan(e.target.value)} placeholder="mis. III/b" />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end rounded-md border px-3 py-2.5 text-sm">
          <Checkbox checked={delegasi} onCheckedChange={(c) => setDelegasi(c === true)} /> Pimpinan unit kerja terperiksa menerima delegasi
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end rounded-md border px-3 py-2.5 text-sm">
          <Checkbox checked={pimpinan} onCheckedChange={(c) => setPimpinan(c === true)} /> Terperiksa adalah pimpinan unit / Wakil Rektor
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="uji-dasar">Tanggal mulai (tahap pertama)</Label>
          <Input id="uji-dasar" type="date" value={dasar} onChange={(e) => setDasar(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="uji-jarak">Jarak antar-tahap pada contoh (hari kerja)</Label>
          <Input id="uji-jarak" type="number" inputMode="numeric" min={0} value={jarak} onChange={(e) => setJarak(e.target.value)} />
        </div>
      </div>

      {!hasil.tingkatKode ? (
        <Catatan judul="Isi skenario">
          {Number(hari) > 0 ? "Jumlah hari ini tidak memenuhi ambang kehadiran mana pun. Pilih tingkat secara manual untuk melihat tahapan dan pejabat berwenang." : "Masukkan jumlah hari tidak masuk kerja atau pilih tingkat hukuman."}
        </Catatan>
      ) : (
        <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
          <div className="flex items-center gap-2 font-semibold"><FlaskConical className="size-5 text-info" aria-hidden /> Hasil perhitungan</div>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Tingkat hukuman</dt>
              <dd className="font-medium">{tingkatNama ?? hasil.tingkatKode} {hasil.ik && <Lencana warna="waspada">Pemotongan insentif kinerja</Lencana>}</dd>
            </div>
            {hasil.ambang && (
              <div>
                <dt className="text-sm text-muted-foreground">Jenis hukuman yang diusulkan</dt>
                <dd className="font-medium">
                  {hasil.ambang.jenis?.nama ?? "—"}
                  {hasil.ambang.diganti && <span className="block text-sm font-normal text-waspada">Dijatuhkan sementara: {hasil.ambang.jenisEfektif?.nama}{hasil.ambang.jenis?.peringatan ? ` — ${hasil.ambang.jenis.peringatan}` : ""}</span>}
                  {hasil.ambang.ambang.akibat_tambahan && <span className="block text-sm font-normal">Akibat tambahan: {hasil.ambang.ambang.akibat_tambahan}</span>}
                  {hasil.ambang.ambang.pasal_rujukan && <span className="block text-sm font-normal text-muted-foreground">{hasil.ambang.ambang.pasal_rujukan}</span>}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-muted-foreground">Pemeriksa</dt>
              <dd className="font-medium">{kw?.pemeriksa?.aturan.nama_peran ?? "—"}{kw?.bentukTim && <span className="block text-sm font-normal">Tim Pemeriksa: {kw.bentukTim === "wajib" ? "wajib dibentuk" : kw.bentukTim === "boleh" ? "boleh dibentuk" : "tidak dibentuk"}</span>}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Pembentuk Tim Pemeriksa</dt>
              <dd className="font-medium">{kw?.pembentuk_tim?.aturan.nama_peran ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Pejabat yang berwenang menghukum</dt>
              <dd className="font-medium">{kw?.penjatuh?.aturan.nama_peran ?? "—"}{kw?.penjatuh?.aturan.pasal_rujukan && <span className="block text-sm font-normal text-muted-foreground">{kw.penjatuh.aturan.pasal_rujukan}</span>}</dd>
            </div>
            {hasil.selesai && (
              <div>
                <dt className="text-sm text-muted-foreground">Masa hukuman berakhir (contoh)</dt>
                <dd className="font-medium">{tanggalPanjang(hasil.selesai)}</dd>
              </div>
            )}
          </dl>
          {kw?.peringatan && kw.peringatan.length > 0 && (
            <Catatan jenis="waspada" judul="Peringatan">
              <ul className="list-disc pl-5">{kw.peringatan.map((p) => <li key={p}>{p}</li>)}</ul>
            </Catatan>
          )}
          <div>
            <h4 className="mb-2 font-semibold">Tahapan ({hasil.susun?.tahapan.length ?? 0})</h4>
            <ol className="space-y-1.5 text-sm">
              {hasil.susun?.tahapan.map((t, i) => (
                <li key={t.kode_tahap} className="flex flex-wrap gap-x-2 rounded-md bg-card px-3 py-2">
                  <span className="font-medium">{i + 1}. {t.nama}{t.opsional ? " (opsional)" : ""}</span>
                  <span className="text-muted-foreground">contoh: {namaHari(hasil.tanggal.get(t.kode_tahap))}, {tanggalPanjang(hasil.tanggal.get(t.kode_tahap))}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h4 className="mb-1 font-semibold">Tenggat</h4>
            <p className="mb-2 text-sm text-muted-foreground">Dihitung dari contoh lini waktu di atas dengan kalender hari libur yang tersimpan (akhir pekan dan hari libur dilewati).</p>
            {hasil.tenggat.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada aturan tenggat yang berlaku untuk tahapan ini.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {hasil.tenggat.map((t) => (
                  <li key={t.aturan.kode} className="rounded-md bg-card px-3 py-2">
                    <span className="font-medium">{t.aturan.nama_tenggat}: </span>
                    paling lambat 
                    <b>{namaHari(t.hasil)}, {tanggalPanjang(t.hasil)}</b>
                    <span className="block text-muted-foreground">
                      {t.aturan.jumlah} {LABEL_SATUAN[t.aturan.satuan]} {t.aturan.arah} {namaTahap(t.aturan.dihitung_dari)} ({tanggalPanjang(t.dasar)}) — {LABEL_SIFAT[t.aturan.sifat]}
                      {t.aturan.pasal_rujukan ? ` — ${t.aturan.pasal_rujukan}` : ""}
                      {!t.adaTahap ? " — tahap ini tidak ada di daftar tahapan kasus ini" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
