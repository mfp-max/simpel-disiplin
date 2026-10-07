// Backup penuh SIMPEL: seluruh tabel (JSON + data.sql siap pulih) dan seluruh
// berkas di Supabase Storage. Tidak mengubah apa pun di sumber.
//
// Pakai: node --env-file=.env.local scripts/backup-penuh.mjs <folder-tujuan>
//
// Pemulihan: jalankan migrasi di database baru (npm run db:migrate), lalu
//            node --env-file=.env.local scripts/pulihkan-backup.mjs <folder-backup>
import { mkdirSync, writeFileSync, readdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const tujuan = process.argv[2];
if (!tujuan) {
  console.error("Sebutkan folder tujuan, mis. node scripts/backup-penuh.mjs D:/backup-simpel");
  process.exit(1);
}
const url = process.env.DATABASE_URL_MIGRASI || process.env.DATABASE_URL;
const sql = postgres(url, { ssl: "require", prepare: false, max: 1, onnotice: () => {}, types: { date: { to: 1082, from: [1082], serialize: (x) => x, parse: (x) => x } } });
const BUCKET = "simpel";
const lewati = new Set(["skema_migrasi"]); // diisi ulang oleh runner migrasi

const tulis = (p, isi) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, isi); };
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const ident = (s) => '"' + s.replace(/"/g, '""') + '"';

async function main() {
  const manifest = { dibuat_pada: new Date().toISOString(), sumber: url.replace(/:[^:@/]+@/, ":***@"), tabel: {}, berkas: 0, ukuran_berkas: 0 };

  // ---- Struktur: tabel, kolom (tanpa kolom generated), FK
  const tabel = (await sql`select tablename from pg_tables where schemaname = 'public' order by 1`).map((r) => r.tablename).filter((t) => !lewati.has(t));
  const kolom = await sql`select table_name, column_name, is_generated, is_identity, is_nullable, ordinal_position from information_schema.columns
    where table_schema = 'public' order by table_name, ordinal_position`;
  const fk = await sql`select c.conrelid::regclass::text as dari, c.confrelid::regclass::text as ke, a.attname as kolom
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace`;

  const pkRows = await sql`select i.indrelid::regclass::text as t, a.attname as k from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indisprimary and i.indrelid::regclass::text in ${sql(tabel)}`;
  const pk = (t) => pkRows.filter((r) => r.t === t).map((r) => r.k);

  // ---- Urutan topologis berdasarkan FK WAJIB (not null). FK opsional yang
  //      menunjuk ke tabel yang belum diisi (atau ke dirinya sendiri) ditunda
  //      dan diisi lewat UPDATE setelah tabel acuannya terisi.
  const wajib = (t, k) => kolom.some((x) => x.table_name === t && x.column_name === k && x.is_nullable === "NO");
  const urutan = [];
  const sudah = new Set();
  const kunjung = (t, jalur) => {
    if (sudah.has(t)) return;
    if (jalur.has(t)) throw new Error("Siklus FK wajib pada tabel " + t);
    jalur.add(t);
    for (const e of fk.filter((x) => x.dari === t && x.ke !== t && wajib(t, x.kolom))) if (tabel.includes(e.ke)) kunjung(e.ke, jalur);
    jalur.delete(t);
    sudah.add(t);
    urutan.push(t);
  };
  for (const t of tabel) kunjung(t, new Set());
  const posisi = new Map(urutan.map((t, i) => [t, i]));
  const tunda = fk
    .filter((e) => !wajib(e.dari, e.kolom) && (e.ke === e.dari || (posisi.get(e.ke) ?? -1) > (posisi.get(e.dari) ?? -1)))
    .map((e) => ({ tabel: e.dari, kolom: e.kolom, setelah: e.ke }));

  // ---- Data
  const potongan = [
    "-- SIMPEL — data penuh (dibuat " + manifest.dibuat_pada + ")",
    "-- Jalankan SETELAH migrasi skema (supabase/migrations/*.sql) pada database KOSONG.",
    "begin;",
  ];
  const updateTertunda = new Map(); // tabel referensi -> daftar SQL update
  for (const t of urutan) {
    const kol = kolom.filter((k) => k.table_name === t && k.is_generated !== "ALWAYS").map((k) => k.column_name);
    const identity = kolom.some((k) => k.table_name === t && k.is_identity === "YES");
    const setKol = kol.filter((k) => !kolom.some((x) => x.table_name === t && x.column_name === k && x.is_identity === "YES"));
    const rows = await sql.unsafe(`select * from ${ident(t)} order by 1`);
    manifest.tabel[t] = rows.length;
    tulis(join(tujuan, "database", "data", `${t}.json`), JSON.stringify(rows, null, 1));
    if (!rows.length) continue;

    const ditunda = tunda.filter((x) => x.tabel === t).map((x) => x.kolom);
    const bersih = rows.map((r) => Object.fromEntries(kol.map((k) => [k, ditunda.includes(k) ? null : r[k]])));
    potongan.push(`\n-- ${t} (${rows.length} baris)`);
    for (let i = 0; i < bersih.length; i += 500) {
      const json = JSON.stringify(bersih.slice(i, i + 500));
      potongan.push(`insert into ${ident(t)} (${kol.map(ident).join(", ")}) ${identity ? "overriding system value " : ""}select ${kol.map(ident).join(", ")} from json_populate_recordset(null::${ident(t)}, ${lit(json)}) on conflict on constraint ${ident(t + "_pkey")} do update set (${setKol.map(ident).join(", ")}) = row(${setKol.map((k) => "excluded." + ident(k)).join(", ")});`);
    }
    if (identity) {
      const idk = kolom.find((k) => k.table_name === t && k.is_identity === "YES").column_name;
      potongan.push(`select setval(pg_get_serial_sequence('${t}', '${idk}'), coalesce((select max(${ident(idk)}) from ${ident(t)}), 1));`);
    }
    for (const x of tunda.filter((y) => y.tabel === t)) {
      const isi = rows.filter((r) => r[x.kolom] !== null).map((r) => `update ${ident(t)} set ${ident(x.kolom)} = ${lit(r[x.kolom])} where ${pk(t).map((k) => `${ident(k)} = ${lit(r[k])}`).join(" and ")};`);
      if (!isi.length) continue;
      const arr = updateTertunda.get(x.setelah) ?? [];
      arr.push(`-- tautan ${t}.${x.kolom}`, ...isi);
      updateTertunda.set(x.setelah, arr);
    }
    // Jalankan update yang menunggu tabel ini (dan update diri sendiri)
    if (updateTertunda.has(t)) { potongan.push(...updateTertunda.get(t)); updateTertunda.delete(t); }
  }
  for (const [, arr] of updateTertunda) potongan.push(...arr);
  potongan.push("commit;\n");
  tulis(join(tujuan, "database", "data.sql"), potongan.join("\n"));

  // ---- Skema (migrasi)
  const mig = join(process.cwd(), "supabase", "migrations");
  for (const f of readdirSync(mig)) { mkdirSync(join(tujuan, "database", "skema"), { recursive: true }); copyFileSync(join(mig, f), join(tujuan, "database", "skema", f)); }

  // ---- Storage
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const daftar = [];
  const jelajah = async (prefix) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
      if (error) throw error;
      for (const o of data) {
        const p = prefix ? `${prefix}/${o.name}` : o.name;
        if (o.id === null) await jelajah(p); else daftar.push(p);
      }
      if (data.length < 1000) break;
    }
  };
  await jelajah("");
  for (const p of daftar) {
    const { data, error } = await sb.storage.from(BUCKET).download(p);
    if (error) throw new Error(`Gagal mengunduh ${p}: ${error.message}`);
    const buf = Buffer.from(await data.arrayBuffer());
    tulis(join(tujuan, "storage", BUCKET, ...p.split("/")), buf);
    manifest.berkas += 1;
    manifest.ukuran_berkas += buf.length;
  }
  manifest.daftar_berkas = daftar;
  manifest.urutan_pemulihan = urutan;
  tulis(join(tujuan, "database", "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Tabel: ${Object.keys(manifest.tabel).length} · baris: ${Object.values(manifest.tabel).reduce((a, b) => a + b, 0)} · berkas storage: ${manifest.berkas} (${(manifest.ukuran_berkas / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((e) => { console.error("Backup gagal:", e.message); process.exitCode = 1; }).finally(() => sql.end());
