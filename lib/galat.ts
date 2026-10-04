// Galat yang pesannya aman ditampilkan apa adanya kepada pengguna.
export class GalatPengguna extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = "GalatPengguna";
  }
}

const PESAN_UMUM = "Gagal menyimpan. Periksa sambungan internet Anda lalu coba lagi.";

/** Mengubah galat apa pun menjadi kalimat Bahasa Indonesia tanpa istilah teknis. */
export function pesanGalat(e: unknown): string {
  if (e instanceof GalatPengguna) return e.message;
  const msg = (e as { message?: string })?.message ?? "";
  const m = msg.match(/SIMPEL_[A-Z_]+:\s*([\s\S]*)$/);
  if (m) return m[1].trim();
  if (/duplicate key value/i.test(msg)) return "Data yang sama sudah ada. Periksa kembali isian Anda.";
  if (/violates foreign key/i.test(msg)) return "Data ini masih dipakai di bagian lain sehingga tidak dapat diproses.";
  if (/violates not-null/i.test(msg)) return "Ada isian wajib yang belum diisi.";
  if (/invalid input syntax for type date|date\/time field value out of range/i.test(msg)) return "Format tanggal tidak valid.";
  if (/check constraint/i.test(msg)) return "Isian tidak sesuai pilihan yang diizinkan.";
  return PESAN_UMUM;
}

export type Hasil<T = undefined> = { ok: true; data: T; pesan?: string } | { ok: false; pesan: string };

/** Pembungkus aksi server: galat teknis dicatat di log server, pengguna melihat pesan ramah. */
export async function jalankan<T>(fn: () => Promise<T>, pesanSukses?: string): Promise<Hasil<T>> {
  try {
    const data = await fn();
    return { ok: true, data, pesan: pesanSukses };
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    if (!(e instanceof GalatPengguna)) console.error("[SIMPEL]", e);
    return { ok: false, pesan: pesanGalat(e) };
  }
}
