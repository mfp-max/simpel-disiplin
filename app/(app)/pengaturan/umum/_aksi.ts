"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { transaksi } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";

export type Perubahan = { kunci: string; nilai: unknown };

function jenis(v: unknown) {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export async function simpanPengaturan(perubahan: Perubahan[]) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    if (!perubahan.length) throw new GalatPengguna("Tidak ada perubahan untuk disimpan.");
    await transaksi(async (tx) => {
      for (const x of perubahan) {
        const [lama] = await tx`select kunci, label, nilai from pengaturan where kunci = ${x.kunci} for update`;
        if (!lama) throw new GalatPengguna(`Pengaturan "${x.kunci}" tidak ditemukan.`);
        let nilai = x.nilai;
        const jLama = jenis(lama.nilai);
        if (typeof nilai === "string") nilai = nilai.trim();
        if (jLama === "number") {
          const n = Number(nilai);
          if (nilai === "" || !Number.isFinite(n)) throw new GalatPengguna(`"${lama.label}" harus berupa angka.`);
          if (n < 0) throw new GalatPengguna(`"${lama.label}" tidak boleh negatif.`);
          nilai = n;
        } else if (jLama === "boolean") {
          nilai = !!nilai;
        } else if (jLama === "object" || jLama === "array") {
          if (jenis(nilai) !== jLama) throw new GalatPengguna(`"${lama.label}" harus berupa ${jLama === "array" ? "daftar" : "objek"} JSON yang valid.`);
        } else if (typeof nilai !== "string") {
          nilai = nilai == null ? "" : String(nilai);
        }
        if (/^nip_/.test(x.kunci) && typeof nilai === "string" && nilai) {
          const bersih = nilai.replace(/\s+/g, "");
          if (!/^\d{18}$/.test(bersih)) throw new GalatPengguna(`"${lama.label}" harus 18 angka.`);
          nilai = bersih;
        }
        if (JSON.stringify(lama.nilai) === JSON.stringify(nilai)) continue;
        await tx`update pengaturan set nilai = ${tx.json(nilai as never)}, updated_by = ${p.id}, updated_at = now() where kunci = ${x.kunci}`;
        await catatAudit(p, { aksi: "ubah", tabel: "pengaturan", record_id: x.kunci, ringkasan: { [x.kunci]: { sebelum: lama.nilai, sesudah: nilai } } }, tx);
      }
    });
    revalidatePath("/", "layout");
  }, "Pengaturan disimpan");
}
