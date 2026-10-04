import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Archive, CheckCircle2, Circle, FolderCheck, HandHeart, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Catatan, JudulHalaman, Panel, Rincian } from "@/components/simpel/dasar";
import { LencanaStatus } from "@/components/simpel/lencana";
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
import { arsipkanEntri, gantiPegawaiEntri, pulihkanEntri, tutupInformasi, ubahEntri } from "@/app/(app)/_aksi/entri";

export const metadata = { title: "Detail informasi" };

export default async function DetailInformasi({ params }: { params: Promise<{ id: string }> }) {
  const p = await wajibMasuk();
  const { id } = await params;
  const e = await ringkasEntri(id);
  if (!e || e.kelas !== "informasi") notFound();
  await catatAudit(p, { aksi: "lihat", tabel: "entri", record_id: id, entri_id: id });

  const [sumber, [{ jml_berkas }], pegawaiRow, kasus] = await Promise.all([
    referensi("sumber_informasi"),
    sql`select count(*)::int as jml_berkas from berkas where entri_id = ${id} and diarsipkan_pada is null`,
    e.pegawai_id ? sql`select id, nip, nama_lengkap_gelar, unit_kerja, status_pegawai, golongan_ruang, coalesce(nullif(jabatan_tambahan,''), jabatan_fungsional) as jabatan, rezim_kode from pegawai where id = ${e.pegawai_id}` : Promise.resolve([]),
    e.dinaikkan_ke_id ? sql`select id, nomor_registrasi from entri where id = ${e.dinaikkan_ke_id}` : Promise.resolve([]),
  ]);
  const labelSumber = Object.fromEntries(sumber.map((s) => [s.kode, s.label]));

  // Syarat naik jadi kasus (PRD §5.1)
  const syaratTerlapor = !!e.pegawai_id;
  const syaratBukti = !!e.pelapor_nama?.trim() || jml_berkas > 0;
  const bolehNaik = syaratTerlapor && syaratBukti && e.status_kasus === "informasi" && !e.diarsipkan_pada;
  const aktif = e.status_kasus === "informasi" && !e.diarsipkan_pada;

  return (
    <>
      <JudulHalaman
        kembali={{ href: "/informasi", label: "Registrasi Informasi" }}
        judul={e.judul}
        lencana={<LencanaStatus nama={e.diarsipkan_pada ? "Diarsipkan" : e.status_nama} kelompok={e.status_kelompok} />}
        deskripsi={<>{e.nomor_registrasi} · dicatat {waktuPendek(e.created_at)}</>}
        aksi={
          <>
            {p.hak.boleh_ubah && aktif && (
              <UbahEntri
                judul="Ubah informasi"
                aksi={ubahEntri.bind(null, id)}
                nilai={{ judul: e.judul, ringkasan: e.ringkasan, sumber_informasi: e.sumber_informasi, tanggal_peristiwa: e.tanggal_peristiwa, pelapor_nama: e.pelapor_nama, pelapor_kontak: e.pelapor_kontak, nama_pegawai_bebas: e.nama_pegawai_bebas, catatan_internal: e.catatan_internal }}
                bidang={[
                  { kolom: "judul", label: "Judul", jenis: "teks" },
                  { kolom: "sumber_informasi", label: "Sumber", jenis: "pilihan", opsi: sumber },
                  { kolom: "tanggal_peristiwa", label: "Tanggal peristiwa", jenis: "tanggal" },
                  { kolom: "nama_pegawai_bebas", label: "Nama terlapor (bila belum di master)", jenis: "teks" },
                  { kolom: "pelapor_nama", label: "Nama pelapor", jenis: "teks" },
                  { kolom: "pelapor_kontak", label: "Kontak pelapor", jenis: "teks" },
                  { kolom: "ringkasan", label: "Ringkasan", jenis: "panjang" },
                  { kolom: "catatan_internal", label: "Catatan internal", jenis: "panjang" },
                ]}
              />
            )}
            {p.hak.boleh_ubah && aktif && (
              <GantiPegawai awal={pegawaiRow[0] ? (pegawaiRow[0] as never) : null} aksi={gantiPegawaiEntri.bind(null, id)} />
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Panel judul="Rincian informasi">
            <Rincian
              items={[
                { label: "Pegawai terlapor", nilai: e.nama_pegawai ? <>{e.nama_pegawai}{e.nip_pegawai ? ` · ${e.nip_pegawai}` : ""}{!e.pegawai_id && <span className="ml-1 text-xs text-waspada">(belum ditautkan ke master)</span>}</> : "Belum teridentifikasi", pii: true },
                { label: "Unit kerja", nilai: e.unit_pegawai },
                { label: "Sumber informasi", nilai: labelSumber[e.sumber_informasi] },
                { label: "Tanggal peristiwa", nilai: tanggalPanjang(e.tanggal_peristiwa) },
                { label: "Pelapor", nilai: e.pelapor_nama ? `${e.pelapor_nama}${e.pelapor_kontak ? ` (${e.pelapor_kontak})` : ""}` : "Tidak disebutkan", pii: true },
                { label: "Ringkasan", nilai: <span className="whitespace-pre-wrap font-normal">{e.ringkasan}</span>, lebar: true },
                ...(e.catatan_internal ? [{ label: "Catatan internal", nilai: <span className="whitespace-pre-wrap font-normal">{e.catatan_internal}</span>, lebar: true }] : []),
              ]}
            />
          </Panel>
          <DaftarBerkas entriId={id} bolehUnggah={p.hak.boleh_buat && !e.diarsipkan_pada} bolehArsipkan={p.hak.boleh_ubah} judul="Bukti & lampiran" />
          <RiwayatAudit entriId={id} />
        </div>

        <aside className="space-y-5">
          {e.status_kasus === "dinaikkan" && kasus[0] ? (
            <Panel judul="Sudah menjadi kasus">
              <p className="mb-3 text-sm">Informasi ini telah dinaikkan menjadi kasus hukuman disiplin.</p>
              <Button asChild className="w-full"><Link href={`/kasus/${kasus[0].id}`}><FolderCheck /> Buka {kasus[0].nomor_registrasi}</Link></Button>
            </Panel>
          ) : aktif ? (
            <Panel judul="Naikkan jadi kasus" deskripsi="Kasus baru akan dihitung dalam tenggat dan statistik.">
              <ul className="mb-4 space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  {syaratTerlapor ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-aman" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                  Pegawai terlapor teridentifikasi dari master pegawai
                </li>
                <li className="flex items-start gap-2">
                  {syaratBukti ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-aman" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                  Ada pelapor bernama, atau bukti / rekap kehadiran terunggah
                </li>
              </ul>
              {p.hak.boleh_buat && (
                bolehNaik ? (
                  <Button asChild className="w-full" size="lg"><Link href={`/kasus/baru?dari=${id}`}><ArrowUpRight /> Naikkan jadi kasus</Link></Button>
                ) : (
                  <Button className="w-full" size="lg" disabled><ArrowUpRight /> Naikkan jadi kasus</Button>
                )
              )}
              {p.hak.boleh_buat && e.pegawai_id && (
                <Button asChild variant="outline" className="mt-2 w-full"><Link href={`/pembinaan/baru?dari=${id}`}><HandHeart /> Catat sebagai pembinaan</Link></Button>
              )}
            </Panel>
          ) : null}

          {(p.hak.boleh_ubah || p.hak.boleh_arsipkan) && (
            <Panel judul="Tindakan lain">
              <div className="flex flex-col gap-2">
                {p.hak.boleh_ubah && aktif && (
                  <DialogAlasan pemicu={<Button variant="outline"><XCircle /> Tutup tanpa tindak lanjut</Button>} judul="Tutup informasi ini?"
                    deskripsi="Informasi tetap tersimpan dan dapat dicari, tetapi tidak lagi muncul di kotak masuk." labelTombol="Tutup informasi" aksi={tutupInformasi.bind(null, id)} />
                )}
                {p.hak.boleh_arsipkan && !e.diarsipkan_pada && (
                  <DialogAlasan pemicu={<Button variant="outline"><Archive /> Arsipkan (sembunyikan)</Button>} judul="Arsipkan informasi ini?"
                    deskripsi="Tidak dihapus permanen; tercatat di log audit." labelTombol="Arsipkan" aksi={arsipkanEntri.bind(null, id)} />
                )}
                {p.hak.boleh_arsipkan && e.diarsipkan_pada && (
                  <DialogAlasan pemicu={<Button variant="outline"><RotateCcw /> Pulihkan</Button>} judul="Pulihkan dari arsip?" labelTombol="Pulihkan" aksi={pulihkanEntri.bind(null, id)} />
                )}
              </div>
            </Panel>
          )}
          {e.diarsipkan_pada && <Catatan jenis="waspada" judul="Diarsipkan">{e.alasan_diarsipkan}</Catatan>}
        </aside>
      </div>
    </>
  );
}
