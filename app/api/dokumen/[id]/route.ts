import { NextResponse } from "next/server";
import { penggunaSaatIni } from "@/lib/auth";
import { sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { unduhBerkas, urlTertanda } from "@/lib/penyimpanan";
import { MIME_DOCX, namaBerkasUnduh, renderUlangPersis } from "@/lib/dokumen/buat";

export const dynamic = "force-dynamic";

// Dokumen hasil pembangkit. Periksa login → catat audit → kirim berkas .docx.
//   ?mode=unduh         (bawaan) unduh berkas tersimpan
//   ?mode=cetak         berkas tersimpan untuk pratinjau/cetak di peramban
//   ?mode=persis        unduh hasil render ulang dari salinan beku (snapshot_data + template_versi_id)
//   ?mode=persis-cetak  render ulang dari salinan beku untuk dicetak
const BATAS_ALIRAN = 4 * 1024 * 1024; // di atas ini dialihkan ke signed URL ≤ 5 menit

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await penggunaSaatIni();
  if (!p) return NextResponse.redirect(new URL("/masuk", req.url));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Dokumen tidak ditemukan", { status: 404 });
  const [d] = await sql`select d.id, d.entri_id, d.judul, d.nomor, d.versi, d.status, d.file_path, d.template_versi_id, e.nomor_registrasi
    from dokumen d join entri e on e.id = d.entri_id where d.id = ${id}`;
  if (!d) return new NextResponse("Dokumen tidak ditemukan", { status: 404 });

  const mode = new URL(req.url).searchParams.get("mode") ?? "unduh";
  const persis = mode === "persis" || mode === "persis-cetak";
  const cetak = mode === "cetak" || mode === "persis-cetak";
  const nama = namaBerkasUnduh(d.nomor_registrasi, d.judul ?? "Dokumen", d.versi);

  await catatAudit(p, {
    aksi: cetak ? "cetak" : "unduh", tabel: "dokumen", record_id: d.id, entri_id: d.entri_id,
    ringkasan: { judul: d.judul, nomor: d.nomor, versi: d.versi, status: d.status, mode, nama_file: nama },
  });

  let isi: Buffer;
  try {
    if (persis) {
      isi = await renderUlangPersis(d.id);
    } else {
      if (!d.file_path) return new NextResponse("Berkas dokumen tidak tersedia", { status: 404 });
      isi = await unduhBerkas(d.file_path);
      if (isi.length > BATAS_ALIRAN && !cetak) return NextResponse.redirect(await urlTertanda(d.file_path, { unduhSebagai: nama }));
    }
  } catch {
    return new NextResponse("Berkas dokumen tidak dapat dibaca. Coba lagi beberapa saat lagi.", { status: 502 });
  }

  return new NextResponse(new Uint8Array(isi), {
    headers: {
      "Content-Type": MIME_DOCX,
      "Content-Disposition": `${cetak ? "inline" : "attachment"}; filename="${nama.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(nama)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
