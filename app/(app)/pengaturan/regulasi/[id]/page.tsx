import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JudulHalaman } from "@/components/simpel/dasar";
import { Lencana, LencanaRezim } from "@/components/simpel/lencana";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { muatAturan } from "@/lib/regulasi";
import { eksporDefinisi } from "@/lib/regulasi/simpan";
import { muatKatalog, muatLibur, muatOpsi, muatRiwayat } from "../_data";
import { periksaDefinisi } from "../_skema";
import { EditorRegulasi } from "../_komponen/editor-klien";

export const dynamic = "force-dynamic";

export default async function HalamanEditorRegulasi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  await wajibHalamanHak("kelola_pengaturan");
  const { id } = await params;
  const { tab } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const kat = await muatKatalog(id);
  if (!kat) notFound();
  const [ctx, aturan, libur, riwayat, def] = await Promise.all([muatOpsi(kat, id), muatAturan(id), muatLibur(), muatRiwayat(id), eksporDefinisi(sql, id)]);
  const r = kat.regulasi;
  return (
    <div className="mx-auto max-w-6xl">
      <JudulHalaman
        kembali={{ href: "/pengaturan/regulasi", label: "Daftar peraturan" }}
        judul={String(r.nama_singkat)}
        lencana={<LencanaRezim kode={r.rezim_kode as string | null} nama={(r.rezim_nama as string) ?? undefined} />}
        deskripsi={<>{String(r.judul)}{kat.jumlahKasus > 0 && <> · <Lencana warna="info">Dipakai {kat.jumlahKasus} kasus</Lencana></>}</>}
        aksi={
          <>
            <Button asChild variant="outline"><Link href={`/pengaturan/regulasi/${id}/ringkasan`}><BookOpen /> Ringkasan</Link></Button>
            <Button asChild variant="outline"><a href={`/pengaturan/regulasi/${id}/ekspor`}><Download /> Ekspor JSON</a></Button>
          </>
        }
      />
      <EditorRegulasi kat={kat} ctx={ctx} aturan={aturan} libur={libur} riwayat={riwayat} periksa={periksaDefinisi(def)} tabAwal={tab ?? "identitas"} />
    </div>
  );
}
