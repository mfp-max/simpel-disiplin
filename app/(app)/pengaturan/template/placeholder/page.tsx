import { JudulHalaman, Catatan } from "@/components/simpel/dasar";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ContekanSintaks } from "../_contekan";
import { DaftarPlaceholder, type BarisPlaceholder } from "./placeholder_klien";

export const metadata = { title: "Katalog placeholder" };

export default async function HalamanPlaceholder() {
  await wajibHalamanHak("kelola_pengaturan");
  const [rows, pengaturan, pakai] = await Promise.all([
    sql`select kode, label, kelompok, jenis, sumber, deskripsi, contoh, field, aktif from template_placeholder order by urutan, kode`,
    sql`select kunci, label from pengaturan order by kelompok, urutan, kunci`,
    sql`select ph->>'kode' as kode, count(distinct v.template_id)::int as n from template_versi v, jsonb_array_elements(v.placeholder) ph group by 1`,
  ]);
  const jumlahPakai = Object.fromEntries(pakai.map((r) => [r.kode as string, r.n as number]));
  return (
    <>
      <JudulHalaman
        judul="Katalog placeholder"
        deskripsi="Daftar penanda yang dapat dipakai di template. Penanda bawaan diisi otomatis dari data kasus; admin dapat menambah isian manual atau isian dari Pengaturan."
        kembali={{ href: "/pengaturan/template", label: "Template dokumen" }}
      />
      <div className="space-y-5">
        <Catatan jenis="info">
          Kode penanda <strong>bawaan</strong> tidak dapat diubah karena dihitung sistem dari data kasus; label, contoh, dan deskripsinya boleh disunting.
          Penanda tambahan bersumber <strong>isian manual</strong> (ditanyakan saat membuat dokumen) atau <strong>Pengaturan</strong> (mis. nama pejabat).
        </Catatan>
        <DaftarPlaceholder
          baris={rows as unknown as BarisPlaceholder[]}
          pengaturan={pengaturan.map((p) => ({ kunci: p.kunci as string, label: p.label as string }))}
          jumlahPakai={jumlahPakai}
        />
        <ContekanSintaks />
      </div>
    </>
  );
}
