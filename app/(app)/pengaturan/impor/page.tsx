import Link from "next/link";
import { History, PlugZap } from "lucide-react";
import { Catatan, JudulHalaman, Panel } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { angka, waktuPendek } from "@/lib/format";
import { statusApi } from "@/lib/simpega/api";
import type { RincianRiwayat } from "@/lib/simpega/impor";
import { LABEL_KOLOM } from "@/lib/simpega/normalisasi";
import { WizardImpor } from "./impor_klien";

export const metadata = { title: "Impor Data Pegawai" };

export default async function HalamanImpor() {
  await wajibHalamanHak("kelola_pengaturan");
  const [profil, status, riwayat] = await Promise.all([
    sql`select id, nama, pemetaan, keterangan, updated_at from profil_impor order by updated_at desc`,
    sql`select status_pegawai from pemetaan_status_pegawai order by status_pegawai`,
    sql`select r.id, r.nama_file, r.jumlah_baris, r.jumlah_baru, r.jumlah_diperbarui, r.jumlah_ditolak, r.rincian_tolak, r.created_at,
          u.nama as oleh, pi.nama as profil
        from riwayat_impor r left join app_users u on u.id = r.created_by left join profil_impor pi on pi.id = r.profil_id
        order by r.created_at desc limit 15`,
  ]);
  const api = statusApi();

  return (
    <>
      <JudulHalaman
        judul="Impor Data Pegawai"
        kembali={{ href: "/pengaturan", label: "Pengaturan" }}
        deskripsi="Unggah berkas Excel rekap Simpega. Berkas dibaca di peramban Anda; hanya kolom yang dipetakan dan diizinkan yang dikirim ke server."
      />

      <div className="space-y-6">
        <Catatan jenis="info" judul="Data pribadi sensitif tidak disimpan">
          Kolom seperti NIK, KK, NPWP, rekening, gaji, alamat, agama, status pernikahan, data pasangan, nomor HP, dan email pribadi
          ditolak otomatis — kolom ini sengaja tidak disimpan SIMPEL (UU 27/2022 tentang Pelindungan Data Pribadi).
        </Catatan>

        <WizardImpor
          profil={profil.map((p) => ({ id: p.id as string, nama: p.nama as string, pemetaan: p.pemetaan as Record<string, string> }))}
          statusDikenal={status.map((s) => s.status_pegawai as string)}
        />

        <Panel judul={<span className="inline-flex items-center gap-2"><PlugZap className="size-5" aria-hidden /> API Simpega</span>}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>API Simpega:</span>
            <Lencana warna={api.aktif ? "aman" : "netral"}>{api.pesan}</Lencana>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Jalur pelengkap untuk menyegarkan field yang dimiliki API. Diaktifkan lewat variabel lingkungan <code>SIMPEGA_API_URL</code> dan{" "}
            <code>SIMPEGA_API_KEY</code>. Excel tetap menjadi sumber kebenaran untuk field yang hanya ada di Excel, dan data yang disunting
            manual tidak akan ditimpa tanpa konfirmasi.
          </p>
        </Panel>

        <Panel judul={<span className="inline-flex items-center gap-2"><History className="size-5" aria-hidden /> Riwayat impor</span>} deskripsi="15 impor terakhir. Setiap impor juga tercatat di log audit.">
          {riwayat.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum pernah ada impor.</p>
          ) : (
            <ul className="divide-y">
              {riwayat.map((r) => {
                const rin = (r.rincian_tolak ?? {}) as Partial<RincianRiwayat>;
                const status = rin.status_tak_dikenal ? Object.entries(rin.status_tak_dikenal) : [];
                return (
                  <li key={r.id} className="py-3">
                    <details className="group">
                      <summary className="flex min-h-11 cursor-pointer list-none flex-col gap-1 rounded-md sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.nama_file ?? "Tanpa nama berkas"}</span>
                          <span className="block text-sm text-muted-foreground">
                            {waktuPendek(r.created_at as Date)} · {r.oleh ?? "Skrip/sistem"}{r.profil ? ` · profil ${r.profil}` : ""}
                            {rin.selesai === false ? " · tidak selesai" : ""}
                          </span>
                        </span>
                        <span className="flex flex-wrap gap-1.5">
                          <Lencana warna="info">{angka(r.jumlah_baru)} baru</Lencana>
                          <Lencana>{angka(r.jumlah_diperbarui)} diperbarui</Lencana>
                          <Lencana warna={r.jumlah_ditolak ? "lewat" : "netral"}>{angka(r.jumlah_ditolak)} ditolak</Lencana>
                        </span>
                      </summary>
                      <div className="mt-3 space-y-3 rounded-lg bg-muted/40 p-3 text-sm">
                        <p>
                          {angka(r.jumlah_baris)} baris dibaca · {angka(rin.tanpa_perubahan ?? 0)} diperbarui tanpa perubahan isi ·{" "}
                          {angka(rin.unit_baru?.length ?? 0)} unit kerja baru dibuat
                        </p>
                        {!!rin.ditolak?.length && (
                          <div>
                            <p className="font-semibold">Ditolak</p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5">
                              {rin.ditolak.slice(0, 50).map((d, i) => <li key={i}>Baris {d.baris}: {d.alasan}</li>)}
                              {rin.ditolak.length > 50 && <li>…dan {rin.ditolak.length - 50} lainnya</li>}
                            </ul>
                          </div>
                        )}
                        {!!rin.dilewati_manual?.length && (
                          <div>
                            <p className="font-semibold">Dilewati karena disunting manual</p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5">
                              {rin.dilewati_manual.slice(0, 50).map((d, i) => (
                                <li key={i}>Baris {d.baris} (<span data-pii>{d.nama ?? d.nip ?? "—"}</span>): {d.field.map((f) => LABEL_KOLOM[f] ?? f).join(", ")}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {status.length > 0 && (
                          <p>
                            Status pegawai belum dikenal: {status.map(([s, n]) => `${s} (${n})`).join(", ")} —{" "}
                            <Link href="/pengaturan/status-pegawai" className="font-medium underline">atur pemetaannya</Link>.
                          </p>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
