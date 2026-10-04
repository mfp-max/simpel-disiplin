import { notFound } from "next/navigation";
import { Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Catatan, JudulHalaman, Panel, Rincian } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { DaftarBerkas } from "@/components/simpel/daftar-berkas";
import { RiwayatAudit } from "@/components/simpel/riwayat-audit";
import { GantiPegawai, UbahEntri } from "@/components/simpel/ubah-entri";
import { DialogAlasan } from "@/components/simpel/interaktif";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { ringkasEntri } from "@/lib/entri";
import { referensi } from "@/lib/pengaturan";
import { tanggalPanjang, waktuPendek } from "@/lib/format";
import { arsipkanEntri, gantiPegawaiEntri, pulihkanEntri, ubahEntri } from "@/app/(app)/_aksi/entri";

export const metadata = { title: "Detail arsip" };

export default async function DetailArsip({ params }: { params: Promise<{ id: string }> }) {
  const p = await wajibMasuk();
  const { id } = await params;
  const e = await ringkasEntri(id);
  if (!e || e.kelas !== "arsip") notFound();
  await catatAudit(p, { aksi: "lihat", tabel: "entri", record_id: id, entri_id: id });

  const [kelengkapan, hukuman, pelanggaran, pegawaiRow] = await Promise.all([
    referensi("kelengkapan_berkas"),
    sql`select snapshot_jenis_hukuman, nomor_sk, tanggal_sk from hukuman where entri_id = ${id} order by created_at limit 1`,
    sql`select pasal_teks_bebas, snapshot_pasal, uraian_perbuatan from pelanggaran_entri where entri_id = ${id} order by urutan`,
    e.pegawai_id ? sql`select id, nip, nama_lengkap_gelar, unit_kerja, status_pegawai, golongan_ruang, jabatan_fungsional as jabatan, rezim_kode from pegawai where id = ${e.pegawai_id}` : Promise.resolve([]),
  ]);
  const labelLengkap = Object.fromEntries(kelengkapan.map((k) => [k.kode, k.label]));
  const h = hukuman[0];

  return (
    <>
      <JudulHalaman
        kembali={{ href: "/arsip", label: "Arsip Kasus Lampau" }}
        judul={e.judul}
        lencana={<Lencana>Arsip · {e.tahun_peristiwa ?? "tahun ?"}</Lencana>}
        deskripsi={<>{e.nomor_registrasi} · dicatat {waktuPendek(e.created_at)}</>}
        aksi={p.hak.boleh_ubah && !e.diarsipkan_pada ? (
          <>
            <UbahEntri
              judul="Ubah data arsip"
              aksi={ubahEntri.bind(null, id)}
              nilai={{ judul: e.judul, tahun_peristiwa: e.tahun_peristiwa, tanggal_peristiwa: e.tanggal_peristiwa, kelengkapan_berkas: e.kelengkapan_berkas, nama_pegawai_bebas: e.nama_pegawai_bebas, nip_bebas: e.nip_bebas, ringkasan: e.ringkasan, catatan_internal: e.catatan_internal }}
              bidang={[
                { kolom: "judul", label: "Uraian singkat", jenis: "teks" },
                { kolom: "tahun_peristiwa", label: "Tahun kejadian", jenis: "angka" },
                { kolom: "tanggal_peristiwa", label: "Tanggal kejadian", jenis: "tanggal" },
                { kolom: "kelengkapan_berkas", label: "Kelengkapan berkas", jenis: "pilihan", opsi: kelengkapan },
                { kolom: "nama_pegawai_bebas", label: "Nama pegawai (manual)", jenis: "teks" },
                { kolom: "nip_bebas", label: "NIP (manual)", jenis: "teks" },
                { kolom: "ringkasan", label: "Kronologi / keterangan", jenis: "panjang" },
                { kolom: "catatan_internal", label: "Catatan internal", jenis: "panjang" },
              ]}
            />
            <GantiPegawai awal={pegawaiRow[0] ? (pegawaiRow[0] as never) : null} aksi={gantiPegawaiEntri.bind(null, id)} />
          </>
        ) : null}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Panel judul="Data arsip">
            <Rincian
              items={[
                { label: "Pegawai", nilai: e.nama_pegawai ? `${e.nama_pegawai}${e.nip_pegawai ? ` · ${e.nip_pegawai}` : ""}` : "—", pii: true },
                { label: "Tahun / tanggal kejadian", nilai: e.tanggal_peristiwa ? tanggalPanjang(e.tanggal_peristiwa) : e.tahun_peristiwa },
                { label: "Peraturan saat itu", nilai: e.snapshot_regulasi?.nama_singkat ?? e.regulasi_singkat ?? "Tidak dicatat" },
                { label: "Kelengkapan berkas", nilai: labelLengkap[e.kelengkapan_berkas] ?? "Belum dinilai" },
                { label: "Hukuman", nilai: h?.snapshot_jenis_hukuman?.nama ? `${h.snapshot_jenis_hukuman.tingkat ? `${h.snapshot_jenis_hukuman.tingkat} — ` : ""}${h.snapshot_jenis_hukuman.nama}` : "—" },
                { label: "SK", nilai: h?.nomor_sk ? `${h.nomor_sk}${h.tanggal_sk ? `, ${tanggalPanjang(h.tanggal_sk)}` : ""}` : "—" },
                { label: "Pasal", nilai: pelanggaran.map((x) => x.snapshot_pasal?.kunci ?? x.pasal_teks_bebas).filter(Boolean).join("; ") || "—", lebar: true },
                { label: "Kronologi / keterangan", nilai: <span className="whitespace-pre-wrap font-normal">{e.ringkasan}</span>, lebar: true },
              ]}
            />
          </Panel>
          <DaftarBerkas entriId={id} bolehUnggah={p.hak.boleh_buat && !e.diarsipkan_pada} bolehArsipkan={p.hak.boleh_ubah} kategoriBawaan="pindaian_arsip" judul="Pindaian berkas"
            deskripsi="Unggah pindaian apa adanya. Gunakan tombol “Teks isi” untuk OCR agar isinya dapat dicari." />
          <RiwayatAudit entriId={id} />
        </div>
        <aside className="space-y-5">
          <Catatan>Arsip tidak menghitung tenggat dan tidak memunculkan peringatan. Data tetap tercatat dalam riwayat hukuman pegawai.</Catatan>
          {p.hak.boleh_arsipkan && (
            <Panel judul="Tindakan">
              {e.diarsipkan_pada ? (
                <DialogAlasan pemicu={<Button variant="outline" className="w-full"><RotateCcw /> Pulihkan</Button>} judul="Pulihkan entri ini?" labelTombol="Pulihkan" aksi={pulihkanEntri.bind(null, id)} />
              ) : (
                <DialogAlasan pemicu={<Button variant="outline" className="w-full"><Archive /> Sembunyikan entri</Button>} judul="Sembunyikan entri arsip ini?" deskripsi="Tidak dihapus permanen; tercatat di log audit." labelTombol="Sembunyikan" aksi={arsipkanEntri.bind(null, id)} />
              )}
            </Panel>
          )}
          {e.diarsipkan_pada && <Catatan jenis="waspada" judul="Disembunyikan">{e.alasan_diarsipkan}</Catatan>}
        </aside>
      </div>
    </>
  );
}
