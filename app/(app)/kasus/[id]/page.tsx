import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BadgeCheck, CalendarClock, Scale, UserRound, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Catatan, JudulHalaman, Kosong, Panel, Pii, Rincian } from "@/components/simpel/dasar";
import { Lencana, LencanaStatus, LencanaTenggat } from "@/components/simpel/lencana";
import { DaftarBerkas } from "@/components/simpel/daftar-berkas";
import { RiwayatAudit } from "@/components/simpel/riwayat-audit";
import { DialogAlasan } from "@/components/simpel/interaktif";
import { PanelDokumen } from "@/components/simpel/panel-dokumen";
import { PanelPemeriksaan } from "@/components/simpel/panel-pemeriksaan";
import { Button } from "@/components/ui/button";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { ringkasEntri } from "@/lib/entri";
import { daftarStatusKasus, pengaturan, referensi } from "@/lib/pengaturan";
import { muatAturan, muatKalender } from "@/lib/regulasi";
import { hariIni } from "@/lib/hari-kerja";
import { statusTenggat } from "@/lib/tenggat";
import { tanggalPanjang, waktuPendek } from "@/lib/format";
import { DaftarTahapan, type TahapTampil } from "./tahapan-klien";
import { FormTim, HapusAnggota, TambahAnggota, TambahPelanggaran } from "./pelanggaran-tim-klien";
import { AksiKepala, ChecklistGaji, FormKeputusan, FormPembebasan, FormUpaya } from "./keputusan-cabang-klien";
import { hapusPelanggaranAksi } from "../_aksi";

export const metadata = { title: "Detail kasus" };

const TAB = [
  { kode: "ringkasan", label: "Ringkasan" },
  { kode: "tahapan", label: "Tahapan" },
  { kode: "pelanggaran", label: "Pelanggaran" },
  { kode: "tim", label: "Tim Pemeriksa" },
  { kode: "pemeriksaan", label: "Pemeriksaan" },
  { kode: "dokumen", label: "Dokumen" },
  { kode: "keputusan", label: "Keputusan" },
  { kode: "cabang", label: "Cabang proses" },
  { kode: "berkas", label: "Berkas" },
  { kode: "riwayat", label: "Riwayat" },
] as const;

type Kalkulasi = {
  kewenangan?: { pemeriksa?: { nama_peran: string; pasal_rujukan: string | null } | null; pembentuk_tim?: { nama_peran: string; pasal_rujukan: string | null } | null; penjatuh?: { nama_peran: string; pasal_rujukan: string | null; catatan: string | null } | null; bentuk_tim?: string | null; peringatan?: string[] } | null;
  usulan_kehadiran?: { tingkat: string | null; jenis: string | null; jenisEfektif: string | null; diganti: boolean; pasal: string | null; akibat: string | null; alur: string | null } | null;
};

export default async function DetailKasus({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const p = await wajibMasuk();
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = TAB.some((t) => t.kode === tabParam) ? tabParam! : "ringkasan";
  const e = await ringkasEntri(id);
  if (!e || e.kelas !== "hukdis") notFound();
  await catatAudit(p, { aksi: "lihat", tabel: "entri", record_id: id, entri_id: id, ringkasan: { tab } });

  const kal = await muatKalender();
  const ambang = Number(await pengaturan<number>("ambang_peringatan_tenggat_hari", 3)) || 3;
  const hari = hariIni();
  const k = (e.kalkulasi ?? {}) as Kalkulasi;
  const kw = k.kewenangan;
  const snapPg = (e.snapshot_pegawai ?? {}) as Record<string, string | null>;
  const selesai = ["selesai", "dihentikan"].includes(e.status_kasus);
  const boleh = { ubah: p.hak.boleh_ubah && !selesai, status: p.hak.boleh_ubah_status && !selesai };

  const [tahapRows, [hukumanRow], statusList] = await Promise.all([
    sql`select * from tahapan_kasus where entri_id = ${id} order by urutan`,
    sql`select * from hukuman where entri_id = ${id} limit 1`,
    daftarStatusKasus(),
  ]);
  const berjalan = tahapRows.find((t) => t.status === "berjalan");
  const tahapTampil: TahapTampil[] = tahapRows.map((t) => {
    const info = (t.tenggat_info ?? {}) as Record<string, string | number | null>;
    const arah = info.arah === "sebelum" ? "sebelum" : "sesudah";
    const uraian = info.jumlah ? `${info.jumlah} ${String(info.satuan ?? "").replace("_", " ")} ${arah} tahap "${tahapRows.find((x) => x.kode_tahap === info.dari)?.nama ?? info.dari}" (${tanggalPanjang(info.dasar as string)})` : null;
    return {
      id: t.id, kode: t.kode_tahap, nama: t.nama, status: t.status, opsional: t.opsional, rencana: t.tanggal_rencana, realisasi: t.tanggal_realisasi,
      tenggat: t.tenggat, catatan: t.catatan, statusTenggat: statusTenggat(t.tenggat, hari, kal, ambang),
      tenggatNama: (info.nama as string) ?? null, tenggatSifat: (info.sifat as string) ?? null, tenggatPasal: (info.pasal as string) ?? null, tenggatUraian: uraian,
      pasal: t.snapshot_aturan?.pasal_rujukan ?? null, bantuan: t.snapshot_aturan?.bantuan ?? null,
    };
  });
  const lewat = tahapTampil.filter((t) => t.statusTenggat?.warna === "lewat" && (t.status === "berjalan" || t.status === "belum"));
  const tingkatOpsi = e.regulasi_id ? (await sql`select kode, nama as label from tingkat_hukuman where regulasi_id = ${e.regulasi_id} and aktif order by urutan`) as unknown as { kode: string; label: string }[] : [];
  const bolehGantiTingkat = !tahapRows.some((t, i) => i > 0 && t.status === "selesai") && !hukumanRow;

  return (
    <>
      <JudulHalaman
        kembali={{ href: "/kasus", label: "Kasus Hukdis" }}
        judul={e.judul}
        lencana={<LencanaStatus nama={e.status_nama} kelompok={e.status_kelompok} />}
        deskripsi={<span className="flex flex-wrap items-center gap-x-2 gap-y-1">{e.nomor_registrasi} · <Pii>{e.nama_pegawai}</Pii> · {e.snapshot_regulasi?.nama_singkat ?? e.regulasi_singkat}</span>}
        aksi={
          <AksiKepala
            entriId={id} tingkat={tingkatOpsi} tingkatSaatIni={e.tingkat_kode} bolehGantiTingkat={bolehGantiTingkat}
            alasanHenti={await referensi("alasan_penghentian")}
            pengguna={(await sql`select id, nama from app_users where aktif order by nama`) as unknown as { id: string; nama: string }[]}
            picSaatIni={e.pic_user_id} boleh={boleh}
          />
        }
      />

      {/* Ringkas status di atas semua tab */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KotakInfo ikon={UserRound} label="Terperiksa" nilai={<Pii>{e.nama_pegawai}</Pii>} sub={<Pii>{[e.nip_pegawai, snapPg.golongan_ruang, snapPg.jabatan].filter(Boolean).join(" · ")}</Pii>} />
        <KotakInfo ikon={Scale} label="Tingkat dugaan" nilai={<span className="capitalize">{e.tingkat_nama ?? "—"}</span>} sub={<span className="flex flex-wrap gap-1">{e.rezim_nama && <Lencana>{e.rezim_nama}</Lencana>}{e.pemotongan_ik && <Lencana warna="waspada">Pemotongan insentif kinerja</Lencana>}</span>} />
        <KotakInfo ikon={CalendarClock} label="Tahap berjalan" nilai={berjalan?.nama ?? (selesai ? e.status_nama : "—")} sub={berjalan?.tenggat ? (() => { const st = statusTenggat(berjalan.tenggat, hari, kal, ambang); return st ? <LencanaTenggat status={st} /> : null; })() : null} />
        <KotakInfo ikon={BadgeCheck} label="Pejabat penjatuh (menurut aturan)" nilai={kw?.penjatuh?.nama_peran ?? "—"} sub={kw?.penjatuh?.pasal_rujukan} />
      </div>

      {lewat.length > 0 && !selesai && (
        <div className="mb-5"><Catatan jenis="lewat" judul="Ada tenggat yang terlewat">{lewat.map((t) => t.nama).join(", ")}. Segera tindak lanjuti atau catat alasannya pada tahap terkait.</Catatan></div>
      )}
      {(kw?.peringatan ?? []).length > 0 && tab === "ringkasan" && (
        <div className="mb-5 space-y-2">{kw!.peringatan!.map((w) => <Catatan key={w} jenis="waspada">{w}</Catatan>)}</div>
      )}

      {/* Navigasi tab — bergulir di dalam kotaknya sendiri di layar kecil */}
      <nav aria-label="Bagian kasus" className="tanpa-cetak -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1 rounded-xl border bg-card p-1">
          {TAB.map((t) => (
            <li key={t.kode}>
              <Link href={`/kasus/${id}?tab=${t.kode}`} scroll={false} aria-current={tab === t.kode ? "page" : undefined}
                className={cn("flex min-h-10 items-center whitespace-nowrap rounded-lg px-3.5 text-sm font-medium", tab === t.kode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "ringkasan" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel judul="Identitas kasus">
            <Rincian items={[
              { label: "Nomor registrasi", nilai: e.nomor_registrasi },
              { label: "Tanggal peristiwa", nilai: tanggalPanjang(e.tanggal_peristiwa) },
              { label: "Peraturan dasar (dibekukan)", nilai: e.snapshot_regulasi?.nama_lengkap ?? e.regulasi_singkat, lebar: true },
              { label: "Sumber informasi", nilai: e.sumber_informasi },
              { label: "Pelapor", nilai: e.pelapor_nama, pii: true },
              { label: "Penanggung jawab", nilai: (await sql`select nama from app_users where id = ${e.pic_user_id}`)[0]?.nama },
              { label: "Dicatat", nilai: waktuPendek(e.created_at) },
              { label: "Ringkasan", nilai: <span className="whitespace-pre-wrap font-normal">{e.ringkasan}</span>, lebar: true },
            ]} />
            {e.berasal_dari_id && <p className="mt-4 text-sm">Berasal dari <Link className="underline" href={`/informasi/${e.berasal_dari_id}`}>registrasi informasi</Link>.</p>}
          </Panel>
          <Panel judul="Identitas terperiksa saat kasus dibuat" deskripsi="Salinan beku — perubahan data Simpega kemudian tidak mengubahnya.">
            <Rincian items={[
              { label: "Nama", nilai: snapPg.nama_lengkap_gelar, pii: true },
              { label: "NIP", nilai: snapPg.nip, pii: true },
              { label: "Status pegawai", nilai: snapPg.status_pegawai },
              { label: "Pangkat / golongan", nilai: [snapPg.pangkat, snapPg.golongan_ruang].filter(Boolean).join(", ") },
              { label: "Jabatan", nilai: snapPg.jabatan },
              { label: "Unit kerja", nilai: [snapPg.unit_kerja, snapPg.direktorat_fakultas].filter(Boolean).join(" — "), lebar: true },
            ]} />
            {e.pegawai_id && <p className="mt-4 text-sm"><Link className="underline" href={`/pegawai/${e.pegawai_id}`}>Lihat profil & riwayat pegawai</Link></p>}
          </Panel>
          <Panel judul="Kewenangan menurut aturan" deskripsi="Dihitung otomatis dari tabel kewenangan peraturan kasus.">
            <Rincian kolom={1} items={[
              { label: "Pemeriksa", nilai: kw?.pemeriksa ? `${kw.pemeriksa.nama_peran}${kw.pemeriksa.pasal_rujukan ? ` — ${kw.pemeriksa.pasal_rujukan}` : ""}` : "—" },
              { label: "Pembentuk Tim Pemeriksa", nilai: kw?.bentuk_tim === "tidak" ? "Tidak dibentuk Tim (pemeriksaan oleh atasan langsung)" : kw?.pembentuk_tim ? `${kw.pembentuk_tim.nama_peran}${kw.pembentuk_tim.pasal_rujukan ? ` — ${kw.pembentuk_tim.pasal_rujukan}` : ""}` : "—" },
              { label: "Pejabat penjatuh", nilai: kw?.penjatuh ? `${kw.penjatuh.nama_peran}${kw.penjatuh.pasal_rujukan ? ` — ${kw.penjatuh.pasal_rujukan}` : ""}` : "—" },
            ]} />
            {kw?.penjatuh?.catatan && <p className="mt-3 text-sm text-muted-foreground">{kw.penjatuh.catatan}</p>}
          </Panel>
          <Panel judul="Langkah berikutnya">
            {berjalan ? (
              <div className="space-y-2">
                <p className="text-lg font-semibold">{berjalan.nama}</p>
                {berjalan.tenggat && <p>Tenggat: {tanggalPanjang(berjalan.tenggat)}</p>}
                <Button asChild><Link href={`/kasus/${id}?tab=tahapan`}>Buka tahapan</Link></Button>
              </div>
            ) : <p className="text-muted-foreground">{selesai ? "Kasus telah ditutup." : "Tidak ada tahap yang sedang berjalan."}</p>}
            {k.usulan_kehadiran && (
              <div className="mt-4 rounded-lg bg-muted/60 p-3 text-sm">
                Usulan dari ambang kehadiran: <strong>{k.usulan_kehadiran.tingkat}</strong> — {k.usulan_kehadiran.jenis}
                {k.usulan_kehadiran.diganti && <> (sementara: {k.usulan_kehadiran.jenisEfektif})</>}. {k.usulan_kehadiran.pasal}
              </div>
            )}
          </Panel>
        </div>
      )}

      {tab === "tahapan" && (
        tahapTampil.length ? (
          <DaftarTahapan
            tahap={tahapTampil} hariIni={hari} boleh={boleh}
            slotDokumen={Object.fromEntries(tahapTampil.filter((t) => t.status === "berjalan").map((t) => [t.kode, <PanelDokumen key={t.kode} entriId={id} tahapKode={t.kode} ringkas />]))}
          />
        ) : <Kosong judul="Belum ada tahapan" deskripsi="Peraturan kasus ini belum memiliki daftar tahapan. Admin dapat menambahkannya di Pengaturan → Peraturan." />
      )}

      {tab === "pelanggaran" && <TabPelanggaran id={id} regulasiId={e.regulasi_id} namaRegulasi={e.snapshot_regulasi?.nama_singkat ?? ""} boleh={boleh.ubah} />}
      {tab === "tim" && <TabTim id={id} kw={kw} snapPg={snapPg} boleh={boleh.ubah} pegawaiId={e.pegawai_id} />}
      {tab === "pemeriksaan" && <PanelPemeriksaan entriId={id} />}
      {tab === "dokumen" && <PanelDokumen entriId={id} />}
      {tab === "keputusan" && <TabKeputusan id={id} regulasiId={e.regulasi_id} hukuman={hukumanRow} kw={kw} pegawaiId={e.pegawai_id} boleh={p.hak.boleh_ubah} />}
      {tab === "cabang" && <TabCabang id={id} regulasiId={e.regulasi_id} alur={k.usulan_kehadiran?.alur ?? null} boleh={p.hak.boleh_ubah} />}
      {tab === "berkas" && <DaftarBerkas entriId={id} bolehUnggah={p.hak.boleh_buat} bolehArsipkan={p.hak.boleh_ubah} />}
      {tab === "riwayat" && <RiwayatAudit entriId={id} batas={200} />}
      <span className="hidden">{statusList.length}</span>
    </>
  );
}

function KotakInfo({ ikon: Ikon, label, nilai, sub }: { ikon: React.ComponentType<{ className?: string }>; label: string; nilai: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Ikon className="size-4" /> {label}</p>
      <p className="mt-1 truncate font-semibold">{nilai}</p>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

async function TabPelanggaran({ id, regulasiId, namaRegulasi, boleh }: { id: string; regulasiId: string; namaRegulasi: string; boleh: boolean }) {
  const [rows, dampak, [reg]] = await Promise.all([
    sql`select * from pelanggaran_entri where entri_id = ${id} order by urutan`,
    referensi("dampak"),
    sql`select katalog_pasal_lengkap from regulasi where id = ${regulasiId}`,
  ]);
  const labelDampak = Object.fromEntries(dampak.map((d) => [d.kode, d.label]));
  return (
    <Panel judul="Pelanggaran yang diduga" deskripsi={`Kutipan pasal dibekukan saat dicatat — bersumber dari ${namaRegulasi} saja.`}
      aksi={boleh ? <TambahPelanggaran entriId={id} regulasiId={regulasiId} katalogLengkap={reg?.katalog_pasal_lengkap ?? true} namaRegulasi={namaRegulasi} dampak={dampak} /> : null}>
      {rows.length === 0 ? <p className="text-muted-foreground">Belum ada pelanggaran dicatat.</p> : (
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">{i + 1}. {r.snapshot_pasal?.kunci ?? r.pasal_teks_bebas ?? "Uraian"} {r.snapshot_pasal?.jenis && <Lencana>{r.snapshot_pasal.jenis}</Lencana>}</p>
                  {r.snapshot_pasal?.teks && <blockquote className="border-l-4 pl-3 text-sm italic text-muted-foreground">{r.snapshot_pasal.teks}</blockquote>}
                  {r.uraian_perbuatan && <p className="text-sm">{r.uraian_perbuatan}</p>}
                  <p className="text-sm text-muted-foreground">{[labelDampak[r.dampak] && `Dampak: ${labelDampak[r.dampak]}`, r.waktu, r.tempat].filter(Boolean).join(" · ")}</p>
                </div>
                {boleh && <DialogAlasan pemicu={<Button variant="ghost" size="sm">Hapus</Button>} judul="Hapus pelanggaran ini?" labelTombol="Hapus" variant="destructive" aksi={hapusPelanggaranAksi.bind(null, r.id)} />}
              </div>
            </li>
          ))}
        </ol>
      )}
      {rows.length > 1 && <div className="mt-4"><Catatan>Beberapa pelanggaran dalam satu pemeriksaan hanya menghasilkan satu jenis hukuman — yang terberat.</Catatan></div>}
    </Panel>
  );
}

async function TabTim({ id, kw, snapPg, boleh, pegawaiId }: { id: string; kw: Kalkulasi["kewenangan"]; snapPg: Record<string, string | null>; boleh: boolean; pegawaiId: string | null }) {
  if (kw?.bentuk_tim === "tidak") {
    const [atasan] = pegawaiId ? await sql`select a.nama_lengkap_gelar, a.nip, coalesce(nullif(a.jabatan_tambahan,''), a.jabatan_fungsional) as jabatan
      from pegawai p join pegawai a on a.nip = p.pejabat_penilai_nip where p.id = ${pegawaiId}` : [];
    return (
      <Panel judul="Pemeriksa: atasan langsung">
        <Catatan>Untuk tingkat ini tidak dibentuk Tim Pemeriksa; pemeriksaan dilakukan oleh atasan langsung{kw.pemeriksa?.pasal_rujukan ? ` (${kw.pemeriksa.pasal_rujukan})` : ""}.</Catatan>
        <div className="mt-4"><Rincian items={[{ label: "Atasan langsung (dari pejabat penilai Simpega)", nilai: atasan ? `${atasan.nama_lengkap_gelar} · ${atasan.nip}${atasan.jabatan ? ` · ${atasan.jabatan}` : ""}` : "Belum diketahui — lengkapi data pejabat penilai di master pegawai", pii: true, lebar: true }]} /></div>
      </Panel>
    );
  }
  const [[tim], unsur, jabatan, jenisTim] = await Promise.all([
    sql`select * from tim_pemeriksa where entri_id = ${id} limit 1`, referensi("unsur_tim"), referensi("jabatan_dalam_tim"), referensi("jenis_tim"),
  ]);
  const anggota = tim ? await sql`select a.*, coalesce(p.nama_lengkap_gelar, a.nama_bebas) as nama, coalesce(p.nip, a.nip_bebas) as nip,
      coalesce(nullif(p.jabatan_tambahan,''), p.jabatan_fungsional, a.jabatan_bebas) as jabatan from anggota_tim a left join pegawai p on p.id = a.pegawai_id where a.tim_id = ${tim.id} order by a.urutan` : [];
  const labelUnsur = Object.fromEntries(unsur.map((u) => [u.kode, u.label]));
  const labelJab = Object.fromEntries(jabatan.map((u) => [u.kode, u.label]));
  return (
    <div className="space-y-5">
      <Panel judul={<span className="flex items-center gap-2"><Users className="size-5" /> Tim Pemeriksa</span>} deskripsi={kw?.bentuk_tim === "wajib" ? "Tim Pemeriksa wajib dibentuk untuk tingkat ini." : "Tim Pemeriksa boleh dibentuk untuk tingkat ini."}>
        {boleh ? <FormTim entriId={id} awal={tim ? { jenis: tim.jenis, nomor_sk: tim.nomor_sk, tanggal_sk: tim.tanggal_sk, pejabat_pembentuk: tim.pejabat_pembentuk, dilaporkan_ke_sekjen_pada: tim.dilaporkan_ke_sekjen_pada, catatan: tim.catatan } : null}
          jenisTim={jenisTim} pembentukUsulan={kw?.pembentuk_tim?.nama_peran ?? null} perluLaporSekjen={!!(await sql`select 1 from tahapan_kasus where entri_id = ${id} and kode_tahap = 'lapor_sekjen'`).length} />
          : <Rincian items={[{ label: "Nomor SK", nilai: tim?.nomor_sk }, { label: "Tanggal SK", nilai: tanggalPanjang(tim?.tanggal_sk) }, { label: "Pembentuk", nilai: tim?.pejabat_pembentuk }]} />}
      </Panel>
      <Panel judul="Anggota" deskripsi={`Terperiksa: golongan ${snapPg.golongan_ruang ?? "tidak diketahui"}. Anggota tidak boleh berpangkat/berjabatan lebih rendah.`} aksi={boleh ? <TambahAnggota entriId={id} unsur={unsur} jabatan={jabatan} /> : null}>
        {anggota.length === 0 ? <p className="text-muted-foreground">Belum ada anggota.</p> : (
          <ul className="divide-y rounded-lg border">
            {anggota.map((a) => (
              <li key={a.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium"><Pii>{a.nama}</Pii></p>
                  <p className="text-sm text-muted-foreground"><Pii>{[a.nip, a.golongan_ruang, a.jabatan].filter(Boolean).join(" · ")}</Pii></p>
                  <p className="mt-1 flex flex-wrap gap-1"><Lencana warna="info">{labelJab[a.jabatan_dalam_tim] ?? a.jabatan_dalam_tim}</Lencana><Lencana>{labelUnsur[a.unsur] ?? a.unsur}</Lencana>{a.pernyataan_bebas_konflik && <Lencana warna="aman">bebas konflik</Lencana>}</p>
                </div>
                {boleh && <HapusAnggota id={a.id} />}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

async function TabKeputusan({ id, regulasiId, hukuman, kw, pegawaiId, boleh }: { id: string; regulasiId: string; hukuman: Record<string, unknown> | undefined; kw: Kalkulasi["kewenangan"]; pegawaiId: string | null; boleh: boolean }) {
  const aturan = await muatAturan(regulasiId);
  const jenis = aturan.jenis.filter((j) => !aturan.jenis.some((x) => x.pengganti_kode === j.kode)).map((j) => ({
    id: j.id!, nama: j.nama, tingkat: aturan.tingkat.find((t) => t.kode === j.tingkat_kode)?.nama ?? j.tingkat_kode, tingkatKode: j.tingkat_kode,
    durasi: j.durasi_bulan, peringatan: j.peringatan, pengganti: j.pengganti_kode ? aturan.jenis.find((x) => x.kode === j.pengganti_kode)?.nama ?? null : null,
  }));
  const riwayat = pegawaiId ? await sql`select e.nomor_registrasi, h.snapshot_jenis_hukuman, h.tanggal_sk from hukuman h join entri e on e.id = h.entri_id
    where e.pegawai_id = ${pegawaiId} and e.id <> ${id} order by h.tanggal_sk desc nulls last` : [];
  const snap = hukuman?.snapshot_jenis_hukuman as Record<string, unknown> | undefined;
  const pemberat = aturan.kaidah["pemberat_pengulangan"] as { berlaku?: boolean } | undefined;
  const kecualiHadir = aturan.kaidah["pemberat_pengulangan_berlaku_untuk_kehadiran"] === false;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <Panel judul="Keputusan hukuman disiplin" deskripsi="Jenis hukuman dibekukan saat disimpan. Tanggal berlaku dan selesai dihitung otomatis.">
        {boleh ? (
          <FormKeputusan entriId={id} jenis={jenis} penjatuhUsulan={kw?.penjatuh?.nama_peran ?? null} terkunci={!!snap}
            awal={hukuman ? { jenisHukumanId: hukuman.jenis_hukuman_id as string, nomorSk: hukuman.nomor_sk as string, tanggalSk: hukuman.tanggal_sk as string, pejabatPenjatuh: hukuman.pejabat_penjatuh as string, tanggalDiterima: hukuman.tanggal_diterima_pegawai as string, catatan: hukuman.catatan as string } : null} />
        ) : !hukuman ? <p className="text-muted-foreground">Belum ada keputusan.</p> : null}
      </Panel>
      <aside className="space-y-5">
        {hukuman && (
          <Panel judul="Ringkasan keputusan">
            <Rincian kolom={1} items={[
              { label: "Jenis (beku)", nilai: snap ? `${snap.tingkat} — ${snap.nama}` : "—" },
              ...(snap?.pengganti_sementara ? [{ label: "Dijatuhkan sementara", nilai: (snap.pengganti_sementara as { nama: string }).nama }] : []),
              { label: "Mulai berlaku", nilai: tanggalPanjang(hukuman.tanggal_mulai_berlaku as string) },
              { label: "Selesai", nilai: tanggalPanjang(hukuman.tanggal_selesai as string) },
              { label: "Akibat", nilai: [hukuman.blokir_kgb && "KGB diblokir", hukuman.blokir_kenaikan_pangkat && "kenaikan pangkat diblokir", hukuman.pemotongan_ik && "pemotongan insentif kinerja"].filter(Boolean).join(", ") || "—" },
            ]} />
          </Panel>
        )}
        <Panel judul="Riwayat hukuman pegawai">
          {riwayat.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada riwayat hukuman sebelumnya.</p> : (
            <>
              <ul className="space-y-2 text-sm">{riwayat.map((r, i) => <li key={i}>{r.snapshot_jenis_hukuman?.nama ?? "—"} <span className="text-muted-foreground">· {r.nomor_registrasi}{r.tanggal_sk ? ` · ${tanggalPanjang(r.tanggal_sk)}` : ""}</span></li>)}</ul>
              {pemberat?.berlaku && (
                <div className="mt-3"><Catatan jenis="waspada" judul="Pertimbangkan pemberat pengulangan"><AlertTriangle className="mr-1 inline size-4" />Pegawai pernah dihukum. Bila mengulang pelanggaran sejenis, hukuman lebih berat.{kecualiHadir && " Pengecualian: pelanggaran kehadiran tidak diperberat karena pengulangan."}</Catatan></div>
              )}
            </>
          )}
        </Panel>
      </aside>
    </div>
  );
}

async function TabCabang({ id, regulasiId, alur, boleh }: { id: string; regulasiId: string; alur: string | null; boleh: boolean }) {
  const [upaya, [pembebasan], [gaji], jenisUpaya, hasil, aturan] = await Promise.all([
    sql`select * from upaya_administratif where entri_id = ${id} order by created_at`,
    sql`select * from pembebasan_sementara where entri_id = ${id} limit 1`,
    sql`select * from penghentian_gaji where entri_id = ${id} limit 1`,
    referensi("jenis_upaya"), referensi("hasil_upaya"), muatAturan(regulasiId),
  ]);
  const kepada: Record<string, string> = {};
  if (aturan.kaidah["keberatan_ditujukan_kepada"]) kepada.keberatan = String(aturan.kaidah["keberatan_ditujukan_kepada"]).replace(/_/g, " ");
  if (aturan.kaidah["banding_ditujukan_kepada"]) kepada.banding = String(aturan.kaidah["banding_ditujukan_kepada"]).replace(/_/g, " ");
  const tUpaya = aturan.tenggat.find((t) => t.kode_tahap === "upaya_administratif");
  const labelJ = Object.fromEntries(jenisUpaya.map((x) => [x.kode, x.label]));
  const labelH = Object.fromEntries(hasil.map((x) => [x.kode, x.label]));
  return (
    <div className="space-y-5">
      <Panel judul="Upaya administratif" deskripsi={tUpaya ? `${tUpaya.sifat === "pengingat_internal" ? "Pengingat internal (bukan tenggat hukum)" : "Tenggat"}: ${tUpaya.jumlah} ${tUpaya.satuan.replace("_", " ")} — ${tUpaya.pasal_rujukan ?? ""}` : undefined}
        aksi={boleh ? <FormUpaya entriId={id} jenisUpaya={jenisUpaya} hasil={hasil} kepadaUsulan={kepada} /> : null}>
        {upaya.length === 0 ? <p className="text-muted-foreground">Tidak ada keberatan atau banding.</p> : (
          <ul className="divide-y rounded-lg border">
            {upaya.map((u) => (
              <li key={u.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <p className="font-medium">{labelJ[u.jenis] ?? u.jenis} · diajukan {tanggalPanjang(u.tanggal_pengajuan)} kepada {u.diajukan_kepada ?? "—"}</p>
                  <p className="text-muted-foreground">{u.tanggal_putusan ? `Diputus ${tanggalPanjang(u.tanggal_putusan)} — ${labelH[u.hasil] ?? u.hasil ?? ""}` : `Belum diputus${u.tenggat_pengingat ? ` · pengingat ${tanggalPanjang(u.tenggat_pengingat)}` : ""}`}</p>
                </div>
                {boleh && <FormUpaya entriId={id} jenisUpaya={jenisUpaya} hasil={hasil} kepadaUsulan={kepada} awal={u as never} />}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted-foreground">Selama upaya administratif belum diputus, pegawai tidak boleh disetujui pindah unit kerja.</p>
      </Panel>
      <Panel judul="Pembebasan sementara dari tugas jabatan" deskripsi="Untuk dugaan hukuman berat. Pegawai tetap masuk kerja dan tetap menerima hak kepegawaiannya.">
        {boleh ? <FormPembebasan entriId={id} awal={pembebasan ? (pembebasan as never) : null} /> : pembebasan ? <Rincian items={[{ label: "Nomor SK", nilai: pembebasan.nomor_sk }, { label: "Mulai", nilai: tanggalPanjang(pembebasan.tanggal_mulai) }]} /> : <p className="text-muted-foreground">Tidak ada.</p>}
      </Panel>
      <Panel judul="Penghentian pembayaran gaji" deskripsi={alur === "penghentian_gaji" ? "Kasus ini memenuhi ambang tidak masuk kerja berturut-turut: gaji dihentikan sejak bulan berikutnya tanpa menunggu keputusan hukuman disiplin." : "Hanya untuk tidak masuk kerja berturut-turut sesuai ambang peraturan."}>
        {alur === "penghentian_gaji" && <div className="mb-4"><Catatan jenis="lewat">Segera jalankan checklist ini.</Catatan></div>}
        {boleh ? <ChecklistGaji entriId={id} awal={gaji ? (gaji as never) : null} /> : <p className="text-muted-foreground">{gaji ? `Status: ${gaji.status}` : "Tidak ada."}</p>}
      </Panel>
    </div>
  );
}
