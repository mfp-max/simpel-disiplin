import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase Storage — satu bucket PRIVAT. Tidak ada URL publik; akses berkas
// hanya lewat signed URL berumur pendek yang dikeluarkan server setelah
// peran pengguna diperiksa. Kunci rahasia hanya ada di server.

export const BUCKET = "simpel";
export const UMUR_URL_DETIK = 300; // ≤ 5 menit (PRD §9.1 butir 4)

let klien: SupabaseClient | null = null;
function supabase() {
  if (!klien) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY belum diatur");
    klien = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return klien;
}

export async function pastikanBucket() {
  const s = supabase();
  const { data } = await s.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await s.storage.createBucket(BUCKET, { public: false, fileSizeLimit: "50MB" });
    if (error && !/already exists/i.test(error.message)) throw error;
  } else if (data.public) {
    await s.storage.updateBucket(BUCKET, { public: false });
  }
}

export async function unggahBerkas(path: string, isi: Buffer | Uint8Array | Blob, mime: string, timpa = false) {
  const { error } = await supabase().storage.from(BUCKET).upload(path, isi, { contentType: mime, upsert: timpa });
  if (error) throw new Error(`Gagal menyimpan berkas: ${error.message}`);
  return path;
}

export async function unduhBerkas(path: string): Promise<Buffer> {
  const { data, error } = await supabase().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Berkas tidak dapat dibaca: ${error?.message ?? path}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function urlTertanda(path: string, opsi: { unduhSebagai?: string; detik?: number } = {}) {
  const { data, error } = await supabase()
    .storage.from(BUCKET)
    .createSignedUrl(path, opsi.detik ?? UMUR_URL_DETIK, opsi.unduhSebagai ? { download: opsi.unduhSebagai } : undefined);
  if (error || !data) throw new Error(`Gagal membuat tautan berkas: ${error?.message}`);
  return data.signedUrl;
}

/** Tautan unggah langsung dari peramban (menghindari batas ukuran permintaan server). */
export async function urlUnggahTertanda(path: string) {
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Gagal menyiapkan unggahan: ${error?.message}`);
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

export async function hapusBerkas(paths: string[]) {
  if (!paths.length) return;
  const { error } = await supabase().storage.from(BUCKET).remove(paths);
  if (error) throw new Error(`Gagal menghapus berkas: ${error.message}`);
}

export async function daftarBerkas(prefix: string) {
  const { data, error } = await supabase().storage.from(BUCKET).list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function namaAman(nama: string) {
  return nama.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-120);
}
