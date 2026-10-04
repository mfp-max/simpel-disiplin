import { FileText } from "lucide-react";
import { penggunaSaatIni } from "@/lib/auth";
import { sql } from "@/lib/db";
import { tanggalPanjang, waktuPendek } from "@/lib/format";
import { judulDokumen } from "@/lib/dokumen/buat";
import { Lencana } from "@/components/simpel/lencana";
import { Panel } from "@/components/simpel/dasar";
import { AksiDokumen, TombolBuatDokumen } from "@/components/simpel/panel-dokumen-klien";

type BarisDokumen = {
  id: string; judul: string | null; nomor: string | null; tanggal: string | null; versi: number; status: string;
  template_id: string | null; pembuat: string | null; created_at: Date; kode_tahap: string | null;
};

/**
 * Panel dokumen sebuah kasus (PRD §7.3). Menampilkan template yang relevan
 * untuk tahap (dan rezim/tingkat kasus) beserta dokumen yang sudah dibuat.
 *   <PanelDokumen entriId={id} />                     semua dokumen kasus
 *   <PanelDokumen entriId={id} tahapKode="panggilan_1" ringkas />  di dalam kartu tahap
 */
export async function PanelDokumen({ entriId, tahapKode, ringkas = false }: { entriId: string; tahapKode?: string; ringkas?: boolean }) {
  const p = await penggunaSaatIni();
  if (!p) return null;

  const [e] = await sql`
    select e.id, e.rezim_kode, coalesce(h.snapshot_jenis_hukuman->>'tingkat_kode', th.kode) as tingkat_kode
    from entri e
    left join tingkat_hukuman th on th.id = e.tingkat_hukuman_dugaan_id
    left join lateral (select snapshot_jenis_hukuman from hukuman where entri_id = e.id order by created_at desc limit 1) h on true
    where e.id = ${entriId}`;
  if (!e) return null;

  const [template, tahap, dokumen] = await Promise.all([
    sql`select id, nama, tahap_kode from template_dokumen
      where aktif and diarsipkan_pada is null and versi_aktif_id is not null
        and (cardinality(rezim_kode) = 0 or ${e.rezim_kode ?? ""} = any(rezim_kode))
        and (cardinality(tingkat_kode) = 0 or ${e.tingkat_kode ?? ""} = any(tingkat_kode))
        ${tahapKode ? sql`and ${tahapKode} = any(tahap_kode)` : sql``}
      order by urutan, nama`,
    tahapKode
      ? sql`select id from tahapan_kasus where entri_id = ${entriId} and kode_tahap = ${tahapKode} order by urutan limit 1`
      : Promise.resolve([] as unknown as { id: string }[]),
    sql`select d.id, d.judul, d.nomor, d.tanggal, d.versi, d.status, d.template_id, d.created_at, u.nama as pembuat, t.kode_tahap
      from dokumen d
      left join app_users u on u.id = d.dibuat_oleh
      left join tahapan_kasus t on t.id = d.tahapan_id
      where d.entri_id = ${entriId} and d.diarsipkan_pada is null
      order by d.created_at desc`,
  ]);

  const tahapanId = (tahap[0]?.id as string | undefined) ?? null;
  const idTemplate = new Set(template.map((t) => t.id as string));
  const daftar = (dokumen as unknown as BarisDokumen[]).filter(
    (d) => !tahapKode || d.kode_tahap === tahapKode || (!d.kode_tahap && d.template_id && idTemplate.has(d.template_id)),
  );
  const urutanPanggilan = tahapKode === "panggilan_2" ? "II" : "I";
  const bolehBuat = p.hak.boleh_buat;
  const bolehUbah = p.hak.boleh_ubah;

  const tombol = bolehBuat && template.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {template.map((t) => (
        <TombolBuatDokumen
          key={t.id}
          entriId={entriId}
          templateId={t.id}
          tahapanId={tahapanId}
          label={tahapKode ? judulDokumen(t.nama, { urutan_panggilan: urutanPanggilan }) : t.nama}
        />
      ))}
    </div>
  );

  const isi = (
    <div className="space-y-4">
      {tombol}
      {!ringkas && bolehBuat && template.length === 0 && (
        <p className="text-sm text-muted-foreground">Belum ada template aktif untuk {tahapKode ? "tahap ini" : "kasus ini"}. Admin dapat menambahkannya di Pengaturan → Template Dokumen.</p>
      )}
      {daftar.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {daftar.map((d) => (
            <li key={d.id} className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="font-medium">{d.judul ?? "Dokumen"}</span>
                  {d.versi > 1 && <Lencana>v{d.versi}</Lencana>}
                  <Lencana warna={d.status === "draf" ? "waspada" : "aman"}>{d.status === "draf" ? "Draf" : d.status === "final" ? "Final" : "Ditandatangani"}</Lencana>
                </div>
                <p className="text-sm text-muted-foreground">
                  {[d.nomor ? `Nomor ${d.nomor}` : "Tanpa nomor", d.tanggal ? tanggalPanjang(d.tanggal) : null].filter(Boolean).join(" · ")}
                </p>
                <p className="text-xs text-muted-foreground">Dibuat {d.pembuat ? `oleh ${d.pembuat} ` : ""}· {waktuPendek(d.created_at)}</p>
              </div>
              <AksiDokumen dokumen={{ id: d.id, judul: d.judul ?? "Dokumen", status: d.status, dariTemplate: !!d.template_id }} bolehBuat={bolehBuat} bolehUbah={bolehUbah} />
            </li>
          ))}
        </ul>
      ) : (
        !ringkas && <p className="text-sm text-muted-foreground">Belum ada dokumen yang dibuat.</p>
      )}
    </div>
  );

  if (ringkas) return isi;
  return (
    <Panel judul="Dokumen" deskripsi="Dokumen bersifat rahasia. Setiap pembuatan, pengunduhan, dan pencetakan tercatat di log audit.">
      {isi}
    </Panel>
  );
}
