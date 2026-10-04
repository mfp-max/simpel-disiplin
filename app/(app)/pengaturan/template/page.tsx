import Link from "next/link";
import { ChevronRight, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JudulHalaman, Kosong } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { referensi } from "@/lib/pengaturan";
import { labelKode } from "@/lib/format";
import { ContekanSintaks } from "./_contekan";
import { TambahTemplate } from "./template_klien";

export const metadata = { title: "Template dokumen" };

type Baris = {
  id: string; kode: string; nama: string; jenis_dokumen: string; rezim_kode: string[]; tingkat_kode: string[]; tahap_kode: string[];
  aktif: boolean; versi_aktif: number | null; jumlah_placeholder: number | null; jumlah_versi: number; jumlah_dokumen: number;
};

function rezimTeks(r: string[]) {
  return r.length ? r.map((x) => `Rezim ${x}`).join(", ") : "Semua rezim";
}

export default async function HalamanTemplate() {
  await wajibHalamanHak("kelola_pengaturan");
  const [rows, jenis] = await Promise.all([
    sql`select t.id, t.kode, t.nama, t.jenis_dokumen, t.rezim_kode, t.tingkat_kode, t.tahap_kode, t.aktif,
        v.versi as versi_aktif, jsonb_array_length(v.placeholder) as jumlah_placeholder,
        (select count(*)::int from template_versi x where x.template_id = t.id) as jumlah_versi,
        (select count(*)::int from dokumen d where d.template_id = t.id) as jumlah_dokumen
      from template_dokumen t left join template_versi v on v.id = t.versi_aktif_id
      where t.diarsipkan_pada is null order by t.urutan, t.nama`,
    referensi("jenis_dokumen"),
  ]);
  const labelJenis = new Map(jenis.map((j) => [j.kode, j.label]));
  const daftar = rows as unknown as Baris[];

  return (
    <>
      <JudulHalaman
        judul="Template dokumen"
        deskripsi="Unggah surat .docx berpenanda {placeholder}, petakan ke data kasus, uji, lalu aktifkan. Versi lama tetap tersimpan agar dokumen lama bisa dibuat ulang persis."
        kembali={{ href: "/pengaturan", label: "Pengaturan" }}
        aksi={
          <>
            <Button asChild variant="outline">
              <Link href="/pengaturan/template/placeholder"><ListTree aria-hidden /> Katalog placeholder</Link>
            </Button>
            <TambahTemplate jenis={jenis.map((j) => ({ kode: j.kode, label: j.label }))} />
          </>
        }
      />
      <div className="space-y-5">
        {daftar.length === 0 ? (
          <Kosong judul="Belum ada template" deskripsi="Tambahkan template pertama dengan mengunggah berkas Word .docx." />
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {daftar.map((t) => (
                <li key={t.id}>
                  <Link href={`/pengaturan/template/${t.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-accent/40">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-semibold">{t.nama}</p>
                      <p className="text-sm text-muted-foreground">{labelJenis.get(t.jenis_dokumen) ?? labelKode(t.jenis_dokumen)} · {rezimTeks(t.rezim_kode)}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {t.versi_aktif ? <Lencana warna="info">Versi {t.versi_aktif}</Lencana> : <Lencana warna="waspada">Belum ada versi aktif</Lencana>}
                        <Lencana>{t.jumlah_placeholder ?? 0} placeholder</Lencana>
                        {!t.aktif && <Lencana warna="lewat">Nonaktif</Lencana>}
                      </div>
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-sm md:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nama</th>
                    <th className="px-4 py-3 font-semibold">Jenis</th>
                    <th className="px-4 py-3 font-semibold">Rezim</th>
                    <th className="px-4 py-3 font-semibold">Tahap</th>
                    <th className="px-4 py-3 font-semibold">Versi aktif</th>
                    <th className="px-4 py-3 font-semibold">Placeholder</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {daftar.map((t) => (
                    <tr key={t.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <Link href={`/pengaturan/template/${t.id}`} className="font-medium text-primary hover:underline">{t.nama}</Link>
                        <span className="block font-mono text-xs text-muted-foreground">{t.kode}</span>
                      </td>
                      <td className="px-4 py-3">{labelJenis.get(t.jenis_dokumen) ?? labelKode(t.jenis_dokumen)}</td>
                      <td className="px-4 py-3">{rezimTeks(t.rezim_kode)}</td>
                      <td className="px-4 py-3">{t.tahap_kode.length ? t.tahap_kode.map(labelKode).join(", ") : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-3">{t.versi_aktif ? `v${t.versi_aktif} dari ${t.jumlah_versi}` : <Lencana warna="waspada">Belum ada</Lencana>}</td>
                      <td className="px-4 py-3">{t.jumlah_placeholder ?? 0}</td>
                      <td className="px-4 py-3">{t.aktif ? <Lencana warna="aman">Aktif</Lencana> : <Lencana warna="lewat">Nonaktif</Lencana>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <ContekanSintaks />
      </div>
    </>
  );
}
