import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

// Sinkronisasi daftar izin (allowlist) Clerk dengan tabel app_users.
// Basis data SIMPEL adalah sumber kebenaran hak akses (penggunaSaatIni memeriksa `aktif`);
// daftar izin Clerk hanya gerbang pertama agar email asing tidak bisa mendaftar/masuk.

type GalatClerk = { status?: number; errors?: { code?: string; message?: string; longMessage?: string }[]; message?: string };

function kodeGalat(e: unknown) {
  return (e as GalatClerk)?.errors?.[0]?.code ?? "";
}

/** Pesan Bahasa Indonesia untuk galat dari layanan login (Clerk). */
export function pesanClerk(e: unknown): string {
  const g = e as GalatClerk;
  const kode = kodeGalat(e);
  if (kode === "form_param_format_invalid" || kode === "form_identifier_invalid") return "Alamat email ditolak layanan login karena formatnya tidak valid.";
  if (g?.status === 401 || g?.status === 403) return "Kunci layanan login (Clerk) di server tidak valid. Hubungi pengelola teknis.";
  if (g?.status === 429) return "Layanan login sedang membatasi permintaan. Tunggu sebentar lalu coba lagi.";
  if (g?.status && g.status >= 500) return "Layanan login (Clerk) sedang bermasalah. Coba lagi beberapa saat lagi.";
  return "Tidak dapat terhubung ke layanan login (Clerk). Periksa sambungan internet lalu coba lagi.";
}

export type IdentitasIzin = { id: string; identifier: string; jenis: string };

/** Seluruh isi daftar izin Clerk. */
export async function daftarIzin(): Promise<IdentitasIzin[]> {
  const c = await clerkClient();
  const out: IdentitasIzin[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const r = await c.allowlistIdentifiers.getAllowlistIdentifierList({ limit: 100, offset });
    out.push(...r.data.map((x) => ({ id: x.id, identifier: x.identifier, jenis: String(x.identifierType) })));
    if (r.data.length < 100 || out.length >= r.totalCount) break;
  }
  return out;
}

/** Tambahkan email ke daftar izin. Sudah ada = dianggap berhasil. Tidak mengirim email undangan. */
export async function tambahIzin(email: string): Promise<"ditambahkan" | "sudah_ada"> {
  const c = await clerkClient();
  try {
    await c.allowlistIdentifiers.createAllowlistIdentifier({ identifier: email.trim().toLowerCase(), notify: false });
    return "ditambahkan";
  } catch (e) {
    if (kodeGalat(e) === "duplicate_record") return "sudah_ada";
    throw e;
  }
}

/** Hapus email dari daftar izin (bila ada). */
export async function hapusIzin(email: string, daftar?: IdentitasIzin[]): Promise<number> {
  const c = await clerkClient();
  const cari = email.trim().toLowerCase();
  const isi = daftar ?? (await daftarIzin());
  let n = 0;
  for (const x of isi.filter((i) => i.identifier.toLowerCase() === cari)) {
    try {
      await c.allowlistIdentifiers.deleteAllowlistIdentifier(x.id);
      n += 1;
    } catch (e) {
      if ((e as GalatClerk)?.status !== 404) throw e;
    }
  }
  return n;
}

/** Hapus identitas daftar izin berdasarkan id (untuk perbaikan sinkronisasi). */
export async function hapusIzinId(id: string) {
  const c = await clerkClient();
  try {
    await c.allowlistIdentifiers.deleteAllowlistIdentifier(id);
  } catch (e) {
    if ((e as GalatClerk)?.status !== 404) throw e;
  }
}

/** Cabut semua sesi aktif akun Clerk yang memakai email ini. Mengembalikan jumlah sesi yang dicabut. */
export async function cabutSesi(email: string): Promise<{ akun: number; sesi: number }> {
  const c = await clerkClient();
  const u = await c.users.getUserList({ emailAddress: [email.trim().toLowerCase()], limit: 10 });
  let sesi = 0;
  for (const user of u.data) {
    const s = await c.sessions.getSessionList({ userId: user.id, status: "active", limit: 100 });
    for (const x of s.data) {
      try {
        await c.sessions.revokeSession(x.id);
        sesi += 1;
      } catch {
        // sesi mungkin sudah berakhir sendiri
      }
    }
  }
  return { akun: u.data.length, sesi };
}

export type HasilPeriksa = {
  kurang: string[];                    // email pengguna aktif yang belum ada di daftar izin
  lebih: IdentitasIzin[];              // isi daftar izin yang bukan pengguna aktif SIMPEL
  cocok: number;
};

/** Bandingkan email pengguna aktif di SIMPEL dengan daftar izin Clerk. */
export async function bandingkanIzin(emailAktif: string[]): Promise<HasilPeriksa> {
  const izin = await daftarIzin();
  const setIzin = new Set(izin.map((i) => i.identifier.toLowerCase()));
  const setAktif = new Set(emailAktif.map((e) => e.toLowerCase()));
  const kurang = [...setAktif].filter((e) => !setIzin.has(e)).sort();
  const lebih = izin.filter((i) => !setAktif.has(i.identifier.toLowerCase()));
  return { kurang, lebih, cocok: setAktif.size - kurang.length };
}
