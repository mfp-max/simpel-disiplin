import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Catatan, JudulHalaman, Panel, Rincian } from "@/components/simpel/dasar";
import { Lencana, LencanaVerifikasi } from "@/components/simpel/lencana";
import { wajibMasuk } from "@/lib/auth";
import { kunciPasal } from "@/lib/regulasi/definisi";
import { labelKode, tanggalPanjang, waktuPendek } from "@/lib/format";
import { muatKatalog } from "../../_data";
import { KAIDAH_DIKENAL, LABEL_LINGKUP, rentangHari, uraikanSyarat, uraikanTenggat, type Baris } from "../../_skema";
import { MatriksKewenangan } from "../../_komponen/matriks";
import { TombolCetak } from "../../_komponen/tombol-cetak";

export const dynamic = "force-dynamic";

const aktif = (xs: Baris[]) => xs.filter((x) => x.aktif !== false);

function V({ b }: { b: Baris }) {
  return b.perlu_verifikasi ? <LencanaVerifikasi className="ml-1 align-middle" /> : null;
}

/** "Dokumentasi hidup" (PRD §18.9): seluruh aturan terbaca manusia, dicetak langsung dari tabel. */
export default async function RingkasanRegulasi({ params }: { params: Promise<{ id: string }> }) {
  const p = await wajibMasuk();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const kat = await muatKatalog(id);
  if (!kat) notFound();
  const r = kat.regulasi;
  const tingkat = aktif(kat.tingkat_hukuman);
  const jenis = aktif(kat.jenis_hukuman);
  const pasal = aktif(kat.pasal_regulasi);
  const ambang = aktif(kat.ambang_kehadiran);
  const tenggat = aktif(kat.aturan_tenggat);
  const kewenangan = aktif(kat.aturan_kewenangan);
  const tahapan = aktif(kat.aturan_tahapan);
  const pemetaan = aktif(kat.aturan_pemetaan_pelanggaran);
  const namaTingkat = (tid: unknown) => (tid ? String(tingkat.find((t) => t.id === tid)?.nama ?? kat.tingkat_hukuman.find((t) => t.id === tid)?.nama ?? "—") : null);
  const namaJenis = (jid: unknown) => (jid ? String(kat.jenis_hukuman.find((j) => j.id === jid)?.nama ?? "—") : null);
  const namaTahap = (kode: string) => String(tahapan.find((t) => t.kode_tahap === kode)?.nama ?? labelKode(kode));
  const kodeTingkat = (tid: unknown) => (tid ? String(kat.tingkat_hukuman.find((t) => t.id === tid)?.kode ?? "") : null);
  const nVerif = [r, ...tingkat, ...jenis, ...pasal, ...ambang, ...tenggat, ...kewenangan, ...tahapan, ...pemetaan, ...kat.aturan_kaidah].filter((x) => x.perlu_verifikasi).length;

  const pasalPerJenis = new Map<string, Baris[]>();
  for (const x of pasal) pasalPerJenis.set(String(x.jenis), [...(pasalPerJenis.get(String(x.jenis)) ?? []), x]);

  return (
    <div className="mx-auto max-w-5xl">
      <JudulHalaman
        kembali={{ href: "/pengaturan/regulasi", label: "Daftar peraturan" }}
        judul={`Ringkasan ${String(r.nama_singkat)}`}
        deskripsi={<>Dokumentasi hidup — disusun otomatis dari katalog aturan pada {waktuPendek(new Date())}. Gunakan untuk verifikasi oleh bagian hukum.</>}
        aksi={
          <div className="tanpa-cetak flex flex-wrap gap-2">
            <TombolCetak regulasiId={id} />
            {p.hak.kelola_pengaturan && <Button asChild variant="outline"><Link href={`/pengaturan/regulasi/${id}`}><Pencil /> Sunting</Link></Button>}
          </div>
        }
      />
      <div className="space-y-5 print:space-y-3">
        {nVerif > 0 && (
          <Catatan jenis="waspada" judul={`${nVerif} bagian bertanda "Perlu verifikasi"`}>
            Isi bertanda ini belum dicocokkan dengan naskah resmi peraturan. Periksa terhadap naskah JDIH, lalu tandai terverifikasi di layar penyuntingan.
          </Catatan>
        )}

        <Panel judul="1. Identitas">
          <Rincian items={[
            { label: "Nama lengkap", nilai: String(r.nama_lengkap ?? r.judul), lebar: true },
            { label: "Kode", nilai: String(r.kode) },
            { label: "Status", nilai: <>{labelKode(String(r.status))}{r.utama ? " · dasar kasus" : ""} · versi {String(r.versi)} <V b={r} /></> },
            { label: "Rezim", nilai: (r.rezim_nama as string) ?? "Tanpa rezim (pelengkap)" },
            { label: "Berlaku", nilai: `${tanggalPanjang(r.berlaku_dari as string)} – ${r.berlaku_sampai ? tanggalPanjang(r.berlaku_sampai as string) : "sekarang"}` },
            { label: "Menggantikan", nilai: r.menggantikan_nama as string },
            { label: "Digantikan oleh", nilai: r.digantikan_nama as string },
            { label: "Peringatan", nilai: r.peringatan as string, lebar: true },
            { label: "Catatan", nilai: r.catatan as string, lebar: true },
          ]} />
          {kat.regulasi_terkait.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 font-semibold">Peraturan terkait</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {kat.regulasi_terkait.map((t) => <li key={String(t.id)}>{String(t.nama_singkat)} — {String(t.judul)} ({labelKode(String(t.peran))}){t.keterangan ? `: ${t.keterangan}` : ""}</li>)}
              </ul>
            </div>
          )}
        </Panel>

        <Panel judul={`2. Tingkat dan jenis hukuman (${tingkat.length} tingkat, ${jenis.length} jenis)`}>
          {tingkat.length === 0 ? <p className="text-sm text-muted-foreground">Belum diisi.</p> : (
            <div className="space-y-4">
              {tingkat.map((t) => (
                <div key={String(t.id)}>
                  <h3 className="font-semibold">{String(t.urutan)}. Hukuman disiplin {String(t.nama)} <V b={t} /></h3>
                  <ol className="mt-1 list-decimal space-y-1.5 pl-6 text-sm">
                    {jenis.filter((j) => j.tingkat_hukuman_id === t.id).map((j) => (
                      <li key={String(j.id)}>
                        {String(j.nama)}{j.durasi_bulan ? ` — ${j.durasi_bulan} bulan` : ""}{j.pasal_rujukan ? ` (${j.pasal_rujukan})` : ""} <V b={j} />
                        {!!(j.blokir_kgb || j.blokir_kenaikan_pangkat) && <span className="block text-muted-foreground">Selama menjalani: {[j.blokir_kgb && "kenaikan gaji berkala ditunda", j.blokir_kenaikan_pangkat && "kenaikan pangkat ditunda"].filter(Boolean).join(", ")}.</span>}
                        {!!j.pengganti_sementara_id && <span className="block text-waspada">Pengganti sementara: {namaJenis(j.pengganti_sementara_id)}.{j.peringatan ? ` ${j.peringatan}` : ""}</span>}
                        {!j.pengganti_sementara_id && !!j.peringatan && <span className="block text-waspada">{String(j.peringatan)}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel judul={`3. Kewajiban dan larangan (${pasal.length} butir)`}>
          {pasal.length === 0 ? <p className="text-sm text-muted-foreground">{r.katalog_pasal_lengkap ? "Belum diisi." : "Peraturan arsip: pasal diisi sebagai teks bebas pada kasus."}</p> : (
            <div className="space-y-4">
              {[...pasalPerJenis.entries()].map(([j, xs]) => (
                <div key={j}>
                  <h3 className="font-semibold">{labelKode(j)} ({xs.length})</h3>
                  <ul className="mt-1 space-y-1.5 text-sm">
                    {xs.map((x) => <li key={String(x.id)}><span className="font-medium">{kunciPasal(x as never)}</span>: {String(x.teks)} <V b={x} /></li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel judul="4. Ambang pelanggaran kehadiran">
          {ambang.length === 0 ? <p className="text-sm text-muted-foreground">Peraturan ini tidak mengatur ambang kehadiran per hari.</p> : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left"><tr><th className="p-2.5">Hari kerja tanpa alasan sah</th><th className="p-2.5">Tingkat</th><th className="p-2.5">Jenis hukuman</th><th className="p-2.5">Keterangan</th></tr></thead>
                <tbody>
                  {ambang.map((a) => (
                    <tr key={String(a.id)} className="border-t align-top">
                      <td className="p-2.5 font-medium">{rentangHari(a)}{a.berturut_turut ? " berturut-turut" : ""}</td>
                      <td className="p-2.5">{namaTingkat(a.tingkat_hukuman_id) ?? "—"}</td>
                      <td className="p-2.5">{namaJenis(a.jenis_hukuman_id) ?? "—"}</td>
                      <td className="p-2.5">{[a.akibat_tambahan, a.alur_khusus && `alur ${labelKode(String(a.alur_khusus))}`, a.pasal_rujukan].filter(Boolean).join(" — ")} <V b={a} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel judul="5. Tenggat">
          {tenggat.length === 0 ? <p className="text-sm text-muted-foreground">Belum diisi.</p> : (
            <ul className="space-y-2 text-sm">
              {tenggat.map((t) => (
                <li key={String(t.id)}>
                  <span className="font-medium">{String(t.nama_tenggat)}</span> ({namaTahap(String(t.kode_tahap))}): {uraikanTenggat(t, namaTahap)} <V b={t} />
                  {!!t.catatan && <span className="block text-muted-foreground">{String(t.catatan)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel judul="6. Kewenangan">
          <MatriksKewenangan
            tingkat={tingkat.map((t) => ({ kunci: String(t.kode), nama: String(t.nama) }))}
            baris={kewenangan.map((k) => ({ tingkat: kodeTingkat(k.tingkat_hukuman_id), jenis: String(k.jenis), nama_peran: String(k.nama_peran), syarat: k.syarat_tambahan, prioritas: k.prioritas as number, perlu_verifikasi: !!k.perlu_verifikasi }))}
          />
          {kewenangan.some((k) => k.pasal_rujukan || k.lingkup || k.catatan) && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {kewenangan.filter((k) => k.pasal_rujukan || k.lingkup || k.catatan).map((k) => (
                <li key={String(k.id)}>
                  <span className="font-medium">{String(k.nama_peran)}</span> ({labelKode(String(k.jenis))}, {namaTingkat(k.tingkat_hukuman_id) ?? "semua tingkat"}):{" "}
                  {[k.lingkup && (LABEL_LINGKUP[String(k.lingkup)] ?? k.lingkup), k.pasal_rujukan, k.catatan].filter(Boolean).join(" — ")}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel judul="7. Tahapan per tingkat">
          {tingkat.length === 0 || tahapan.length === 0 ? <p className="text-sm text-muted-foreground">Belum diisi.</p> : (
            <div className="grid gap-4 md:grid-cols-2 print:grid-cols-1">
              {tingkat.map((t) => {
                const kode = String(t.kode);
                const isi = tahapan.filter((x) => !x.tingkat_hukuman_id || x.tingkat_hukuman_id === t.id).filter((x) => {
                  const k = (x.kondisi ?? {}) as Record<string, unknown>;
                  if (Array.isArray(k.tingkat_kode_in) && !k.tingkat_kode_in.map(String).includes(kode)) return false;
                  if (k.tingkat_kode !== undefined && String(k.tingkat_kode) !== kode) return false;
                  return true;
                });
                return (
                  <div key={String(t.id)} className="rounded-lg border p-3">
                    <h3 className="mb-1 font-semibold">Tingkat {String(t.nama)}</h3>
                    <ol className="list-decimal space-y-1 pl-5 text-sm">
                      {isi.map((x) => {
                        const k = { ...((x.kondisi ?? {}) as Record<string, unknown>) };
                        delete k.tingkat_kode_in;
                        delete k.tingkat_kode;
                        const syarat = uraikanSyarat(k);
                        return (
                          <li key={String(x.id)}>
                            {String(x.nama)}{x.opsional ? " (bila diperlukan)" : ""}
                            {syarat !== "selalu" && <span className="text-muted-foreground"> — hanya bila {syarat}</span>}
                            {!!x.pasal_rujukan && <span className="text-muted-foreground"> — {String(x.pasal_rujukan)}</span>} <V b={x} />
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel judul="8. Pemetaan pelanggaran ke tingkat hukuman">
          {pemetaan.length === 0 ? <p className="text-sm text-muted-foreground">Belum diisi.</p> : (
            <ul className="space-y-1.5 text-sm">
              {pemetaan.map((m) => (
                <li key={String(m.id)}>
                  {m.pasal_regulasi_id ? kunciPasal((kat.pasal_regulasi.find((x) => x.id === m.pasal_regulasi_id) ?? { pasal: "?" }) as never) : "Semua pasal kewajiban/larangan"}
                  {" "}dengan dampak pada <b>{labelKode(String(m.dampak))}</b> → hukuman disiplin <b>{namaTingkat(m.tingkat_hukuman_id)}</b>
                  {m.pasal_rujukan_pemetaan ? ` (${m.pasal_rujukan_pemetaan})` : ""} <V b={m} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel judul="9. Kaidah">
          {kat.aturan_kaidah.length === 0 ? <p className="text-sm text-muted-foreground">Belum diisi.</p> : (
            <dl className="space-y-2 text-sm">
              {kat.aturan_kaidah.map((k) => (
                <div key={String(k.id)}>
                  <dt className="font-medium">{labelKode(String(k.kunci))} <V b={k} /></dt>
                  <dd>
                    <span className="break-words">{Array.isArray(k.nilai) ? (k.nilai as unknown[]).join("; ") : typeof k.nilai === "boolean" ? (k.nilai ? "ya" : "tidak") : JSON.stringify(k.nilai)}</span>
                    {k.pasal_rujukan ? <span className="text-muted-foreground"> — {String(k.pasal_rujukan)}</span> : null}
                    {KAIDAH_DIKENAL[String(k.kunci)] && <span className="block text-xs text-muted-foreground">{KAIDAH_DIKENAL[String(k.kunci)]}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>

        <p className="text-sm text-muted-foreground">
          {kat.fixture_regresi.length} uji regresi tersimpan · {kat.fixture_regresi.filter((f) => f.lulus === true).length} lulus pada pemeriksaan terakhir ·
          dipakai {kat.jumlahKasus} kasus. <Lencana className="tanpa-cetak">Kasus lama memakai salinan beku, bukan isi halaman ini</Lencana>
        </p>
      </div>
    </div>
  );
}
