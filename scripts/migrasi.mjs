// Menjalankan berkas SQL di supabase/migrations secara berurutan, sekali saja per berkas.
// Pakai: npm run db:migrate
// Saat build produksi Vercel (`vercel-build` → --saat-build) migrasi berjalan otomatis memakai
// DATABASE_URL produksi; build pratinjau dilewati agar cabang uji tidak mengubah basis data produksi.
// Bila migrasi gagal, build gagal dan versi lama tetap tayang.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

if (process.argv.includes("--saat-build") && process.env.VERCEL_ENV !== "production") {
  console.log(`Migrasi dilewati: bukan build produksi (VERCEL_ENV=${process.env.VERCEL_ENV ?? "-"}).`);
  process.exit(0);
}

const mentah = process.env.DATABASE_URL_MIGRASI || process.env.DATABASE_URL;
if (!mentah) {
  console.error("DATABASE_URL_MIGRASI / DATABASE_URL belum diisi");
  process.exit(1);
}
// Pooler Supabase mode transaksi (6543) bisa macet untuk kueri berparameter — pakai mode sesi (lihat lib/db.ts).
const u = new URL(mentah);
if (u.hostname.endsWith(".pooler.supabase.com") && u.port === "6543") u.port = "5432";
const url = u.toString();

const sql = postgres(url, { ssl: u.searchParams.get("sslmode") === "disable" ? false : "require", prepare: false, max: 1, onnotice: () => {} });
const folder = join(process.cwd(), "supabase", "migrations");

try {
  await sql`create table if not exists skema_migrasi (
    nama text primary key,
    dijalankan_pada timestamptz not null default now()
  )`;
  await sql`alter table skema_migrasi enable row level security`;

  const sudah = new Set((await sql`select nama from skema_migrasi`).map((r) => r.nama));
  const berkas = readdirSync(folder).filter((f) => f.endsWith(".sql")).sort();

  for (const nama of berkas) {
    if (sudah.has(nama)) continue;
    const isi = readFileSync(join(folder, nama), "utf8");
    if (/\bdrop\s+(table|column)\b|\balter\s+column\b.*\btype\b/i.test(isi.replace(/--.*$/gm, ""))) {
      console.error(`DITOLAK: ${nama} mengandung DROP/ALTER TYPE. Migrasi SIMPEL hanya boleh menambah.`);
      process.exit(1);
    }
    console.log(`→ menjalankan ${nama}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(isi);
      await tx`insert into skema_migrasi (nama) values (${nama})`;
    });
  }

  // Jaring pengaman: setiap tabel baru otomatis ber-RLS tanpa akses anon.
  await sql.unsafe(`
    do $$ declare t record; begin
      for t in select tablename from pg_tables where schemaname = 'public' loop
        execute format('alter table %I enable row level security', t.tablename);
        execute format('revoke all on table %I from anon, authenticated', t.tablename);
      end loop;
    end $$;`);
  console.log("Migrasi selesai.");
} catch (e) {
  console.error("Migrasi gagal:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
