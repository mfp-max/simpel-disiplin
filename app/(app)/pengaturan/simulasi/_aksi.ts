"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { GalatPengguna, jalankan } from "@/lib/galat";
import { arsipkanSimulasi, jalankanSkenario } from "@/lib/simulasi";

/** Membuat satu skenario data simulasi (satu transaksi). Dipanggil berurutan dari halaman agar ada kemajuan per skenario. */
export async function buatSkenarioAksi(kode: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const r = await jalankanSkenario(kode, { pengguna: p, simpan: true });
    if (!r.ok) throw new GalatPengguna(`Skenario ${kode} gagal: ${r.pesan}`);
    revalidatePath("/", "layout");
    return { nomor: r.nomor ?? null, status: r.status ?? null, dilewati: !!r.dilewati, log: r.log };
  });
}

/** Mengarsipkan (soft delete) semua data simulasi. Tidak menghapus permanen; tercatat di log audit. */
export async function arsipkanSimulasiAksi() {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const n = await arsipkanSimulasi(p);
    revalidatePath("/", "layout");
    return n;
  }, "Data simulasi diarsipkan");
}
