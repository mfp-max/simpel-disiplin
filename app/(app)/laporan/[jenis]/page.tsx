import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileSpreadsheet, Printer, UserRoundSearch } from "lucide-react";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { bacaFilter, cariLaporan, filterKeParam, jalankanLaporan, opsiFilter } from "@/lib/laporan";
import { Catatan, JudulHalaman, Kosong, Panel, Pii } from "@/components/simpel/dasar";
import { Button } from "@/components/ui/button";
import type { PegawaiRingkas } from "@/components/simpel/interaktif";
import { cn } from "@/lib/utils";
import { TabelLembar } from "../_tabel";
import { FilterLaporanKlien } from "./filter_klien";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ jenis: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const def = cariLaporan((await params).jenis);
  return { title: `${def?.judul ?? "Laporan"} — SIMPEL` };
}

export default async function HalamanLaporanJenis({ params, searchParams }: Props) {
  await wajibMasuk();
  const [{ jenis }, sp] = await Promise.all([params, searchParams]);
  const def = cariLaporan(jenis);
  if (!def) notFound();
  const filter = bacaFilter(sp);
  const halaman = Math.max(1, Number(Array.isArray(sp.hal) ? sp.hal[0] : sp.hal) || 1);

  const butuhPegawai = def.wajibPegawai && !filter.pegawai;
  const [opsi, hasil, pegawaiRows] = await Promise.all([
    opsiFilter(),
    butuhPegawai ? Promise.resolve(null) : jalankanLaporan(def.kode, filter),
    filter.pegawai
      ? sql`select id, nip, nama_lengkap_gelar, unit_kerja, status_pegawai, golongan_ruang,
          coalesce(nullif(jabatan_tambahan, ''), nullif(jabatan_fungsional, ''), jenis_pegawai) as jabatan, rezim_kode
        from pegawai where id = ${filter.pegawai}`
      : Promise.resolve([]),
  ]);
  const pegawaiAwal = (pegawaiRows[0] as unknown as PegawaiRingkas | undefined) ?? null;

  const param = filterKeParam(filter);
  const qs = param.size ? `&${param}` : "";
  const hrefHalaman = (n: number) => {
    const p = filterKeParam(filter);
    if (n > 1) p.set("hal", String(n));
    return `/laporan/${def.kode}${p.size ? `?${p}` : ""}`;
  };
  const adaData = !!hasil && hasil.lembar.some((l) => l.baris.length);

  return (
    <div className="space-y-6">
      <JudulHalaman
        kembali={{ href: "/laporan", label: "Semua laporan" }}
        judul={def.judul}
        deskripsi={def.deskripsi}
        aksi={
          hasil ? (
            <>
              <Button asChild variant="outline">
                <a href={`/api/laporan/${def.kode}?format=xlsx${qs}`} download>
                  <FileSpreadsheet aria-hidden /> Unduh Excel
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={`/api/laporan/${def.kode}?cetak=1${qs}`} target="_blank" rel="noopener">
                  <Printer aria-hidden /> Cetak / PDF
                </a>
              </Button>
            </>
          ) : undefined
        }
      />

      <Panel judul={butuhPegawai || def.filter.includes("pegawai") ? "Pilih pegawai" : "Filter"}>
        <FilterLaporanKlien kode={def.kode} kunci={def.filter} opsi={opsi} nilai={filter} pegawaiAwal={pegawaiAwal} labelTanggal={def.labelTanggal} />
      </Panel>

      {butuhPegawai ? (
        <Kosong ikon={UserRoundSearch} judul="Pilih pegawai terlebih dahulu" deskripsi="Cari nama atau NIP pegawai di atas untuk menampilkan riwayat hukuman disiplinnya." />
      ) : hasil ? (
        <>
          {hasil.ringkasan.length > 0 && (
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {hasil.ringkasan.map((r) => (
                <div key={r.label} className="rounded-xl border bg-card p-3 shadow-sm">
                  <dt className="text-sm text-muted-foreground">{r.label}</dt>
                  <dd className={cn("mt-0.5 break-words text-lg font-bold tabular-nums", r.warna === "lewat" && "text-lewat", r.warna === "waspada" && "text-waspada", r.warna === "aman" && "text-aman")}>
                    {r.pii ? <Pii>{r.nilai}</Pii> : r.nilai}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-sm text-muted-foreground">{hasil.keteranganFilter.join(" · ")}</p>
          {!adaData && (
            <Catatan jenis="info">Belum ada data yang sesuai. Ubah filter, atau tunggu hingga kasus hukuman disiplin tercatat di SIMPEL.</Catatan>
          )}
          {hasil.lembar.map((l) => (
            <Panel key={l.nama} judul={l.judul} deskripsi={l.catatan}>
              <TabelLembar l={l} halaman={halaman} hrefHalaman={hrefHalaman} />
            </Panel>
          ))}
        </>
      ) : null}
    </div>
  );
}
