import { NextResponse } from "next/server";
import { penggunaSaatIni } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const p = await penggunaSaatIni();
  if (!p) return NextResponse.json([], { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const pola = `%${q}%`;
  const rows = await sql`
    select id, nip, nama_lengkap_gelar, unit_kerja, status_pegawai, golongan_ruang,
      coalesce(nullif(jabatan_tambahan, ''), nullif(jabatan_fungsional, ''), jenis_pegawai) as jabatan, rezim_kode
    from pegawai
    where diarsipkan_pada is null and (nama_lengkap_gelar ilike ${pola} or nama_tanpa_gelar ilike ${pola} or nip ilike ${pola} or nip_lama ilike ${pola})
    order by (nip = ${q}) desc, nama_lengkap_gelar limit 15`;
  return NextResponse.json(rows);
}
