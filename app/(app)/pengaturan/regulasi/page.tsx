import Link from "next/link";
import { BookOpen, Download, Pencil, Plus, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Catatan, JudulHalaman, Kosong, Panel } from "@/components/simpel/dasar";
import { Lencana, LencanaVerifikasi } from "@/components/simpel/lencana";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { tanggalPanjang } from "@/lib/format";
import { ImporDefinisi } from "./_komponen/impor-klien";

export const dynamic = "force-dynamic";

const WARNA_STATUS = { aktif: "aman", draf: "info", nonaktif: "netral" } as const;
const LABEL_STATUS = { aktif: "Aktif", draf: "Draf", nonaktif: "Nonaktif (arsip)" } as const;

export default async function DaftarRegulasi() {
  const p = await wajibMasuk();
  const admin = p.hak.kelola_pengaturan;
  const [rows, rezim] = await Promise.all([
    sql`select r.id, r.kode, r.jenis, r.judul, r.nama_singkat, r.rezim_kode, r.utama, r.status, r.berlaku_dari, r.berlaku_sampai, r.versi,
        r.perlu_verifikasi, g.nama_singkat as digantikan_nama,
        (select count(*) from tingkat_hukuman x where x.regulasi_id = r.id and x.aktif)::int as n_tingkat,
        (select count(*) from jenis_hukuman x where x.regulasi_id = r.id and x.aktif)::int as n_jenis,
        (select count(*) from pasal_regulasi x where x.regulasi_id = r.id and x.aktif)::int as n_pasal,
        (select count(*) from ambang_kehadiran x where x.regulasi_id = r.id and x.aktif)::int as n_ambang,
        (select count(*) from aturan_tenggat x where x.regulasi_id = r.id and x.aktif)::int as n_tenggat,
        (select count(*) from aturan_kewenangan x where x.regulasi_id = r.id and x.aktif)::int as n_kewenangan,
        (select count(*) from aturan_tahapan x where x.regulasi_id = r.id and x.aktif)::int as n_tahapan,
        (select count(*) from fixture_regresi x where x.regulasi_id = r.id)::int as n_uji,
        (select count(*) from fixture_regresi x where x.regulasi_id = r.id and x.lulus = false)::int as n_uji_gagal,
        (select count(*) from entri e where e.regulasi_id = r.id)::int as n_kasus,
        (r.perlu_verifikasi
          or exists (select 1 from tingkat_hukuman x where x.regulasi_id = r.id and x.aktif and x.perlu_verifikasi)
          or exists (select 1 from jenis_hukuman x where x.regulasi_id = r.id and x.aktif and x.perlu_verifikasi)
          or exists (select 1 from pasal_regulasi x where x.regulasi_id = r.id and x.aktif and x.perlu_verifikasi)
          or exists (select 1 from ambang_kehadiran x where x.regulasi_id = r.id and x.aktif and x.perlu_verifikasi)
          or exists (select 1 from aturan_tenggat x where x.regulasi_id = r.id and x.aktif and x.perlu_verifikasi)
          or exists (select 1 from aturan_kewenangan x where x.regulasi_id = r.id and x.aktif and x.perlu_verifikasi)
          or exists (select 1 from aturan_tahapan x where x.regulasi_id = r.id and x.aktif and x.perlu_verifikasi)
          or exists (select 1 from aturan_pemetaan_pelanggaran x where x.regulasi_id = r.id and x.aktif and x.perlu_verifikasi)
          or exists (select 1 from aturan_kaidah x where x.regulasi_id = r.id and x.perlu_verifikasi)) as ada_verifikasi
      from regulasi r left join regulasi g on g.id = r.digantikan_oleh_id
      order by r.utama desc, r.berlaku_dari desc nulls last, r.nama_singkat`,
    sql`select kode, nama from rezim order by urutan`,
  ]);

  const kelompok = [
    ...rezim.map((z) => ({ kode: z.kode as string, nama: `Rezim ${z.kode} — ${z.nama}`, isi: rows.filter((r) => r.rezim_kode === z.kode) })),
    { kode: "_", nama: "Tanpa rezim (peraturan pelengkap)", isi: rows.filter((r) => !r.rezim_kode || !rezim.some((z) => z.kode === r.rezim_kode)) },
  ].filter((k) => k.isi.length);

  return (
    <div className="mx-auto max-w-6xl">
      <JudulHalaman
        kembali={{ href: "/pengaturan", label: "Pengaturan" }}
        judul="Peraturan & katalog aturan"
        deskripsi="Seluruh aturan hukum yang dipakai SIMPEL — tingkat dan jenis hukuman, pasal, ambang kehadiran, tenggat, kewenangan, dan tahapan — tersimpan sebagai data per peraturan."
        aksi={admin ? (
          <>
            <ImporDefinisi />
            <Button asChild><Link href="/pengaturan/regulasi/baru"><Plus /> Tambah peraturan baru</Link></Button>
          </>
        ) : undefined}
      />
      <div className="space-y-6">
        <Catatan judul="Menambah atau mengganti peraturan tidak memerlukan programmer">
          Bila terbit peraturan disiplin baru, admin cukup memakai <b>Tambah peraturan baru</b>: salin isi peraturan lama, sunting tingkat, jenis hukuman, ambang,
          tenggat, kewenangan, dan tahapan, uji dengan kasus contoh, lalu aktifkan dengan tanggal mulai berlaku. Kasus baru sesudah tanggal itu otomatis memakainya;
          kasus lama tetap memakai peraturan yang berlaku saat perbuatan terjadi. Definisi juga bisa disusun di luar sistem, ditinjau bagian hukum, lalu diimpor sebagai berkas JSON.
        </Catatan>

        {kelompok.length === 0 && <Kosong ikon={Scale} judul="Belum ada peraturan" deskripsi="Tambahkan peraturan baru atau impor definisi JSON." />}

        {kelompok.map((k) => (
          <Panel key={k.kode} judul={k.nama} deskripsi={`${k.isi.length} peraturan`}>
            <ul className="space-y-3">
              {k.isi.map((r) => (
                <li key={r.id} className="rounded-lg border bg-card p-3 sm:p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold">{r.nama_singkat}</p>
                        <Lencana warna={WARNA_STATUS[r.status as keyof typeof WARNA_STATUS] ?? "netral"}>{LABEL_STATUS[r.status as keyof typeof LABEL_STATUS] ?? r.status}</Lencana>
                        {r.utama && <Lencana warna="info">Dasar kasus</Lencana>}
                        {r.versi > 1 && <Lencana>Versi {r.versi}</Lencana>}
                        {r.ada_verifikasi && <LencanaVerifikasi />}
                        {r.n_uji_gagal > 0 && <Lencana warna="lewat">{r.n_uji_gagal} uji gagal</Lencana>}
                      </div>
                      <p className="text-sm">{r.jenis} — {r.judul}</p>
                      <p className="text-sm text-muted-foreground">
                        Berlaku {tanggalPanjang(r.berlaku_dari, "?")} – {r.berlaku_sampai ? tanggalPanjang(r.berlaku_sampai) : "sekarang"}
                        {r.digantikan_nama ? ` · digantikan ${r.digantikan_nama}` : ""} · Kode {r.kode}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {r.n_tingkat} tingkat · {r.n_jenis} jenis hukuman · {r.n_pasal} pasal · {r.n_ambang} ambang · {r.n_tenggat} tenggat · {r.n_kewenangan} kewenangan · {r.n_tahapan} tahapan · {r.n_uji} uji regresi ·{" "}
                        <span className="font-medium text-foreground">dipakai {r.n_kasus} kasus</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">
                      {admin && <Button asChild variant="outline"><Link href={`/pengaturan/regulasi/${r.id}`}><Pencil /> Sunting</Link></Button>}
                      <Button asChild variant="outline"><Link href={`/pengaturan/regulasi/${r.id}/ringkasan`}><BookOpen /> Ringkasan</Link></Button>
                      {admin && <Button asChild variant="ghost"><a href={`/pengaturan/regulasi/${r.id}/ekspor`}><Download /> Ekspor JSON</a></Button>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  );
}
