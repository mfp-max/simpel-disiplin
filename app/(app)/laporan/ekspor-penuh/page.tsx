import type { Metadata } from "next";
import { Archive, Download } from "lucide-react";
import { wajibHalamanHak } from "@/lib/auth";
import { daftarEksporLama } from "@/lib/ekspor";
import { tanggalPanjang, ukuranBerkas, waktuPendek } from "@/lib/format";
import { Catatan, JudulHalaman, Kosong, Panel } from "@/components/simpel/dasar";
import { TombolEksporPenuh } from "./ekspor_klien";

export const metadata: Metadata = { title: "Ekspor penuh — SIMPEL" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function waktuDariNama(nama: string) {
  const m = nama.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
  return m ? `${tanggalPanjang(`${m[1]}-${m[2]}-${m[3]}`)}, ${m[4]}.${m[5]} WIB` : nama;
}

export default async function HalamanEksporPenuh() {
  await wajibHalamanHak("kelola_pengaturan");
  const lama = await daftarEksporLama();

  return (
    <div className="space-y-6">
      <JudulHalaman
        kembali={{ href: "/laporan", label: "Laporan" }}
        judul="Ekspor penuh"
        deskripsi="Satu tombol untuk menghasilkan arsip berisi seluruh data dan berkas SIMPEL. Data tidak tersandera aplikasi: isi arsip dapat dibuka tanpa SIMPEL."
      />

      <Catatan jenis="lewat" judul="Sangat rahasia">
        Arsip memuat data pribadi seluruh pegawai terlapor dan bahan pemeriksaan hukuman disiplin. Simpan hanya di media terenkripsi milik
        instansi, jangan dikirim lewat surel atau aplikasi pesan, dan musnahkan salinan yang tidak diperlukan. Setiap pembuatan dan unduhan
        tercatat di log audit.
      </Catatan>

      <Panel judul="Buat ekspor baru" deskripsi="Proses dapat memakan waktu beberapa menit, bergantung pada jumlah berkas.">
        <div className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Seluruh tabel sebagai JSON (<code>data/&lt;tabel&gt;.json</code>), termasuk data yang diarsipkan.</li>
            <li>Seluruh berkas unggahan dan template (<code>berkas/…</code>).</li>
            <li><code>README.txt</code> berbahasa Indonesia tentang struktur arsip dan cara membukanya, serta <code>skema.sql</code>.</li>
            <li>Arsip besar dipecah menjadi beberapa bagian ZIP (masing-masing ≤ ±40 MB).</li>
          </ul>
          <TombolEksporPenuh />
        </div>
      </Panel>

      <Panel judul="Ekspor sebelumnya" deskripsi="Tautan unduhan dibuat baru setiap kali diklik dan hanya berlaku 5 menit.">
        {!lama.length ? (
          <Kosong ikon={Archive} judul="Belum ada ekspor penuh" deskripsi="Arsip yang Anda buat akan tercantum di sini." />
        ) : (
          <ul className="divide-y rounded-lg border">
            {lama.map((x) => (
              <li key={x.nama} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="block font-medium">{waktuDariNama(x.nama)}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{x.nama}</span>
                  <span className="block text-xs text-muted-foreground">
                    {ukuranBerkas(x.ukuran)}{x.dibuat ? ` · diunggah ${waktuPendek(x.dibuat)}` : ""} · RAHASIA
                  </span>
                </span>
                <a
                  href={`/api/ekspor-penuh?berkas=${encodeURIComponent(x.nama)}`}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
                >
                  <Download className="size-4" aria-hidden /> Unduh ulang
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
