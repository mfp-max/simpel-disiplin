import { NextResponse } from "next/server";
import { penggunaSaatIni } from "@/lib/auth";
import { sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { unduhBerkas } from "@/lib/penyimpanan";
import { MIME_DOCX } from "@/lib/dokumen/buat";

export const dynamic = "force-dynamic";

// Unduh berkas asli sebuah versi template (khusus admin). Versi lama tetap tersimpan selamanya.
export async function GET(req: Request, { params }: { params: Promise<{ versiId: string }> }) {
  const p = await penggunaSaatIni();
  if (!p) return NextResponse.redirect(new URL("/masuk", req.url));
  if (!p.hak.kelola_pengaturan) return new NextResponse("Anda tidak memiliki hak untuk mengunduh template.", { status: 403 });
  const { versiId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(versiId)) return new NextResponse("Versi template tidak ditemukan", { status: 404 });
  const [v] = await sql`select v.id, v.versi, v.file_path, v.nama_file, t.kode, t.nama from template_versi v join template_dokumen t on t.id = v.template_id where v.id = ${versiId}`;
  if (!v) return new NextResponse("Versi template tidak ditemukan", { status: 404 });
  await catatAudit(p, { aksi: "unduh", tabel: "template_versi", record_id: v.id, ringkasan: { template: v.kode, versi: v.versi } });
  let isi: Buffer;
  try {
    isi = await unduhBerkas(v.file_path);
  } catch {
    return new NextResponse("Berkas template tidak dapat dibaca.", { status: 502 });
  }
  const nama = `Template ${v.nama.replace(/[\\/:*?"<>|]+/g, "-")} v${v.versi}.docx`;
  return new NextResponse(new Uint8Array(isi), {
    headers: {
      "Content-Type": MIME_DOCX,
      "Content-Disposition": `attachment; filename="${nama.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(nama)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
