import { Catatan, JudulHalaman } from "@/components/simpel/dasar";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PohonUnit, type Unit } from "./unit_klien";

export const metadata = { title: "Unit Kerja" };

export default async function HalamanUnitKerja() {
  await wajibHalamanHak("kelola_pengaturan");
  const rows = await sql`select u.id, u.nama, u.induk_id, u.jenis, u.jabatan_pimpinan, u.punya_delegasi_hukdis_ringan, u.aktif, u.keterangan,
      (select count(*) from pegawai p where p.unit_kerja_id = u.id and p.diarsipkan_pada is null)::int as jumlah_pegawai
    from unit_kerja u order by lower(u.nama)`;

  return (
    <>
      <JudulHalaman
        judul="Unit Kerja"
        kembali={{ href: "/pengaturan", label: "Pengaturan" }}
        deskripsi="Hierarki unit kerja hasil impor Simpega. Rapikan induk, pimpinan, dan tanda delegasi penjatuhan hukuman disiplin ringan."
      />
      <div className="space-y-6">
        <Catatan jenis="info" judul="Delegasi hukuman disiplin ringan — Peraturan Rektor UM 70/2026 Pasal 14 ayat (3)">
          Bagi pegawai yang diangkat Rektor, penjatuhan hukuman disiplin <strong>ringan</strong> oleh pimpinan unit kerja hanya berlaku bila pimpinan
          unit tersebut menerima delegasi: Wakil Rektor (untuk Direktorat &amp; UPT), Sekretaris Universitas, Dekan / Direktur Sekolah Pascasarjana,
          Ketua LPPM / LPPP, serta Kepala BPI / BPM / Direktur BPUDA. Centang <em>Punya delegasi hukdis ringan</em> hanya pada unit-unit itu.
          Unit di bawahnya ikut mewarisi delegasi induknya. Jika unit pegawai tidak menerima delegasi, SIMPEL memberi peringatan bahwa kewenangan
          naik ke Rektor. Tanda awal hasil impor hanyalah tebakan dari nama unit — periksa kembali.
        </Catatan>
        <PohonUnit unit={rows as unknown as Unit[]} />
      </div>
    </>
  );
}
