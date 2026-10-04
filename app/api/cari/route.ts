import { NextResponse } from "next/server";
import { penggunaSaatIni } from "@/lib/auth";
import { sql } from "@/lib/db";

// Pencarian global: nama, NIP, nomor registrasi, nomor surat, isi OCR (PRD §12).
export async function GET(req: Request) {
  const p = await penggunaSaatIni();
  if (!p) return NextResponse.json([], { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const pola = `%${q}%`;
  const ts = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).map((w) => `${w}:*`).join(" & ");

  const [entri, pegawai, dokumen, berkas] = await Promise.all([
    sql`select e.id, e.kelas, e.nomor_registrasi, e.judul, coalesce(pg.nama_lengkap_gelar, e.nama_pegawai_bebas) as nama
      from entri e left join pegawai pg on pg.id = e.pegawai_id
      where e.diarsipkan_pada is null and (e.nomor_registrasi ilike ${pola} or e.judul ilike ${pola} or pg.nama_lengkap_gelar ilike ${pola}
        or pg.nip ilike ${pola} or e.nama_pegawai_bebas ilike ${pola} or e.nip_bebas ilike ${pola}
        ${ts ? sql`or e.cari @@ to_tsquery('simple', ${ts})` : sql``})
      order by e.created_at desc limit 8`,
    sql`select id, nama_lengkap_gelar, nip, unit_kerja, status_pegawai from pegawai
      where diarsipkan_pada is null and (nama_lengkap_gelar ilike ${pola} or nip ilike ${pola} or nip_lama ilike ${pola})
      order by nama_lengkap_gelar limit 6`,
    sql`select d.id, d.entri_id, d.nomor, d.judul, d.jenis_dokumen, e.nomor_registrasi from dokumen d join entri e on e.id = d.entri_id
      where d.nomor ilike ${pola} or d.judul ilike ${pola} order by d.created_at desc limit 5`,
    ts
      ? sql`select b.id, b.entri_id, b.nama_file, e.nomor_registrasi,
            ts_headline('simple', coalesce(b.teks_ocr, b.keterangan, ''), to_tsquery('simple', ${ts}), 'MaxWords=12,MinWords=5') as cuplikan
          from berkas b join entri e on e.id = b.entri_id
          where b.diarsipkan_pada is null and b.cari @@ to_tsquery('simple', ${ts}) limit 5`
      : Promise.resolve([]),
  ]);

  const hrefEntri = (kelas: string, id: string) => (kelas === "hukdis" ? `/kasus/${id}` : kelas === "informasi" ? `/informasi/${id}` : kelas === "arsip" ? `/arsip/${id}` : `/pembinaan/${id}`);

  return NextResponse.json([
    ...entri.map((e) => ({ jenis: "entri", id: e.id, judul: e.nama ? `${e.nama} — ${e.judul}` : e.judul, sub: e.nomor_registrasi, href: hrefEntri(e.kelas, e.id) })),
    ...pegawai.map((x) => ({ jenis: "pegawai", id: x.id, judul: x.nama_lengkap_gelar, sub: [x.nip, x.status_pegawai, x.unit_kerja].filter(Boolean).join(" · "), href: `/pegawai/${x.id}` })),
    ...dokumen.map((d) => ({ jenis: "dokumen", id: d.id, judul: d.nomor ? `${d.nomor}` : d.judul ?? d.jenis_dokumen, sub: `${d.judul ?? d.jenis_dokumen} · ${d.nomor_registrasi}`, href: `/kasus/${d.entri_id}?tab=dokumen` })),
    ...(berkas as Record<string, string>[]).map((b) => ({ jenis: "berkas", id: b.id, judul: b.nama_file, sub: `${b.nomor_registrasi} · …${String(b.cuplikan ?? "").replace(/<\/?b>/g, "")}…`, href: `/api/berkas/${b.id}` })),
  ]);
}
