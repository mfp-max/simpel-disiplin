import postgres from "postgres";

// Koneksi Postgres (Supabase, lewat connection pooler mode transaksi).
// Hanya dipakai di server. Peran database `simpel_app` adalah pemilik tabel;
// RLS tetap aktif di semua tabel sehingga kunci publik tidak bisa membaca apa pun.

declare global {
  var __simpelSql: postgres.Sql | undefined;
}

function buat() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diatur");
  return postgres(url, {
    ssl: "require",
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    transform: { undefined: null },
    types: {
      // Kolom `date` dibiarkan sebagai teks "YYYY-MM-DD" agar tidak bergeser zona waktu.
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  });
}

function ambil(): postgres.Sql {
  if (!globalThis.__simpelSql) globalThis.__simpelSql = buat();
  return globalThis.__simpelSql;
}

// Koneksi dibuat saat pertama kali dipakai (bukan saat modul diimpor),
// sehingga build dan uji unit tidak memerlukan basis data.
export const sql: postgres.Sql = new Proxy(function () {} as unknown as postgres.Sql, {
  apply: (_t, _this, args) => (ambil() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_t, prop) => {
    const s = ambil() as unknown as Record<string | symbol, unknown>;
    const v = s[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(s) : v;
  },
});

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

/**
 * Menjalankan fn di dalam satu transaksi. Semua perubahan batal bila ada galat.
 * Contoh: await transaksi(async (tx) => { await tx`insert ...`; });
 */
export async function transaksi<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  return (await sql.begin((tx) => fn(tx as unknown as Sql))) as T;
}

/** Izinkan koreksi salah ketik pada katalog yang sudah dipakai (wajib dicatat di audit_log dengan alasan). */
export async function izinkanKoreksi(tx: Sql) {
  await tx`select set_config('simpel.izin_koreksi', '1', true)`;
}
