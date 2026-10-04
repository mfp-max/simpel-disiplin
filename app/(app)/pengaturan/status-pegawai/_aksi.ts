"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { sql, transaksi } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";
import { terapkanUlangRezim } from "@/lib/simpega/impor";

async function cekRezim(kode: string | null) {
  if (!kode) return null;
  const [r] = await sql`select kode from rezim where kode = ${kode} and aktif`;
  if (!r) throw new GalatPengguna("Rezim tidak dikenal.");
  return r.kode as string;
}

/** Menambah atau mengubah pemetaan status pegawai → rezim (null = perlu verifikasi). */
export async function simpanPemetaan(m: { statusLama: string | null; status: string; rezim: string | null; keterangan: string | null }) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const status = m.status?.replace(/\s+/g, " ").trim();
    if (!status) throw new GalatPengguna("Nama status pegawai wajib diisi.");
    if (status.length > 100) throw new GalatPengguna("Nama status terlalu panjang.");
    const rezim = await cekRezim(m.rezim || null);
    const keterangan = m.keterangan?.trim() || null;
    await transaksi(async (tx) => {
      if (m.statusLama) {
        const [lama] = await tx`select status_pegawai, rezim_kode, keterangan from pemetaan_status_pegawai where status_pegawai = ${m.statusLama} for update`;
        if (!lama) throw new GalatPengguna("Status tidak ditemukan.");
        if (status !== m.statusLama) throw new GalatPengguna("Nama status tidak dapat diganti karena dipakai data Simpega. Tambahkan status baru bila perlu.");
        const baru = { status_pegawai: status, rezim_kode: rezim, keterangan };
        const beda = selisih(lama, baru);
        if (!Object.keys(beda).length) throw new GalatPengguna("Tidak ada perubahan.");
        await tx`update pemetaan_status_pegawai set rezim_kode = ${rezim}, keterangan = ${keterangan}, updated_at = now() where status_pegawai = ${m.statusLama}`;
        await catatAudit(p, { aksi: "ubah", tabel: "pemetaan_status_pegawai", record_id: null, ringkasan: { status_pegawai: status, ...beda } }, tx);
      } else {
        const [ada] = await tx`select 1 from pemetaan_status_pegawai where lower(status_pegawai) = lower(${status})`;
        if (ada) throw new GalatPengguna("Status ini sudah ada di daftar.");
        await tx`insert into pemetaan_status_pegawai (status_pegawai, rezim_kode, keterangan) values (${status}, ${rezim}, ${keterangan})`;
        await catatAudit(p, { aksi: "buat", tabel: "pemetaan_status_pegawai", record_id: null, ringkasan: { status_pegawai: status, rezim_kode: rezim, keterangan } }, tx);
      }
    });
    revalidatePath("/pengaturan/status-pegawai");
  }, "Pemetaan status tersimpan. Tekan “Terapkan ulang ke pegawai” agar pegawai yang sudah ada ikut diperbarui.");
}

/** Menghitung ulang rezim_kode pegawai yang tidak di-set manual. */
export async function terapkanUlang() {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const n = await terapkanUlangRezim(sql, p.id);
    await catatAudit(p, { aksi: "ubah", tabel: "pegawai", record_id: null, ringkasan: { keterangan: "Terapkan ulang pemetaan status → rezim", pegawai_berubah: n } });
    revalidatePath("/pengaturan/status-pegawai");
    revalidatePath("/pegawai");
    return { berubah: n };
  });
}
