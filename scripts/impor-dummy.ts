// Mengimpor berkas dummy Simpega memakai lib/simpega (jalur yang sama dengan wizard impor).
// Pakai: npx tsx --env-file=.env.local scripts/impor-dummy.ts [path-berkas.xlsx] [--simulasi]

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { sql } from "../lib/db";
import { bacaWorkbook, kolomTerpetakan, petakanBaris } from "../lib/simpega/excel";
import { pecahBatch, tebakPemetaan, KOLOM_TERLARANG, kolomTerlarang } from "../lib/simpega/normalisasi";
import { BATAS_BATCH, mulaiRiwayat, prosesBatch, ringkasanAudit, selesaikanRiwayat, tambahHasilRiwayat } from "../lib/simpega/impor";

const BAWAAN = "C:/Users/TAKIT/Downloads/simpega.um.ac.id-laporan-rekap.xlsx";

async function main() {
  const args = process.argv.slice(2);
  const simulasi = args.includes("--simulasi");
  const path = args.find((a) => !a.startsWith("--")) ?? BAWAAN;
  const mulai = Date.now();

  const buf = readFileSync(path);
  const lembar = bacaWorkbook(new Uint8Array(buf));
  const pemetaan = tebakPemetaan(lembar.header);
  const kolom = kolomTerpetakan(lembar.header, pemetaan);
  console.log(`Berkas: ${basename(path)} — ${lembar.baris.length} baris, ${lembar.header.length} kolom`);
  console.log(`Kolom terlarang dilewati: ${lembar.header.filter((h) => kolomTerlarang(h)).length} dari ${KOLOM_TERLARANG.length} nama terlarang`);
  console.log("Pemetaan:", kolom.map((k) => `${k.indeks}:${k.header}→${k.field}`).join(", "));

  const baris = petakanBaris(lembar, pemetaan);
  const batch = pecahBatch(baris, BATAS_BATCH);
  const total = { baru: 0, diperbarui: 0, tanpaPerubahan: 0, ditolak: 0, dilewati: 0, unitBaru: new Set<string>() };
  const tolak: { baris: number; alasan: string }[] = [];

  const riwayatId = simulasi ? null : await mulaiRiwayat({ namaFile: basename(path), jumlahBaris: baris.length, kolom, sumber: "impor_excel", penggunaId: null });
  for (const [i, b] of batch.entries()) {
    const t = Date.now();
    const h = await prosesBatch(b, { sumber: "impor_excel", simulasi, penggunaId: null });
    if (riwayatId) await tambahHasilRiwayat(riwayatId, h);
    total.baru += h.baru;
    total.diperbarui += h.diperbarui;
    total.tanpaPerubahan += h.tanpaPerubahan;
    total.ditolak += h.ditolak.length;
    total.dilewati += h.dilewatiManual.length;
    h.unitBaru.forEach((u) => total.unitBaru.add(u));
    tolak.push(...h.ditolak);
    console.log(`  batch ${i + 1}/${batch.length}: ${b.length} baris — baru ${h.baru}, diperbarui ${h.diperbarui}, ditolak ${h.ditolak.length} (${Date.now() - t} ms)`);
  }

  if (riwayatId) {
    const r = await selesaikanRiwayat(riwayatId);
    await sql`insert into audit_log (user_id, email, aksi, tabel, record_id, ringkasan_perubahan)
      values (null, 'sistem', 'impor', 'pegawai', ${riwayatId}, ${sql.json({ ...ringkasanAudit(r), keterangan: "scripts/impor-dummy.ts" } as never)})`;
  }

  console.log(`\n${simulasi ? "SIMULASI — tidak ada yang ditulis.\n" : ""}Hasil: ${total.baru} baru, ${total.diperbarui} diperbarui (${total.tanpaPerubahan} tanpa perubahan), ${total.ditolak} ditolak, ${total.dilewati} baris dengan field dilewati karena disunting manual, ${total.unitBaru.size} unit kerja baru.`);
  for (const t of tolak) console.log(`  ditolak baris ${t.baris}: ${t.alasan}`);
  console.log(`Waktu: ${((Date.now() - mulai) / 1000).toFixed(1)} detik`);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
