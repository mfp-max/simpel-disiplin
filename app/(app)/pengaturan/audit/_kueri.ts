import "server-only";
import { sql } from "@/lib/db";
import type { Pengguna } from "@/lib/auth";

export type FilterAudit = { dari?: string; sampai?: string; user?: string; aksi?: string; tabel?: string; q?: string };

export const LABEL_AKSI: Record<string, string> = {
  lihat: "Membuka", buat: "Membuat", ubah: "Mengubah", hapus: "Menghapus", arsipkan: "Mengarsipkan", pulihkan: "Memulihkan",
  unduh: "Mengunduh", cetak: "Mencetak", ekspor: "Mengekspor", masuk: "Masuk", putar: "Memutar rekaman", impor: "Mengimpor",
  musnahkan: "Memusnahkan", koreksi: "Mengoreksi",
};

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bolehLihatAudit(p: Pengguna) {
  return p.hak.kelola_pengaturan || p.hak.boleh_lihat_audit;
}

/** Bersihkan nilai filter dari URL/klien. */
export function rapikanFilter(f: Record<string, string | undefined>): FilterAudit {
  const t = (v?: string) => (v ?? "").trim() || undefined;
  return {
    dari: POLA_TANGGAL.test(f.dari ?? "") ? f.dari : undefined,
    sampai: POLA_TANGGAL.test(f.sampai ?? "") ? f.sampai : undefined,
    user: f.user === "sistem" || POLA_UUID.test(f.user ?? "") ? f.user : undefined,
    aksi: t(f.aksi)?.slice(0, 30),
    tabel: t(f.tabel)?.slice(0, 60),
    q: t(f.q)?.slice(0, 100),
  };
}

export function kondisiAudit(f: FilterAudit) {
  const pola = f.q ? `%${f.q}%` : null;
  return sql`true
    ${f.dari ? sql`and a.waktu >= (${f.dari}::date)::timestamp at time zone 'Asia/Jakarta'` : sql``}
    ${f.sampai ? sql`and a.waktu < ((${f.sampai}::date + 1))::timestamp at time zone 'Asia/Jakarta'` : sql``}
    ${f.user === "sistem" ? sql`and a.user_id is null` : f.user ? sql`and a.user_id = ${f.user}::uuid` : sql``}
    ${f.aksi ? sql`and a.aksi = ${f.aksi}` : sql``}
    ${f.tabel ? sql`and a.tabel = ${f.tabel}` : sql``}
    ${pola ? sql`and (e.nomor_registrasi ilike ${pola} or a.record_id ilike ${pola} or a.entri_id::text = ${f.q!})` : sql``}`;
}

export type BarisAudit = {
  id: string; waktu: Date; email: string | null; nama: string | null; aksi: string; tabel: string | null; record_id: string | null;
  entri_id: string | null; nomor_registrasi: string | null; kelas: string | null; ringkasan_perubahan: unknown; alasan: string | null;
  ip: string | null; user_agent: string | null;
};

export async function ambilAudit(f: FilterAudit, batas: number, offset = 0) {
  return (await sql`select a.id::text as id, a.waktu, a.email, u.nama, a.aksi, a.tabel, a.record_id, a.entri_id, e.nomor_registrasi, e.kelas,
      a.ringkasan_perubahan, a.alasan, a.ip, a.user_agent
    from audit_log a left join app_users u on u.id = a.user_id left join entri e on e.id = a.entri_id
    where ${kondisiAudit(f)} order by a.waktu desc, a.id desc limit ${batas} offset ${offset}`) as unknown as BarisAudit[];
}

export async function hitungAudit(f: FilterAudit) {
  const [{ n }] = await sql`select count(*)::int as n from audit_log a left join entri e on e.id = a.entri_id where ${kondisiAudit(f)}`;
  return n as number;
}
