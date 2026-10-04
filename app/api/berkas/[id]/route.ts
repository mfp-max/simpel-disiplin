import { NextResponse } from "next/server";
import { penggunaSaatIni } from "@/lib/auth";
import { sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { urlTertanda } from "@/lib/penyimpanan";

// Membuka/mengunduh lampiran: periksa login → catat audit → alihkan ke signed URL ≤ 5 menit.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await penggunaSaatIni();
  if (!p) return NextResponse.redirect(new URL("/masuk", req.url));
  const { id } = await params;
  const [b] = await sql`select id, entri_id, nama_file, file_path, kategori from berkas where id = ${id}`;
  if (!b) return new NextResponse("Berkas tidak ditemukan", { status: 404 });
  const unduh = new URL(req.url).searchParams.get("unduh") === "1";
  await catatAudit(p, { aksi: unduh ? "unduh" : "lihat", tabel: "berkas", record_id: b.id, entri_id: b.entri_id, ringkasan: { nama_file: b.nama_file, kategori: b.kategori } });
  const url = await urlTertanda(b.file_path, unduh ? { unduhSebagai: b.nama_file } : {});
  return NextResponse.redirect(url);
}
