import "server-only";
import { headers } from "next/headers";
import { sql, type Sql } from "@/lib/db";

type Pelaku = { id: string; email: string } | null;

export type CatatanAudit = {
  aksi: "lihat" | "buat" | "ubah" | "hapus" | "arsipkan" | "pulihkan" | "unduh" | "cetak" | "ekspor" | "masuk" | "putar" | "impor" | "musnahkan" | "koreksi";
  tabel?: string;
  record_id?: string | null;
  entri_id?: string | null;
  ringkasan?: Record<string, unknown> | null;
  alasan?: string | null;
};

/** Mencatat satu peristiwa ke audit_log (tabel yang tidak bisa diubah/dihapus). */
export async function catatAudit(pelaku: Pelaku, c: CatatanAudit, db: Sql = sql) {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
    ua = h.get("user-agent");
  } catch {
    // di luar konteks permintaan (skrip/cron)
  }
  await db`insert into audit_log (user_id, email, aksi, tabel, record_id, entri_id, ringkasan_perubahan, alasan, ip, user_agent)
    values (${pelaku?.id ?? null}, ${pelaku?.email ?? "sistem"}, ${c.aksi}, ${c.tabel ?? null}, ${c.record_id ?? null},
      ${c.entri_id ?? null}, ${c.ringkasan ? db.json(c.ringkasan as never) : null}, ${c.alasan ?? null}, ${ip}, ${ua})`;
}

/** Selisih nilai sebelum/sesudah untuk ringkasan audit. */
export function selisih(lama: Record<string, unknown> | null | undefined, baru: Record<string, unknown>) {
  const out: Record<string, { sebelum: unknown; sesudah: unknown }> = {};
  for (const [k, v] of Object.entries(baru)) {
    const a = lama?.[k];
    if (JSON.stringify(a ?? null) !== JSON.stringify(v ?? null)) out[k] = { sebelum: a ?? null, sesudah: v ?? null };
  }
  return out;
}
