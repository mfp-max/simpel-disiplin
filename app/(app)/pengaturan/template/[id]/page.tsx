import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JudulHalaman, Kosong, Panel } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { referensi } from "@/lib/pengaturan";
import { labelKode, ukuranBerkas, waktuPendek } from "@/lib/format";
import { muatKatalog } from "@/lib/dokumen/buat";
import type { Pemetaan, PlaceholderTemplate } from "@/lib/dokumen/template";
import { saranKode } from "../_util";
import { ContekanSintaks } from "../_contekan";
import { AksiVersi, EditorPemetaan, FormMetadata, UnggahVersi, type BarisPemetaan, type GrupKatalog } from "../template_klien";

export const metadata = { title: "Detail template" };

type Versi = {
  id: string; versi: number; nama_file: string | null; ukuran: number | null; placeholder: PlaceholderTemplate[]; pemetaan: Pemetaan;
  catatan: string | null; created_at: Date; pembuat: string | null; jumlah_dokumen: number;
};

export default async function DetailTemplate({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ versi?: string }> }) {
  await wajibHalamanHak("kelola_pengaturan");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [t] = await sql`select * from template_dokumen where id = ${id}`;
  if (!t) notFound();

  const [versiRows, katalog, jenis, rezim, tingkat, tahap] = await Promise.all([
    sql`select v.id, v.versi, v.nama_file, v.ukuran, v.placeholder, v.pemetaan, v.catatan, v.created_at, u.nama as pembuat,
        (select count(*)::int from dokumen d where d.template_versi_id = v.id) as jumlah_dokumen
      from template_versi v left join app_users u on u.id = v.created_by where v.template_id = ${id} order by v.versi desc`,
    muatKatalog(),
    referensi("jenis_dokumen"),
    sql`select kode, nama from rezim where aktif order by urutan, kode`,
    sql`select kode, min(nama) as nama, min(urutan) as u from tingkat_hukuman where aktif group by kode order by min(urutan), kode`,
    sql`select kode_tahap as kode, min(nama) as nama, min(urutan) as u from aturan_tahapan where aktif group by kode_tahap order by min(urutan)`,
  ]);
  const versi = versiRows as unknown as Versi[];
  const terpilih = versi.find((v) => v.id === sp.versi) ?? versi.find((v) => v.id === t.versi_aktif_id) ?? versi[0] ?? null;

  const kodeKatalog = [...katalog.keys()];
  const baris: BarisPemetaan[] = (terpilih?.placeholder ?? []).map((ph) => {
    const k = katalog.get(ph.kode);
    const pm = terpilih?.pemetaan?.[ph.kode];
    const sumber = pm?.sumber === "katalog" ? katalog.get(pm.katalog) : k;
    let fieldBermasalah: BarisPemetaan["fieldBermasalah"] = [];
    if (sumber?.jenis === "loop") {
      const kolom = (sumber.field ?? []).map((f) => f.kode);
      fieldBermasalah = ph.field.filter((f) => !kolom.includes(f)).map((f) => ({ field: f, saran: saranKode(f, kolom) }));
    } else if (sumber && ph.field.length) {
      // bagian bersyarat: penanda di dalamnya harus kode katalog
      fieldBermasalah = ph.field.filter((f) => !katalog.has(f)).map((f) => ({ field: f, saran: saranKode(f, kodeKatalog) }));
    }
    return { kode: ph.kode, jenis: ph.jenis, field: ph.field, dikenal: !!k, saran: k ? null : saranKode(ph.kode, kodeKatalog), fieldBermasalah };
  });

  const grup = new Map<string, GrupKatalog["item"]>();
  for (const k of katalog.values()) {
    if (!grup.has(k.kelompok)) grup.set(k.kelompok, []);
    grup.get(k.kelompok)!.push({ kode: k.kode, label: k.label, jenis: k.jenis });
  }
  const katalogGrup: GrupKatalog[] = [...grup.entries()].map(([kelompok, item]) => ({ kelompok, item }));
  const tahapOpsi = [
    ...tahap.map((x) => ({ kode: x.kode as string, label: x.nama as string })),
    ...(t.tahap_kode as string[]).filter((k) => !tahap.some((x) => x.kode === k)).map((k) => ({ kode: k, label: labelKode(k) })),
  ];

  return (
    <>
      <JudulHalaman
        judul={t.nama}
        deskripsi={<>Kode <code className="font-mono">{t.kode}</code>. Dokumen baru selalu memakai versi aktif; dokumen lama tetap terikat pada versinya sendiri.</>}
        kembali={{ href: "/pengaturan/template", label: "Template dokumen" }}
        lencana={t.aktif ? <Lencana warna="aman">Aktif</Lencana> : <Lencana warna="lewat">Nonaktif</Lencana>}
        aksi={
          <Button asChild variant="outline">
            <Link href="/pengaturan/template/placeholder"><ListChecks aria-hidden /> Katalog placeholder</Link>
          </Button>
        }
      />
      <div className="space-y-5">
        <Panel judul="Versi berkas" deskripsi="Versi tidak dapat diubah atau dihapus. Untuk memperbaiki template, unggah versi baru.">
          <div className="space-y-4">
            <UnggahVersi templateId={id} />
            {versi.length === 0 ? (
              <Kosong judul="Belum ada versi" deskripsi="Unggah berkas .docx yang sudah diberi penanda {placeholder}." />
            ) : (
              <ul className="divide-y rounded-lg border">
                {versi.map((v) => {
                  const aktif = v.id === t.versi_aktif_id;
                  return (
                    <li key={v.id} className={`flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between ${terpilih?.id === v.id ? "bg-accent/40" : ""}`}>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">Versi {v.versi}</span>
                          {aktif && <Lencana warna="aman">Aktif</Lencana>}
                          {v.jumlah_dokumen > 0 && <Lencana>{v.jumlah_dokumen} dokumen</Lencana>}
                          <Lencana>{v.placeholder?.length ?? 0} placeholder</Lencana>
                        </div>
                        <p className="break-all text-sm text-muted-foreground">{v.nama_file ?? "—"} · {ukuranBerkas(v.ukuran)}</p>
                        <p className="text-xs text-muted-foreground">Diunggah {v.pembuat ? `oleh ${v.pembuat} ` : ""}· {waktuPendek(v.created_at)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/pengaturan/template/${id}?versi=${v.id}#pemetaan`} scroll={false}>Pemetaan</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <a href={`/api/dokumen/template/${v.id}`}><Download aria-hidden /> Unduh</a>
                        </Button>
                        <AksiVersi templateId={id} versiId={v.id} aktif={aktif} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Panel>

        {terpilih && (
          <Panel id="pemetaan" judul={`Pemetaan placeholder — versi ${terpilih.versi}`} deskripsi={`${baris.length} penanda ditemukan saat pemindaian berkas.`}>
            <EditorPemetaan
              key={terpilih.id}
              versiId={terpilih.id}
              versi={terpilih.versi}
              terkunci={terpilih.jumlah_dokumen > 0}
              jumlahDokumen={terpilih.jumlah_dokumen}
              baris={baris}
              katalog={katalogGrup}
              awal={terpilih.pemetaan ?? {}}
            />
          </Panel>
        )}

        <Panel judul="Pengaturan template" deskripsi="Menentukan di kasus dan tahap mana template ini ditawarkan.">
          <FormMetadata
            id={id}
            awal={{ nama: t.nama, jenis_dokumen: t.jenis_dokumen, rezim_kode: t.rezim_kode, tingkat_kode: t.tingkat_kode, tahap_kode: t.tahap_kode, aktif: t.aktif, keterangan: t.keterangan }}
            jenis={jenis.map((j) => ({ kode: j.kode, label: j.label }))}
            rezim={rezim.map((r) => ({ kode: r.kode as string, label: `${r.kode} — ${r.nama}` }))}
            tingkat={tingkat.map((r) => ({ kode: r.kode as string, label: labelKode(r.nama as string) }))}
            tahap={tahapOpsi}
          />
        </Panel>

        <ContekanSintaks />
      </div>
    </>
  );
}
