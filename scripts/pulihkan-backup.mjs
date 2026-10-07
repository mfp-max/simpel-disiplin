// Memulihkan backup penuh SIMPEL (hasil scripts/backup-penuh.mjs) ke database &
// penyimpanan BARU. Langkah: (1) jalankan migrasi skema di database baru
// (npm run db:migrate), (2) jalankan skrip ini.
//
// Pakai: node --env-file=.env.local scripts/pulihkan-backup.mjs <folder-backup> [--paksa]
// Tanpa --paksa, skrip menolak bila database tujuan sudah berisi data kasus/pegawai.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const folder = process.argv[2];
const paksa = process.argv.includes("--paksa");
if (!folder) {
  console.error("Sebutkan folder backup.");
  process.exit(1);
}
const BUCKET = "simpel";
const MIME = { ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webm": "audio/webm", ".zip": "application/zip", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
const sql = postgres(process.env.DATABASE_URL_MIGRASI || process.env.DATABASE_URL, { ssl: "require", prepare: false, max: 1, onnotice: () => {} });

function semuaBerkas(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...semuaBerkas(p));
    else out.push(p);
  }
  return out;
}

async function main() {
  const manifest = JSON.parse(readFileSync(join(folder, "database", "manifest.json"), "utf8"));
  const [{ ada }] = await sql`select to_regclass('public.entri') is not null as ada`;
  if (!ada) throw new Error("Skema belum ada. Jalankan dulu: npm run db:migrate");
  const [{ n }] = await sql`select (select count(*) from entri) + (select count(*) from pegawai) + (select count(*) from regulasi) as n`;
  if (Number(n) > 0 && !paksa) throw new Error("Database tujuan sudah berisi data. Gunakan database kosong (atau --paksa bila Anda yakin).");

  console.log("→ memulihkan data…");
  await sql.unsafe(readFileSync(join(folder, "database", "data.sql"), "utf8"));

  let selisih = 0;
  for (const [t, jumlah] of Object.entries(manifest.tabel)) {
    const [{ c }] = await sql.unsafe(`select count(*)::int as c from "${t}"`);
    if (c < jumlah) { console.log(`  ! ${t}: ${c} dari ${jumlah} baris`); selisih += 1; }
  }
  console.log(selisih ? `  ${selisih} tabel tidak lengkap` : `  ✓ ${Object.keys(manifest.tabel).length} tabel lengkap`);

  console.log("→ memulihkan berkas penyimpanan…");
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const { data: b } = await sb.storage.getBucket(BUCKET);
  if (!b) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: "50MB" });
    if (error) throw error;
  }
  const akar = join(folder, "storage", BUCKET);
  let k = 0;
  for (const f of semuaBerkas(akar)) {
    const path = relative(akar, f).split(sep).join("/");
    const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
    const { error } = await sb.storage.from(BUCKET).upload(path, readFileSync(f), { contentType: MIME[ext] ?? "application/octet-stream", upsert: true });
    if (error) throw new Error(`Gagal mengunggah ${path}: ${error.message}`);
    k += 1;
  }
  console.log(`  ✓ ${k} dari ${manifest.berkas} berkas`);
  console.log("Pemulihan selesai.");
}

main().catch((e) => { console.error("Pemulihan gagal:", e.message); process.exitCode = 1; }).finally(() => sql.end());
