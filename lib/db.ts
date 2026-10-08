import net from "node:net";
import postgres from "postgres";

// Koneksi Postgres (Supabase, lewat connection pooler mode transaksi).
// Hanya dipakai di server. Peran database `simpel_app` adalah pemilik tabel;
// RLS tetap aktif di semua tabel sehingga kunci publik tidak bisa membaca apa pun.

declare global {
  var __simpelSql: postgres.Sql | undefined;
}

// Jejak soket per pool untuk diagnosis: bila kueri macet, log mencatat berapa kali
// koneksi dicoba dan keadaan soket terakhir (tersambung? byte masuk/keluar?).
type Jejak = { mulai: number; percobaan: number; soket: { s: net.Socket; t: number }[] };
const jejakPool = new WeakMap<postgres.Sql, Jejak>();

function ringkasJejak(j: Jejak | undefined) {
  if (!j) return "tanpa jejak";
  const kini = Date.now();
  const soket = j.soket.map(({ s, t }) => ({
    umurMs: kini - t,
    ip: s.remoteAddress ?? null,
    status: s.destroyed ? "ditutup" : s.connecting ? "menyambung" : s.readyState,
    masuk: s.bytesRead,
    keluar: s.bytesWritten,
  }));
  return JSON.stringify({ percobaan: j.percobaan, umurPoolMs: kini - j.mulai, soketTerakhir: soket });
}

function buat() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diatur");
  const jejak: Jejak = { mulai: Date.now(), percobaan: 0, soket: [] };
  const sql = postgres(url, {
    // Soket dibuat sendiri (perilaku sama dengan bawaan) agar bisa dijejak.
    socket: ({ host, port }: { host: string[]; port: number[] }) => {
      jejak.percobaan++;
      const s = net.connect(port[0], host[0]);
      jejak.soket.push({ s, t: Date.now() });
      if (jejak.soket.length > 3) jejak.soket.shift();
      return s;
    },
    ssl: "require",
    prepare: false,
    max: 5,
    idle_timeout: 10,
    max_lifetime: 60 * 5,
    connect_timeout: 10,
    onnotice: () => {},
    transform: { undefined: null },
    types: {
      // Kolom `date` dibiarkan sebagai teks "YYYY-MM-DD" agar tidak bergeser zona waktu.
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  } as postgres.Options<Record<string, postgres.PostgresType>>);
  jejakPool.set(sql, jejak);
  return sql;
}

function ambil(): postgres.Sql {
  if (!globalThis.__simpelSql) globalThis.__simpelSql = buat();
  return globalThis.__simpelSql;
}

// Batas waktu sisi klien. postgres.js tidak punya batas waktu kueri, dan bila
// pooler menutup soket saat koneksi awal ia mencoba ulang tanpa henti; di Vercel
// (Fluid compute) soket juga bisa "mati diam-diam" setelah instans dibekukan.
// Akibatnya halaman berputar sampai 504 (5 menit). Dengan batas ini kueri yang
// macet gagal cepat dengan galat yang jelas, dan pool dibuang agar permintaan
// berikutnya membuka koneksi baru.
const BATAS_KUERI_MS = 30_000;
const BATAS_TRANSAKSI_MS = 240_000;

function buangPool(s: postgres.Sql) {
  if (globalThis.__simpelSql === s) globalThis.__simpelSql = undefined;
  s.end({ timeout: 0 }).catch(() => {});
}

function denganBatas<T>(p: PromiseLike<T>, ms: number, s: postgres.Sql, apa: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const habis = new Promise<never>((_, tolak) => {
    t = setTimeout(() => {
      console.error(`[SIMPEL] ${apa} tidak dijawab basis data dalam ${ms / 1000} dtk — pool koneksi dibuang. Jejak: ${ringkasJejak(jejakPool.get(s))}`);
      buangPool(s);
      tolak(new Error(`Basis data tidak merespons (${apa} > ${ms / 1000} dtk)`));
    }, ms);
  });
  return Promise.race([p, habis]).finally(() => clearTimeout(t));
}

// Kueri postgres.js baru dijalankan saat `.then` dipanggil (di-await), jadi
// cukup `.then` milik objek kuerinya yang dibungkus. `.values()`, `.raw()`, dsb.
// mengembalikan objek yang sama sehingga tetap ikut terbatasi.
function batasiKueri(q: unknown, s: postgres.Sql): unknown {
  if (!q || typeof q !== "object" || typeof (q as { cancel?: unknown }).cancel !== "function") return q;
  const kueri = q as PromiseLike<unknown> & { then: PromiseLike<unknown>["then"] };
  const asli = kueri.then.bind(kueri);
  kueri.then = (ok, gagal) => denganBatas({ then: asli }, BATAS_KUERI_MS, s, "kueri").then(ok, gagal);
  return kueri;
}

// Koneksi dibuat saat pertama kali dipakai (bukan saat modul diimpor),
// sehingga build dan uji unit tidak memerlukan basis data.
export const sql: postgres.Sql = new Proxy(function () {} as unknown as postgres.Sql, {
  apply: (_t, _this, args) => {
    const s = ambil();
    return batasiKueri((s as unknown as (...a: unknown[]) => unknown)(...args), s);
  },
  get: (_t, prop) => {
    const s = ambil();
    if (prop === "begin") {
      return (...a: unknown[]) =>
        denganBatas((s.begin as (...x: unknown[]) => Promise<unknown>)(...a), BATAS_TRANSAKSI_MS, s, "transaksi");
    }
    const v = (s as unknown as Record<string | symbol, unknown>)[prop];
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
