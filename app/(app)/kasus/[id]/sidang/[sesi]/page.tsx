import { notFound } from "next/navigation";
import { wajibMasuk } from "@/lib/auth";
import { sql, transaksi } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { ringkasEntri } from "@/lib/entri";
import { pengaturan, referensi } from "@/lib/pengaturan";
import { retensiHari } from "@/lib/rekaman";
import { daftarQa, isiPertanyaanAwal, muatSesiKlien } from "../_qa";
import type { SetBank } from "../_jenis";
import { LayarSidang, type DataLayar } from "./sidang_klien";

export const metadata = { title: "Mode sidang" };
// Penggabungan potongan rekaman bisa memakan waktu untuk sesi panjang.
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function HalamanSidang({ params }: { params: Promise<{ id: string; sesi: string }> }) {
  const p = await wajibMasuk();
  const { id, sesi: sesiId } = await params;
  if (!UUID.test(id) || !UUID.test(sesiId)) notFound();
  const e = await ringkasEntri(id);
  if (!e) notFound();
  const [cek] = await sql`select id from sesi_pemeriksaan where id = ${sesiId} and entri_id = ${id}`;
  if (!cek) notFound();

  const bolehUbah = p.hak.boleh_buat && !e.diarsipkan_pada;
  if (bolehUbah) {
    await transaksi(async (tx) => {
      const jumlah = await isiPertanyaanAwal(tx, sesiId, p.id);
      if (jumlah > 0) {
        await catatAudit(p, { aksi: "buat", tabel: "qa_pemeriksaan", record_id: sesiId, entri_id: id,
          ringkasan: { keterangan: "Pertanyaan baku disalin ke sesi pemeriksaan", jumlah } }, tx);
      }
    });
  }
  await catatAudit(p, { aksi: "lihat", tabel: "sesi_pemeriksaan", record_id: sesiId, entri_id: id, ringkasan: { layar: "mode sidang" } });

  const [qa, sesi, retensi, tim, bank, detik, moda, notulis] = await Promise.all([
    daftarQa(sql, sesiId),
    muatSesiKlien(sql, sesiId),
    retensiHari(),
    sql`select a.jabatan_dalam_tim, a.unsur, coalesce(pg.nama_lengkap_gelar, a.nama_bebas) as nama, coalesce(pg.nip, a.nip_bebas) as nip
        from anggota_tim a join tim_pemeriksa t on t.id = a.tim_id left join pegawai pg on pg.id = a.pegawai_id
        where t.id = (select id from tim_pemeriksa where entri_id = ${id} order by created_at desc limit 1)
        order by a.urutan, a.created_at`,
    sql`select id, nama_set, jenis_pelanggaran, pertanyaan from bank_pertanyaan where aktif order by nama_set, urutan, created_at`,
    pengaturan<number>("simpan_otomatis_detik", 5),
    referensi("moda_pemeriksaan"),
    sql`select u.nama from sesi_pemeriksaan s join app_users u on u.id = s.notulis_user_id where s.id = ${sesiId}`,
  ]);
  if (!sesi) notFound();

  const setBank = new Map<string, SetBank>();
  for (const b of bank) {
    const k = b.nama_set as string;
    if (!setBank.has(k)) setBank.set(k, { nama_set: k, jenis_pelanggaran: b.jenis_pelanggaran, butir: [] });
    setBank.get(k)!.butir.push({ id: b.id, pertanyaan: b.pertanyaan });
  }

  const snap = (e.snapshot_pegawai ?? {}) as Record<string, string | null>;
  const data: DataLayar = {
    entri: { id, nomor: e.nomor_registrasi, judul: e.judul, tingkat: e.tingkat_nama ?? null, diarsipkan: !!e.diarsipkan_pada },
    terperiksa: {
      nama: snap.nama_lengkap_gelar || e.nama_pegawai || "—",
      nip: snap.nip || e.nip_pegawai || null,
      pangkat: [snap.pangkat, snap.golongan_ruang].filter(Boolean).join(", ") || null,
      jabatan: snap.jabatan || null,
      unit: snap.unit_kerja || e.unit_pegawai || e.unit_nama || null,
    },
    tim: tim.map((t) => ({ nama: t.nama ?? "—", nip: t.nip ?? null, peran: t.jabatan_dalam_tim, unsur: t.unsur })),
    notulis: notulis[0]?.nama ?? null,
    modaLabel: Object.fromEntries(moda.map((m) => [m.kode, m.label])),
    sesi,
    qa,
    bank: [...setBank.values()],
    intervalDetik: Math.min(60, Math.max(2, Number(detik) || 5)),
    hak: { ubah: bolehUbah, admin: p.hak.kelola_pengaturan },
    retensiHari: retensi,
  };

  return <LayarSidang data={data} />;
}
