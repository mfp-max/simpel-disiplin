// Data simulasi alur SIMPEL dari baris perintah (versi tombol: Pengaturan → Data simulasi).
//
//   npm run simulasi                     → uji kering semua skenario (dibatalkan, tidak tersimpan)
//   npm run simulasi -- --simpan         → simpan ke basis data di .env.local
//   npm run simulasi -- S3 S4            → hanya skenario tertentu
//   npm run simulasi -- --arsipkan       → arsipkan semua data simulasi
//   npm run simulasi -- --lokal          → penyimpanan berkas di folder lokal (untuk basis data uji lokal);
//                                          template dibaca dari templates-sumber/
//
// Salinan setiap dokumen .docx ditulis ke simulasi-keluaran/<skenario>/ untuk diperiksa di Word.
import * as fs from "node:fs";
import * as path from "node:path";
import { sql } from "../lib/db";
import { SKENARIO, arsipkanSimulasi, jalankanSkenario, type Penyimpanan } from "../lib/simulasi";

const arg = process.argv.slice(2);
const SIMPAN = arg.includes("--simpan");
const LOKAL = arg.includes("--lokal");
const PILIH = arg.filter((a) => /^S\d+$/.test(a));
const ROOT = path.resolve(__dirname, "..");
const KELUARAN = path.join(ROOT, "simulasi-keluaran");

const lokal: Penyimpanan = {
  unggah: async (p, isi) => {
    const f = path.join(KELUARAN, "_penyimpanan", p);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, isi);
  },
  unduh: async (p) => fs.readFileSync(path.join(ROOT, "templates-sumber", `${p.split("/")[1]}.docx`)),
  hapus: async () => {},
};

async function main() {
  const [u] = await sql`select id, email, nama from app_users where aktif order by (peran_kode = 'admin') desc, created_at limit 1`;
  if (!u) throw new Error("Belum ada pengguna aktif di app_users.");
  const pengguna = { id: u.id as string, email: u.email as string, nama: (u.nama as string) ?? u.email };
  if (arg.includes("--arsipkan")) return console.log(`${await arsipkanSimulasi(pengguna)} entri simulasi diarsipkan.`);

  console.log(`${SIMPAN ? "MENYIMPAN" : "UJI KERING (tidak disimpan)"} — atas nama ${pengguna.nama} <${pengguna.email}>\n`);
  fs.rmSync(KELUARAN, { recursive: true, force: true });
  let gagal = 0;
  for (const s of SKENARIO) {
    if (PILIH.length && !PILIH.includes(s.kode)) continue;
    const r = await jalankanSkenario(s.kode, {
      pengguna, simpan: SIMPAN, penyimpanan: LOKAL ? lokal : undefined, log: console.log,
      salin: (kode, nama, isi) => {
        fs.mkdirSync(path.join(KELUARAN, kode), { recursive: true });
        fs.writeFileSync(path.join(KELUARAN, kode, nama), isi);
      },
    });
    if (r.dilewati) console.log(`■ ${s.kode} dilewati — sudah ada (${r.nomor})`);
    if (!r.ok) gagal += 1;
    console.log("");
  }
  console.log(gagal ? `✗ ${gagal} skenario gagal` : `✓ Semua skenario berhasil${SIMPAN ? " dan tersimpan" : " (uji kering — tidak ada yang tersimpan)"}.`);
  console.log(`Salinan dokumen: ${path.relative(process.cwd(), KELUARAN)}${path.sep}`);
  process.exitCode = gagal ? 1 : 0;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => sql.end({ timeout: 5 }));
