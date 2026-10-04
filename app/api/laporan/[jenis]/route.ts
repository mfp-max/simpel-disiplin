import { NextResponse } from "next/server";
import { penggunaSaatIni } from "@/lib/auth";
import { catatAudit } from "@/lib/audit";
import { pengaturan } from "@/lib/pengaturan";
import { bacaFilter, cariLaporan, jalankanLaporan } from "@/lib/laporan";
import { bukuExcel, capWaktu, htmlCetak } from "@/lib/ekspor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ekspor laporan: ?format=xlsx (Excel) atau ?cetak=1 / ?format=cetak (tampilan cetak → PDF).
// Setiap ekspor dicatat di audit_log beserta filternya.
export async function GET(req: Request, { params }: { params: Promise<{ jenis: string }> }) {
  const p = await penggunaSaatIni();
  if (!p) return NextResponse.redirect(new URL("/masuk", req.url));
  const { jenis } = await params;
  const def = cariLaporan(jenis);
  if (!def) return new NextResponse("Laporan tidak ditemukan.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

  const url = new URL(req.url);
  const cetak = url.searchParams.get("cetak") === "1" || url.searchParams.get("format") === "cetak";
  const format = cetak ? "cetak" : "xlsx";
  const filter = bacaFilter(url.searchParams);
  if (def.wajibPegawai && !filter.pegawai) {
    return new NextResponse("Pilih pegawai terlebih dahulu.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const hasil = await jalankanLaporan(def.kode, filter);
  if (!hasil) return new NextResponse("Laporan tidak ditemukan.", { status: 404 });
  const waktu = new Date();
  const pengunduh = { nama: p.nama, email: p.email };

  await catatAudit(p, {
    aksi: "ekspor",
    tabel: "laporan",
    record_id: def.kode,
    ringkasan: {
      laporan: def.judul,
      format: cetak ? "pdf (tampilan cetak)" : "excel",
      filter,
      jumlah_baris: hasil.lembar.reduce((s, l) => s + l.baris.length, 0),
    },
  });

  const header = { "cache-control": "no-store, private", "x-robots-tag": "noindex" };
  if (format === "cetak") {
    const instansi = await pengaturan<string>("nama_instansi", "Universitas Negeri Malang");
    return new NextResponse(htmlCetak(def.judul, hasil, pengunduh, { instansi, waktu }), {
      headers: { ...header, "content-type": "text/html; charset=utf-8" },
    });
  }
  const buf = await bukuExcel(def.judul, hasil, pengunduh, waktu);
  const nama = `SIMPEL-${def.kode}-${capWaktu(waktu)}-RAHASIA.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      ...header,
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nama}"`,
    },
  });
}
