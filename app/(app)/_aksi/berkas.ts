"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { jalankan } from "@/lib/galat";
import { GalatPengguna } from "@/lib/galat";
import { namaAman, urlUnggahTertanda } from "@/lib/penyimpanan";

/** Langkah 1 unggah: server membuat tautan unggah bertanda ke bucket privat. */
export async function siapkanUnggahBerkas(entriId: string, info: { nama: string; mime: string; ukuran: number }) {
  return jalankan(async () => {
    await wajibHak("boleh_buat");
    const [e] = await sql`select id from entri where id = ${entriId}`;
    if (!e) throw new GalatPengguna("Entri tidak ditemukan.");
    const path = `entri/${entriId}/berkas/${Date.now()}-${namaAman(info.nama)}`;
    const u = await urlUnggahTertanda(path);
    return { signedUrl: u.signedUrl, path };
  });
}

/** Langkah 2 unggah: catat berkas di basis data setelah berhasil terunggah. */
export async function konfirmasiUnggahBerkas(entriId: string, kategori: string, info: { path: string; nama: string; mime: string; ukuran: number }) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    if (!info.path.startsWith(`entri/${entriId}/`)) throw new GalatPengguna("Lokasi berkas tidak valid.");
    const [b] = await sql`insert into berkas (entri_id, nama_file, file_path, mime, ukuran, kategori, created_by, updated_by)
      values (${entriId}, ${info.nama}, ${info.path}, ${info.mime || null}, ${info.ukuran}, ${kategori}, ${p.id}, ${p.id}) returning id`;
    await catatAudit(p, { aksi: "buat", tabel: "berkas", record_id: b.id, entri_id: entriId, ringkasan: { nama_file: info.nama, kategori } });
    revalidatePath("/", "layout");
    return b.id as string;
  });
}

/** Menyimpan teks hasil OCR / ringkasan isi berkas agar bisa dicari. */
export async function simpanTeksBerkas(berkasId: string, teks: string, keterangan?: string | null) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const [b] = await sql`update berkas set teks_ocr = coalesce(nullif(${teks.trim()}, ''), teks_ocr), keterangan = coalesce(${keterangan ?? null}, keterangan), updated_by = ${p.id}
      where id = ${berkasId} returning entri_id`;
    await catatAudit(p, { aksi: "ubah", tabel: "berkas", record_id: berkasId, entri_id: b?.entri_id, ringkasan: { teks_ocr: `${teks.length} karakter` } });
    revalidatePath("/", "layout");
  }, "Teks berkas tersimpan dan kini bisa dicari");
}

/** Arsipkan (soft delete) berkas dengan alasan. */
export async function arsipkanBerkas(berkasId: string, alasan: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    const [b] = await sql`update berkas set diarsipkan_pada = now(), updated_by = ${p.id} where id = ${berkasId} returning entri_id, nama_file`;
    await catatAudit(p, { aksi: "arsipkan", tabel: "berkas", record_id: berkasId, entri_id: b?.entri_id, alasan, ringkasan: { nama_file: b?.nama_file } });
    revalidatePath("/", "layout");
  }, "Berkas diarsipkan");
}
