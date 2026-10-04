// Mengisi data awal SIMPEL. Aman dijalankan berulang (idempoten): baris yang
// sudah ada tidak ditimpa, sehingga suntingan admin tidak pernah hilang.
// Pakai: npm run db:seed            (data aturan & referensi)
//        npm run db:seed -- template (unggah 17 template .docx dari templates-sumber/)
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sql } from "../lib/db";
import { simpanDefinisi, simpanTerkait } from "../lib/regulasi/simpan";
import { DEFINISI_AWAL } from "../supabase/seed/regulasi";
import * as R from "../supabase/seed/referensi";
import { KATALOG_PLACEHOLDER, TEMPLATE_AWAL } from "../lib/dokumen/katalog";
import { pastikanBucket, unggahBerkas } from "../lib/penyimpanan";
import { pindaiPlaceholder, petakanOtomatis } from "../lib/dokumen/template";

const ADMIN_EMAIL = process.env.SIMPEL_ADMIN_EMAIL || "mfajarivanpratama@um.ac.id";

async function referensi() {
  for (const p of R.PERAN) {
    await sql`insert into peran ${sql(p)} on conflict (kode) do nothing`;
  }
  for (const r of R.REZIM) await sql`insert into rezim ${sql(r)} on conflict (kode) do nothing`;
  for (const p of R.PEMETAAN_STATUS) await sql`insert into pemetaan_status_pegawai ${sql(p)} on conflict (status_pegawai) do nothing`;
  for (const k of R.KELAS_ENTRI) await sql`insert into kelas_entri ${sql(k)} on conflict (kode) do nothing`;
  for (const s of R.STATUS_KASUS) await sql`insert into status_kasus ${sql(s)} on conflict (kode) do nothing`;
  for (const k of R.KODE_REFERENSI) await sql`insert into kode_referensi ${sql(k)} on conflict (kategori, kode) do nothing`;
  for (const g of R.GOLONGAN_RUANG) await sql`insert into golongan_ruang ${sql(g)} on conflict (kode) do nothing`;
  for (const p of R.PENGATURAN) {
    await sql`insert into pengaturan (kunci, nilai, label, kelompok, keterangan, urutan)
      values (${p.kunci}, ${sql.json(p.nilai as never)}, ${p.label}, ${p.kelompok}, ${p.keterangan ?? null}, ${p.urutan})
      on conflict (kunci) do nothing`;
  }
  for (const h of R.HARI_LIBUR) {
    await sql`insert into hari_libur (tanggal, nama, jenis, keterangan) values (${h.tanggal}, ${h.nama}, ${h.jenis}, ${h.keterangan ?? null})
      on conflict (tanggal) do nothing`;
  }
  const [{ n }] = await sql`select count(*)::int as n from pertanyaan_baku`;
  if (n === 0) for (const q of R.PERTANYAAN_BAKU) await sql`insert into pertanyaan_baku ${sql(q)}`;

  let i = 0;
  for (const p of KATALOG_PLACEHOLDER) {
    i += 1;
    await sql`insert into template_placeholder (kode, label, kelompok, jenis, sumber, deskripsi, contoh, field, urutan)
      values (${p.kode}, ${p.label}, ${p.kelompok}, ${p.jenis ?? "teks"}, ${p.sumber ?? "bawaan"}, ${p.deskripsi ?? null},
        ${p.contoh ?? null}, ${p.field ? sql.json(p.field as never) : null}, ${i})
      on conflict (kode) do nothing`;
  }

  await sql`insert into app_users (email, nama, jabatan, peran_kode)
    values (${ADMIN_EMAIL}, 'Admin SIMPEL', 'Kepala Seksi Kinerja, Disiplin, dan Sistem Informasi SDM', 'admin')
    on conflict do nothing`;
  console.log("✓ referensi, pengaturan, hari libur, pertanyaan baku, katalog placeholder, admin");
}

async function regulasi() {
  for (const def of DEFINISI_AWAL) {
    const [ada] = await sql`select id from regulasi where kode = ${def.regulasi.kode}`;
    if (ada) {
      console.log(`· ${def.regulasi.kode} sudah ada — dilewati`);
      continue;
    }
    await sql.begin(async (tx) => {
      const h = await simpanDefinisi(tx as never, def);
      h.peringatan.forEach((p) => console.log(`  ! ${p}`));
    });
    console.log(`✓ ${def.regulasi.kode}`);
  }
  for (const def of DEFINISI_AWAL) {
    const p = await simpanTerkait(sql, def);
    p.forEach((x) => console.log(`  ! ${x}`));
  }
  // Tautan "digantikan oleh" (kebalikan dari menggantikan_id)
  await sql`update regulasi r set digantikan_oleh_id = b.id from regulasi b
            where b.menggantikan_id = r.id and r.digantikan_oleh_id is null`;
}

async function template() {
  await pastikanBucket();
  let urutan = 0;
  for (const t of TEMPLATE_AWAL) {
    urutan += 1;
    const path = join(process.cwd(), "templates-sumber", `${t.kode}.docx`);
    if (!existsSync(path)) {
      console.log(`! templates-sumber/${t.kode}.docx belum ada — dilewati`);
      continue;
    }
    const [ada] = await sql`select id from template_dokumen where kode = ${t.kode}`;
    if (ada) {
      console.log(`· template ${t.kode} sudah ada — dilewati`);
      continue;
    }
    const isi = readFileSync(path);
    const placeholder = pindaiPlaceholder(isi);
    const katalog = await sql`select kode, jenis from template_placeholder where aktif`;
    const pemetaan = petakanOtomatis(placeholder, katalog as never);
    const filePath = `template/${t.kode}/v1-${t.kode}.docx`;
    await unggahBerkas(filePath, isi, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    await sql.begin(async (tx) => {
      const [tpl] = await tx`insert into template_dokumen (kode, nama, jenis_dokumen, rezim_kode, tahap_kode, urutan)
        values (${t.kode}, ${t.nama}, ${t.jenis}, ${[...t.rezim]}, ${[...t.tahap]}, ${urutan}) returning id`;
      const [v] = await tx`insert into template_versi (template_id, versi, file_path, nama_file, ukuran, placeholder, pemetaan, catatan)
        values (${tpl.id}, 1, ${filePath}, ${`${t.kode}.docx`}, ${isi.length}, ${tx.json(placeholder as never)},
          ${tx.json(pemetaan as never)}, 'Template dasar bawaan SIMPEL') returning id`;
      await tx`update template_dokumen set versi_aktif_id = ${v.id} where id = ${tpl.id}`;
    });
    console.log(`✓ template ${t.kode} (${placeholder.length} placeholder)`);
  }
}

async function main() {
  const mode = process.argv[2] ?? "data";
  try {
    if (mode === "data" || mode === "semua") {
      await referensi();
      await regulasi();
      await pastikanBucket();
      console.log("✓ bucket penyimpanan privat");
    }
    if (mode === "template" || mode === "semua") await template();
    console.log("Seed selesai.");
  } catch (e) {
    console.error("Seed gagal:", (e as Error).message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
