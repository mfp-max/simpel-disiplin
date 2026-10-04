import { NextResponse } from "next/server";
import { penggunaSaatIni } from "@/lib/auth";
import { sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { urlTertanda, UMUR_URL_DETIK } from "@/lib/penyimpanan";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Memutar/mengunduh rekaman pemeriksaan (PRD §9.1 butir 4 & 6):
// periksa login → catat audit "putar"/"unduh" → alihkan ke signed URL ≤ 300 detik. Tidak ada URL publik.
export async function GET(req: Request, { params }: { params: Promise<{ sesi: string }> }) {
  const p = await penggunaSaatIni();
  if (!p) return NextResponse.redirect(new URL("/masuk", req.url));
  const { sesi } = await params;
  if (!UUID.test(sesi)) return new NextResponse("Rekaman tidak ditemukan", { status: 404 });
  const [s] = await sql`select s.id, s.entri_id, s.urutan, s.rekaman_path, s.rekaman_dihapus_pada, e.nomor_registrasi
    from sesi_pemeriksaan s join entri e on e.id = s.entri_id where s.id = ${sesi}`;
  if (!s || !s.rekaman_path || s.rekaman_dihapus_pada) return new NextResponse("Rekaman tidak tersedia atau sudah dihapus sesuai masa retensi.", { status: 404 });
  const unduh = new URL(req.url).searchParams.get("unduh") === "1";
  await catatAudit(p, {
    aksi: unduh ? "unduh" : "putar", tabel: "sesi_pemeriksaan", record_id: s.id, entri_id: s.entri_id,
    ringkasan: { berkas: "rekaman pemeriksaan", sesi_urutan: s.urutan },
  });
  const nama = `rekaman-pemeriksaan-${String(s.nomor_registrasi).replace(/[^\w-]+/g, "-")}-sesi-${s.urutan}.webm`;
  const url = await urlTertanda(s.rekaman_path, { detik: Math.min(UMUR_URL_DETIK, 300), ...(unduh ? { unduhSebagai: nama } : {}) });
  const res = NextResponse.redirect(url);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
