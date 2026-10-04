"use server";

import { revalidatePath } from "next/cache";
import { wajibHak, wajibPengguna } from "@/lib/auth";
import { sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";
import { buatBapDariSesi, buatDokumen, buatUlangDokumen, renderDokumen, siapkanDokumen, type Persiapan } from "@/lib/dokumen/buat";

type MasukanDokumen = {
  entriId: string;
  templateId: string;
  tahapanId?: string | null;
  sesiId?: string | null;
  isian?: Record<string, string>;
  nomor?: string | null;
  tanggal?: string | null;
  status?: "draf" | "final";
};

function bersihkanIsian(isian: Record<string, unknown> | undefined) {
  const hasil: Record<string, string> = {};
  for (const [k, v] of Object.entries(isian ?? {})) if (typeof v === "string" && /^[A-Za-z0-9_]+$/.test(k)) hasil[k] = v.slice(0, 20000);
  return hasil;
}

/** Langkah 1 dialog "Buat dokumen": nilai otomatis + daftar isian yang masih kosong. */
export async function siapkanDokumenAksi(m: { entriId: string; templateId: string; tahapanId?: string | null; sesiId?: string | null }) {
  return jalankan(async (): Promise<Omit<Persiapan, "nilai">> => {
    const p = await wajibPengguna();
    const { nilai, ...sisa } = await siapkanDokumen({ ...m, penggunaNama: p.nama });
    void nilai;
    return sisa;
  });
}

/** Pratinjau di dialog (belum disimpan). Tercatat di audit sebagai cetak/pratinjau. */
export async function pratinjauDokumenAksi(m: MasukanDokumen) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const r = await renderDokumen({ ...m, isian: bersihkanIsian(m.isian) }, p);
    await catatAudit(p, {
      aksi: "cetak", tabel: "dokumen", entri_id: m.entriId,
      ringkasan: { mode: "pratinjau", judul: r.judul, template: r.template.kode, template_versi: r.versi.versi },
    });
    return { base64: r.isi.toString("base64"), judul: r.judul };
  });
}

/** Simpan dokumen (draf/final) lalu kembalikan tautan unduhan. */
export async function buatDokumenAksi(m: MasukanDokumen) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const { dokumenId } = await buatDokumen({ ...m, isian: bersihkanIsian(m.isian), status: m.status === "final" ? "final" : "draf" }, p);
    revalidatePath("/", "layout");
    return { dokumenId, unduh: `/api/dokumen/${dokumenId}` };
  }, "Dokumen tersimpan");
}

/** Buat ulang sebagai versi baru dengan data kasus terkini (dokumen lama tetap tersimpan). */
export async function buatUlangDokumenAksi(dokumenId: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const r = await buatUlangDokumen(dokumenId, p);
    revalidatePath("/", "layout");
    return { dokumenId: r.dokumenId, unduh: `/api/dokumen/${r.dokumenId}` };
  }, "Versi baru dokumen dibuat");
}

/** Tandai final: isi dokumen dibekukan (trigger basis data menolak perubahan isi setelahnya). */
export async function tandaiFinalAksi(dokumenId: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    const [d] = await sql`update dokumen set status = 'final', updated_by = ${p.id}
      where id = ${dokumenId} and status = 'draf' and diarsipkan_pada is null returning entri_id, judul, versi`;
    if (!d) throw new GalatPengguna("Dokumen tidak ditemukan atau sudah final.");
    await catatAudit(p, { aksi: "ubah", tabel: "dokumen", record_id: dokumenId, entri_id: d.entri_id, ringkasan: { status: { sebelum: "draf", sesudah: "final" }, judul: d.judul, versi: d.versi } });
    revalidatePath("/", "layout");
  }, "Dokumen ditandai final dan dibekukan");
}

/** BAP dari sesi mode sidang (dipakai modul pemeriksaan). */
export async function buatBapDariSesiAksi(sesiId: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const r = await buatBapDariSesi(sesiId, p);
    revalidatePath("/", "layout");
    return { dokumenId: r.dokumenId, unduh: `/api/dokumen/${r.dokumenId}` };
  }, "Berita Acara Pemeriksaan dibuat");
}
