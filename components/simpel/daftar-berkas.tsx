import { FileText, Paperclip } from "lucide-react";
import { sql } from "@/lib/db";
import { referensi } from "@/lib/pengaturan";
import { siapkanUnggahBerkas, konfirmasiUnggahBerkas, arsipkanBerkas, simpanTeksBerkas } from "@/app/(app)/_aksi/berkas";
import { Panel } from "./dasar";
import { BarisBerkas, PengunggahBerkas } from "./daftar-berkas-klien";

/** Daftar lampiran sebuah entri + unggah (langsung ke bucket privat) + OCR opsional. */
export async function DaftarBerkas({
  entriId, bolehUnggah, bolehArsipkan, kategoriBawaan = "bukti", judul = "Berkas & lampiran", deskripsi,
}: { entriId: string; bolehUnggah: boolean; bolehArsipkan: boolean; kategoriBawaan?: string; judul?: string; deskripsi?: string }) {
  const [rows, kategori] = await Promise.all([
    sql`select b.id, b.nama_file, b.mime, b.ukuran, b.kategori, b.keterangan, b.created_at, (b.teks_ocr is not null) as ada_teks,
          length(b.teks_ocr) as panjang_teks, u.nama as pengunggah
        from berkas b left join app_users u on u.id = b.created_by
        where b.entri_id = ${entriId} and b.diarsipkan_pada is null order by b.created_at desc`,
    referensi("kategori_berkas"),
  ]);
  const labelKategori = Object.fromEntries(kategori.map((k) => [k.kode, k.label]));

  return (
    <Panel judul={<span className="flex items-center gap-2"><Paperclip className="size-5" aria-hidden />{judul}</span>} deskripsi={deskripsi ?? "Disimpan di penyimpanan privat. Dibuka lewat tautan sementara yang tercatat di log audit."}>
      <div className="space-y-4">
        {bolehUnggah && (
          <PengunggahBerkas
            kategori={kategori.map((k) => ({ kode: k.kode, label: k.label }))}
            kategoriBawaan={kategoriBawaan}
            siapkan={siapkanUnggahBerkas.bind(null, entriId)}
            konfirmasi={konfirmasiUnggahBerkas.bind(null, entriId)}
          />
        )}
        {rows.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-4 text-sm text-muted-foreground">
            <FileText className="size-4" aria-hidden /> Belum ada berkas terunggah.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {rows.map((b) => (
              <BarisBerkas
                key={b.id}
                berkas={{
                  id: b.id, nama: b.nama_file, mime: b.mime, ukuran: Number(b.ukuran ?? 0), kategori: labelKategori[b.kategori] ?? b.kategori,
                  keterangan: b.keterangan, waktu: (b.created_at as Date).toISOString(), pengunggah: b.pengunggah, adaTeks: b.ada_teks, panjangTeks: Number(b.panjang_teks ?? 0),
                }}
                bolehUbah={bolehUnggah}
                bolehArsipkan={bolehArsipkan}
                simpanTeks={simpanTeksBerkas}
                arsipkan={arsipkanBerkas}
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
