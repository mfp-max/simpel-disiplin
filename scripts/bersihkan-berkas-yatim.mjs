// Menghapus berkas "yatim" di penyimpanan: folder entri/<id>/ yang entrinya sudah tidak ada
// di basis data (mis. setelah migrasi 0010_mulai_baru). Folder lain (template/) tidak disentuh.
//
// Pakai:  node --env-file=.env.local scripts/bersihkan-berkas-yatim.mjs [--uji]
// Build:  dijalankan otomatis oleh `vercel-build` (--saat-build) hanya di produksi.
// Tidak pernah menggagalkan build: galat hanya dicatat.
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "simpel";
const UJI = process.argv.includes("--uji");

if (process.argv.includes("--saat-build") && process.env.VERCEL_ENV !== "production") {
  console.log("Pembersihan berkas dilewati: bukan build produksi.");
  process.exit(0);
}

async function semua(sb, prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const x of data ?? []) {
      const p = `${prefix}/${x.name}`;
      if (x.id) out.push(p);
      else out.push(...(await semua(sb, p)));
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main() {
  const mentah = process.env.DATABASE_URL_MIGRASI || process.env.DATABASE_URL;
  if (!mentah || !process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    console.log("Pembersihan berkas dilewati: kunci basis data/penyimpanan belum lengkap.");
    return;
  }
  const u = new URL(mentah);
  if (u.hostname.endsWith(".pooler.supabase.com") && u.port === "6543") u.port = "5432";
  const sql = postgres(u.toString(), { ssl: u.searchParams.get("sslmode") === "disable" ? false : "require", prepare: false, max: 1, onnotice: () => {} });
  try {
    const ada = new Set((await sql`select id::text from entri`).map((r) => r.id));
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
    const { data: folder, error } = await sb.storage.from(BUCKET).list("entri", { limit: 10000 });
    if (error) throw error;
    const yatim = (folder ?? []).filter((f) => !f.id && /^[0-9a-f-]{36}$/i.test(f.name) && !ada.has(f.name)).map((f) => f.name);
    let hapus = [];
    for (const id of yatim) hapus.push(...(await semua(sb, `entri/${id}`)));
    console.log(`Berkas yatim: ${hapus.length} berkas dari ${yatim.length} entri yang sudah tidak ada.`);
    if (UJI || !hapus.length) return;
    for (let i = 0; i < hapus.length; i += 100) {
      const { error: e } = await sb.storage.from(BUCKET).remove(hapus.slice(i, i + 100));
      if (e) throw e;
    }
    console.log(`✓ ${hapus.length} berkas yatim dihapus.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => console.error("Pembersihan berkas gagal (build tetap dilanjutkan):", e.message ?? e));
