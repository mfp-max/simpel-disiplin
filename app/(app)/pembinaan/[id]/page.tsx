import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Catatan, JudulHalaman, Panel, Rincian } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { DaftarBerkas } from "@/components/simpel/daftar-berkas";
import { RiwayatAudit } from "@/components/simpel/riwayat-audit";
import { UbahEntri } from "@/components/simpel/ubah-entri";
import { DialogAlasan } from "@/components/simpel/interaktif";
import { wajibMasuk } from "@/lib/auth";
import { catatAudit } from "@/lib/audit";
import { sql } from "@/lib/db";
import { ringkasEntri } from "@/lib/entri";
import { referensi } from "@/lib/pengaturan";
import { tanggalPanjang, waktuPendek } from "@/lib/format";
import { arsipkanEntri, ubahEntri } from "@/app/(app)/_aksi/entri";

export const metadata = { title: "Detail pembinaan" };

export default async function DetailPembinaan({ params }: { params: Promise<{ id: string }> }) {
  const p = await wajibMasuk();
  const { id } = await params;
  const e = await ringkasEntri(id);
  if (!e || e.kelas !== "non_hukdis") notFound();
  await catatAudit(p, { aksi: "lihat", tabel: "entri", record_id: id, entri_id: id });
  const [jenis, asal] = await Promise.all([
    referensi("jenis_non_hukdis"),
    e.berasal_dari_id ? sql`select id, nomor_registrasi from entri where id = ${e.berasal_dari_id}` : Promise.resolve([]),
  ]);
  const labelJenis = Object.fromEntries(jenis.map((j) => [j.kode, j.label]));
  return (
    <>
      <JudulHalaman
        kembali={{ href: "/pembinaan", label: "Pembinaan" }}
        judul={e.judul}
        lencana={<Lencana>{labelJenis[e.jenis_non_hukdis] ?? "Pembinaan"}</Lencana>}
        deskripsi={<>{e.nomor_registrasi} · dicatat {waktuPendek(e.created_at)}</>}
        aksi={p.hak.boleh_ubah && !e.diarsipkan_pada ? (
          <UbahEntri aksi={ubahEntri.bind(null, id)} judul="Ubah catatan pembinaan"
            nilai={{ judul: e.judul, jenis_non_hukdis: e.jenis_non_hukdis, tanggal_peristiwa: e.tanggal_peristiwa, ringkasan: e.ringkasan, catatan_internal: e.catatan_internal }}
            bidang={[
              { kolom: "judul", label: "Judul", jenis: "teks" },
              { kolom: "jenis_non_hukdis", label: "Jenis", jenis: "pilihan", opsi: jenis },
              { kolom: "tanggal_peristiwa", label: "Tanggal", jenis: "tanggal" },
              { kolom: "ringkasan", label: "Ringkasan", jenis: "panjang" },
              { kolom: "catatan_internal", label: "Catatan internal", jenis: "panjang" },
            ]} />
        ) : null}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Panel judul="Rincian">
            <Rincian items={[
              { label: "Pegawai", nilai: e.nama_pegawai ? `${e.nama_pegawai}${e.nip_pegawai ? ` · ${e.nip_pegawai}` : ""}` : "—", pii: true },
              { label: "Unit kerja", nilai: e.unit_pegawai },
              { label: "Tanggal", nilai: tanggalPanjang(e.tanggal_peristiwa) },
              { label: "Berasal dari informasi", nilai: asal[0] ? <Link className="underline" href={`/informasi/${asal[0].id}`}>{asal[0].nomor_registrasi}</Link> : "—" },
              { label: "Ringkasan", nilai: <span className="whitespace-pre-wrap font-normal">{e.ringkasan}</span>, lebar: true },
            ]} />
          </Panel>
          <DaftarBerkas entriId={id} bolehUnggah={p.hak.boleh_buat && !e.diarsipkan_pada} bolehArsipkan={p.hak.boleh_ubah} kategoriBawaan="lainnya" />
          <RiwayatAudit entriId={id} />
        </div>
        <aside className="space-y-5">
          <Catatan>Pembinaan bukan hukuman disiplin. Bila kelak ditemukan pelanggaran disiplin, catatan ini menjadi riwayat pada kasus pegawai tersebut.</Catatan>
          {p.hak.boleh_arsipkan && !e.diarsipkan_pada && (
            <DialogAlasan pemicu={<Button variant="outline" className="w-full"><Archive /> Arsipkan</Button>} judul="Arsipkan catatan ini?" deskripsi="Tidak dihapus permanen." labelTombol="Arsipkan" aksi={arsipkanEntri.bind(null, id)} />
          )}
        </aside>
      </div>
    </>
  );
}
