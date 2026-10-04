import { NextResponse } from "next/server";
import { penggunaSaatIni } from "@/lib/auth";
import { catatAudit } from "@/lib/audit";
import { pesanGalat } from "@/lib/galat";
import { unggahBerkas, urlTertanda } from "@/lib/penyimpanan";
import { buatEksporPenuh, POLA_NAMA_EKSPOR, PREFIX_EKSPOR } from "@/lib/ekspor";

// Ekspor penuh satu tombol (PRD §18.9, kriteria 20) — khusus admin (kelola_pengaturan).
// POST: menyusun ZIP (seluruh tabel JSON + seluruh berkas), mengunggahnya ke
//       penyimpanan privat `ekspor/…`, dan mengalirkan kemajuan sebagai NDJSON.
//       Respons Vercel dibatasi 4,5 MB sehingga ZIP tidak dikirim langsung;
//       pengguna menerima signed URL (≤ 5 menit).
// GET ?berkas=<nama>: unduh ulang arsip lama lewat signed URL baru.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function tolak(pesan: string, status: number) {
  return NextResponse.json({ galat: pesan }, { status });
}

export async function POST(req: Request) {
  const p = await penggunaSaatIni();
  if (!p) return tolak("Sesi Anda telah berakhir. Silakan masuk kembali.", 401);
  if (!p.hak.kelola_pengaturan) return tolak("Anda tidak memiliki hak untuk melakukan tindakan ini.", 403);
  // Lindungi dari permintaan lintas situs
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) {
    return tolak("Permintaan tidak sah.", 403);
  }

  const enc = new TextEncoder();
  const aliran = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const kirim = (o: Record<string, unknown>) => {
        try {
          ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        } catch {
          // klien sudah menutup koneksi — proses tetap diselesaikan
        }
      };
      try {
        const hasil = await buatEksporPenuh({
          pengunduh: { nama: p.nama, email: p.email },
          progres: (x) => kirim({ jenis: "progres", ...x }),
          simpan: async (nama, isi) => {
            await unggahBerkas(`${PREFIX_EKSPOR}/${nama}`, isi, "application/zip");
          },
        });
        await catatAudit(p, {
          aksi: "ekspor",
          tabel: "ekspor_penuh",
          record_id: hasil.stempel,
          ringkasan: {
            keterangan: "Ekspor penuh seluruh data dan berkas",
            bagian: hasil.bagian.map((b) => ({ nama: b.nama, ukuran: b.ukuran, berkas: b.jumlahBerkas })),
            jumlah_tabel: hasil.jumlahTabel,
            jumlah_baris: hasil.jumlahBaris,
            jumlah_berkas: hasil.jumlahBerkas,
            berkas_gagal: hasil.berkasGagal.length,
          },
        });
        const tautan = await Promise.all(
          hasil.bagian.map(async (b) => ({ ...b, url: await urlTertanda(`${PREFIX_EKSPOR}/${b.nama}`, { unduhSebagai: b.nama }) })),
        );
        kirim({ jenis: "selesai", bagian: tautan, jumlahTabel: hasil.jumlahTabel, jumlahBaris: hasil.jumlahBaris, jumlahBerkas: hasil.jumlahBerkas, berkasGagal: hasil.berkasGagal.length });
      } catch (e) {
        console.error("[SIMPEL] ekspor penuh", e);
        kirim({ jenis: "galat", pesan: pesanGalat(e) === "Gagal menyimpan. Periksa sambungan internet Anda lalu coba lagi." ? "Ekspor penuh gagal disusun. Coba lagi beberapa saat lagi; bila tetap gagal, hubungi pengelola aplikasi." : pesanGalat(e) });
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(aliran, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}

export async function GET(req: Request) {
  const p = await penggunaSaatIni();
  if (!p) return NextResponse.redirect(new URL("/masuk", req.url));
  if (!p.hak.kelola_pengaturan) return NextResponse.redirect(new URL("/beranda?galat=hak", req.url));
  const nama = new URL(req.url).searchParams.get("berkas") ?? "";
  if (!POLA_NAMA_EKSPOR.test(nama)) return new NextResponse("Nama arsip tidak valid.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  await catatAudit(p, { aksi: "unduh", tabel: "ekspor_penuh", record_id: nama, ringkasan: { keterangan: "Unduh ulang arsip ekspor penuh", berkas: nama } });
  try {
    return NextResponse.redirect(await urlTertanda(`${PREFIX_EKSPOR}/${nama}`, { unduhSebagai: nama }));
  } catch {
    return new NextResponse("Arsip tidak ditemukan atau sudah dihapus.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
