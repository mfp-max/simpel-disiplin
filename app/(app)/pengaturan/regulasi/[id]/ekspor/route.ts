import { NextResponse } from "next/server";
import { penggunaSaatIni } from "@/lib/auth";
import { sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { eksporDefinisi } from "@/lib/regulasi/simpan";

export const dynamic = "force-dynamic";

/** Ekspor definisi peraturan sebagai satu berkas JSON (PRD §18.6). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await penggunaSaatIni();
  if (!p) return NextResponse.redirect(new URL("/masuk", req.url));
  if (!p.hak.kelola_pengaturan) return new NextResponse("Anda tidak memiliki hak untuk mengekspor definisi peraturan.", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Peraturan tidak ditemukan", { status: 404 });
  const [ada] = await sql`select id from regulasi where id = ${id}`;
  if (!ada) return new NextResponse("Peraturan tidak ditemukan", { status: 404 });
  const def = await eksporDefinisi(sql, id);
  await catatAudit(p, { aksi: "ekspor", tabel: "regulasi", record_id: id, ringkasan: { regulasi_id: id, kode: def.regulasi.kode, format: def.format } });
  const nama = `definisi-${def.regulasi.kode.replace(/[^A-Za-z0-9_.-]+/g, "_")}.json`;
  return new NextResponse(JSON.stringify(def, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nama}"`,
      "Cache-Control": "no-store",
    },
  });
}
