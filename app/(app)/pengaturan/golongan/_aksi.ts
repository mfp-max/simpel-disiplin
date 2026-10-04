"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { sql, transaksi } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";

export type BarisGolongan = { kode: string; pangkat: string; urutan: number };

function rapikan(x: BarisGolongan) {
  const pangkat = x.pangkat.trim().replace(/\s+/g, " ");
  const urutan = Math.round(Number(x.urutan));
  if (pangkat.length < 3) throw new GalatPengguna(`Nama pangkat untuk ${x.kode} minimal 3 huruf.`);
  if (!Number.isFinite(urutan) || urutan < 1 || urutan > 999) throw new GalatPengguna(`Urutan untuk ${x.kode} harus angka 1–999.`);
  return { pangkat, urutan };
}

/** Simpan perubahan pangkat/urutan beberapa golongan sekaligus. Kode tidak dapat diubah. */
export async function simpanGolongan(baris: BarisGolongan[], alasan: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    if (!baris.length) throw new GalatPengguna("Tidak ada perubahan untuk disimpan.");
    if (!alasan || alasan.trim().length < 5) throw new GalatPengguna("Tuliskan alasan perubahan (minimal 5 huruf).");
    await transaksi(async (tx) => {
      for (const b of baris) {
        const d = rapikan(b);
        const [lama] = await tx`select pangkat, urutan from golongan_ruang where kode = ${b.kode} for update`;
        if (!lama) throw new GalatPengguna(`Golongan ${b.kode} tidak ditemukan.`);
        const beda = selisih(lama, d);
        if (!Object.keys(beda).length) continue;
        await tx`update golongan_ruang set ${tx(d)} where kode = ${b.kode}`;
        await catatAudit(p, { aksi: "ubah", tabel: "golongan_ruang", record_id: b.kode, alasan: alasan.trim(), ringkasan: beda }, tx);
      }
    });
    revalidatePath("/pengaturan/golongan");
  }, "Golongan ruang disimpan");
}

export async function tambahGolongan(b: BarisGolongan) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const kode = b.kode.trim().replace(/\s+/g, "");
    if (!/^[A-Za-z0-9/.-]{1,10}$/.test(kode)) throw new GalatPengguna("Kode golongan tidak valid. Contoh: III/b");
    const d = rapikan({ ...b, kode });
    const [ada] = await sql`select 1 from golongan_ruang where lower(kode) = lower(${kode})`;
    if (ada) throw new GalatPengguna("Kode golongan sudah ada.");
    await transaksi(async (tx) => {
      await tx`insert into golongan_ruang ${tx({ kode, ...d })}`;
      await catatAudit(p, { aksi: "buat", tabel: "golongan_ruang", record_id: kode, ringkasan: { kode, ...d } }, tx);
    });
    revalidatePath("/pengaturan/golongan");
  }, "Golongan ruang ditambahkan");
}
