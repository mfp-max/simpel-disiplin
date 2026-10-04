import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertOctagon, ChevronRight, Gavel, ShieldAlert } from "lucide-react";
import { Catatan, JudulHalaman, Kosong, Panel, Pii, Rincian } from "@/components/simpel/dasar";
import { Lencana, LencanaRezim, LencanaStatus } from "@/components/simpel/lencana";
import { wajibMasuk } from "@/lib/auth";
import { catatAudit } from "@/lib/audit";
import { sql } from "@/lib/db";
import { tanggalPanjang, tanggalPendek, waktuPendek } from "@/lib/format";
import { muatAturan, resolveRegulasi } from "@/lib/regulasi";
import { ambangBerikutnya, hitungAmbangKehadiran } from "@/lib/hukdis/mesin";
import { FIELD_PEGAWAI, LABEL_KOLOM } from "@/lib/simpega/normalisasi";
import { DialogRezim, DialogUbahPegawai, GridKehadiran, TombolLepasManual } from "./pegawai_klien";

export const metadata = { title: "Detail Pegawai" };

const TAUTAN_KELAS: Record<string, string> = { hukdis: "/kasus", informasi: "/informasi", arsip: "/arsip", non_hukdis: "/pembinaan" };

function hariIniWib() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

type SnapshotHukuman = { nama?: string; tingkat?: string; regulasi?: string; pasal_rujukan?: string | null; pengganti_sementara?: { nama?: string } | null };

export default async function DetailPegawai({ params }: { params: Promise<{ id: string }> }) {
  const p = await wajibMasuk();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [pg] = await sql`select pg.*, rz.nama as rezim_nama, rz.keterangan as rezim_keterangan,
      ps.status_pegawai as status_terpetakan, ps.rezim_kode as rezim_pemetaan, ps.keterangan as pemetaan_keterangan
    from pegawai pg left join rezim rz on rz.kode = pg.rezim_kode
    left join pemetaan_status_pegawai ps on lower(ps.status_pegawai) = lower(pg.status_pegawai)
    where pg.id = ${id}`;
  if (!pg) notFound();

  const hariIni = hariIniWib();
  const tahun = Number(hariIni.slice(0, 4));
  const nipAtasan = [pg.pejabat_penilai_nip, pg.atasan_pejabat_penilai_nip].filter(Boolean) as string[];

  const [rantai, atasan, entri, hukuman, larangan, kehadiran, rezimDaftar] = await Promise.all([
    pg.unit_kerja_id
      ? sql`with recursive naik as (
            select id, nama, induk_id, jenis, punya_delegasi_hukdis_ringan, 0 as d from unit_kerja where id = ${pg.unit_kerja_id}
            union all select u.id, u.nama, u.induk_id, u.jenis, u.punya_delegasi_hukdis_ringan, n.d + 1 from unit_kerja u join naik n on u.id = n.induk_id where n.d < 10
          ) select * from naik order by d desc`
      : Promise.resolve([]),
    nipAtasan.length ? sql`select id, nip, nama_lengkap_gelar from pegawai where nip in ${sql(nipAtasan)}` : Promise.resolve([]),
    sql`select e.id, e.kelas, e.nomor_registrasi, e.judul, e.status_kasus, s.nama as status_nama, s.kelompok, k.nama as kelas_nama,
          e.tanggal_peristiwa, e.tahun_peristiwa, e.created_at, e.diarsipkan_pada
        from entri e join status_kasus s on s.kode = e.status_kasus join kelas_entri k on k.kode = e.kelas
        where e.pegawai_id = ${id} order by coalesce(e.tanggal_peristiwa, make_date(coalesce(e.tahun_peristiwa, 1900), 1, 1)) desc, e.created_at desc`,
    sql`select h.id, h.entri_id, h.snapshot_jenis_hukuman, h.nomor_sk, h.tanggal_sk, h.tanggal_mulai_berlaku, h.tanggal_selesai,
          h.pemotongan_ik, h.blokir_kgb, h.blokir_kenaikan_pangkat, e.kelas, e.nomor_registrasi
        from hukuman h join entri e on e.id = h.entri_id
        where e.pegawai_id = ${id} and e.diarsipkan_pada is null order by coalesce(h.tanggal_sk, h.created_at::date) desc`,
    // Larangan pindah unit: status dibaca dari aturan_kaidah peraturan masing-masing kasus (bukan dari kode).
    sql`select e.id, e.nomor_registrasi, s.nama as status_nama, k.pasal_rujukan
        from entri e join status_kasus s on s.kode = e.status_kasus
        join aturan_kaidah k on k.regulasi_id = e.regulasi_id and k.kunci = 'larangan_pindah_unit_saat_status'
        where e.pegawai_id = ${id} and e.kelas = 'hukdis' and e.diarsipkan_pada is null
          and jsonb_typeof(k.nilai) = 'array' and k.nilai @> to_jsonb(e.status_kasus)`,
    sql`select bulan, jumlah_hari, berturut_maks from catatan_kehadiran where pegawai_id = ${id} and tahun = ${tahun} order by bulan`,
    sql`select kode, nama from rezim where aktif order by urutan`,
  ]);

  await catatAudit(p, { aksi: "lihat", tabel: "pegawai", record_id: id });

  const namaAtasan = (nip: string | null) => (nip ? (atasan.find((a) => a.nip === nip) as { id: string; nama_lengkap_gelar: string } | undefined) : undefined);
  const sedangMenjalani = hukuman.filter((h) => h.tanggal_mulai_berlaku && h.tanggal_selesai && h.tanggal_mulai_berlaku <= hariIni && hariIni <= h.tanggal_selesai);

  // Kehadiran & ambang (mesin aturan)
  const totalHari = kehadiran.reduce((s, k) => s + (Number(k.jumlah_hari) || 0), 0);
  const berturut = kehadiran.reduce<number | null>((m, k) => (k.berturut_maks == null ? m : Math.max(m ?? 0, Number(k.berturut_maks))), null);
  let ambang: { teks: string; pasal: string | null; berikutnya: string | null; regulasi: string | null; catatan: string | null } | null = null;
  let ambangGalat: string | null = null;
  if (!pg.rezim_kode) {
    ambangGalat = "Rezim pegawai perlu verifikasi, sehingga ambang kehadiran belum dapat dihitung.";
  } else {
    const res = await resolveRegulasi(pg.rezim_kode, hariIni);
    if (res.status !== "tunggal") ambangGalat = res.pesan;
    else {
      const a = await muatAturan(res.regulasi.id);
      const h = hitungAmbangKehadiran(a, totalHari, berturut);
      const b = ambangBerikutnya(a, totalHari);
      const namaJenis = h ? (h.jenisEfektif?.nama ?? h.jenis?.nama ?? null) : null;
      ambang = {
        regulasi: res.regulasi.nama_singkat,
        teks: h ? [h.tingkat?.nama, namaJenis].filter(Boolean).join(" — ") || "ada ambang yang terlampaui" : "belum mencapai ambang hukuman disiplin",
        pasal: h?.ambang.pasal_rujukan ?? null,
        catatan: h ? [h.diganti ? `jenis pengganti sementara dari ${h.jenis?.nama}` : null, h.ambang.akibat_tambahan, h.ambang.alur_khusus ? `alur khusus: ${h.ambang.alur_khusus.replace(/_/g, " ")}` : null].filter(Boolean).join("; ") || null : null,
        berikutnya: b ? `${b.ambang.hari_min} hari (${[b.tingkat?.nama, b.jenisEfektif?.nama ?? b.jenis?.nama].filter(Boolean).join(" — ")})` : null,
      };
    }
  }

  const fieldManual = (pg.field_manual ?? []) as string[];
  const bolehKelola = p.hak.kelola_pengaturan;
  const awalForm = Object.fromEntries(FIELD_PEGAWAI.map((f) => [f.kode, (pg[f.kode] as string | null) ?? ""]));
  const tandaManual = (k: string) => (fieldManual.includes(k) ? <Lencana warna="waspada" className="ml-1.5 align-middle">manual</Lencana> : null);

  const penjelasanRezim = pg.rezim_manual
    ? "Rezim ditetapkan manual oleh admin (tidak mengikuti tabel pemetaan status pegawai)."
    : pg.status_terpetakan
      ? `Mengikuti pemetaan status “${pg.status_terpetakan}”${pg.pemetaan_keterangan ? ` — ${pg.pemetaan_keterangan}` : ""}.`
      : pg.status_pegawai
        ? `Status “${pg.status_pegawai}” belum ada di tabel pemetaan status pegawai.`
        : "Status pegawai kosong.";

  return (
    <>
      <JudulHalaman
        kembali={{ href: "/pegawai", label: "Daftar pegawai" }}
        judul={<Pii>{pg.nama_lengkap_gelar}</Pii>}
        lencana={<LencanaRezim kode={pg.rezim_kode} nama={pg.rezim_nama} />}
        deskripsi={<><Pii>{pg.nip ? `NIP ${pg.nip}` : "Tanpa NIP"}</Pii>{pg.status_pegawai ? ` · ${pg.status_pegawai}` : ""}{pg.aktif ? "" : " · tidak aktif"}</>}
        aksi={bolehKelola ? <DialogUbahPegawai id={id} awal={awalForm} /> : null}
      />

      <div className="space-y-6">
        {larangan.length > 0 && (
          <div role="alert" className="flex gap-3 rounded-xl border-2 border-lewat bg-lewat-muda p-4">
            <ShieldAlert className="mt-0.5 size-6 shrink-0 text-lewat" aria-hidden />
            <div className="space-y-1">
              <p className="text-base font-bold text-lewat">Sedang dalam proses pemeriksaan / upaya administratif — tidak boleh disetujui pindah unit kerja</p>
              <p className="text-sm">
                {larangan.map((l, i) => (
                  <span key={l.id}>{i > 0 && ", "}<Link href={`/kasus/${l.id}`} className="font-medium underline">{l.nomor_registrasi}</Link> ({l.status_nama})</span>
                ))}
                {larangan[0]?.pasal_rujukan ? ` · Dasar: ${larangan[0].pasal_rujukan}` : ""}
              </p>
            </div>
          </div>
        )}

        {sedangMenjalani.length > 0 && (
          <Catatan jenis="lewat" judul="Sedang menjalani hukuman disiplin">
            <ul className="space-y-1">
              {sedangMenjalani.map((h) => {
                const s = (h.snapshot_jenis_hukuman ?? {}) as SnapshotHukuman;
                return (
                  <li key={h.id}>
                    <strong>{s.nama ?? "Hukuman disiplin"}</strong> sampai {tanggalPanjang(h.tanggal_selesai)}.
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {h.blokir_kgb && <Lencana warna="lewat">Kenaikan gaji berkala (KGB) ditunda</Lencana>}
                      {h.blokir_kenaikan_pangkat && <Lencana warna="lewat">Kenaikan pangkat ditunda</Lencana>}
                      {h.pemotongan_ik && <Lencana warna="waspada">Pemotongan insentif kinerja</Lencana>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Catatan>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel judul="Identitas" className="lg:col-span-2">
            <Rincian
              items={[
                { label: "Nama lengkap", nilai: <>{pg.nama_lengkap_gelar}{tandaManual("nama_lengkap_gelar")}</>, pii: true },
                { label: "Nama tanpa gelar", nilai: pg.nama_tanpa_gelar, pii: true },
                { label: "NIP", nilai: <>{pg.nip ?? "—"}{tandaManual("nip")}</>, pii: true },
                { label: "NIP lama", nilai: pg.nip_lama, pii: true },
                { label: "Jenis kelamin", nilai: pg.jenis_kelamin === "L" ? "Laki-laki" : pg.jenis_kelamin === "P" ? "Perempuan" : null },
                { label: "Tempat, tanggal lahir", nilai: [pg.tempat_lahir, pg.tanggal_lahir ? tanggalPanjang(pg.tanggal_lahir) : null].filter(Boolean).join(", "), pii: true },
                { label: "Email resmi", nilai: pg.email_resmi, pii: true },
                { label: "Status pegawai", nilai: <>{pg.status_pegawai ?? "—"}{tandaManual("status_pegawai")}</> },
                { label: "Jenis pegawai", nilai: pg.jenis_pegawai },
                { label: "Kelompok jabatan", nilai: pg.kelompok_jabatan },
                { label: "Pangkat / golongan ruang", nilai: <>{[pg.pangkat, pg.golongan_ruang].filter(Boolean).join(", ") || "—"}{tandaManual("golongan_pangkat")}</> },
                { label: "TMT golongan", nilai: pg.tmt_golongan ? tanggalPanjang(pg.tmt_golongan) : null },
                { label: "Jabatan fungsional", nilai: <>{pg.jabatan_fungsional ?? "—"}{tandaManual("jabatan_fungsional")}</> },
                { label: "TMT jabatan fungsional", nilai: pg.tmt_jabatan_fungsional ? tanggalPanjang(pg.tmt_jabatan_fungsional) : null },
                { label: "Jabatan tambahan", nilai: <>{pg.jabatan_tambahan ?? "—"}{tandaManual("jabatan_tambahan")}</> },
                { label: "Tanggal masuk", nilai: pg.tanggal_masuk ? tanggalPanjang(pg.tanggal_masuk) : null },
                { label: "Tanggal keluar", nilai: pg.tanggal_keluar ? tanggalPanjang(pg.tanggal_keluar) : null },
              ]}
            />
            <p className="mt-5 border-t pt-3 text-sm text-muted-foreground">
              Sumber: {pg.sumber === "impor_excel" ? "impor Excel Simpega" : pg.sumber === "api_simpega" ? "API Simpega" : "isian manual"}
              {pg.sumber_sinkron_terakhir ? ` · sinkron terakhir ${waktuPendek(pg.sumber_sinkron_terakhir as Date)}` : ""}
            </p>
            {fieldManual.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-sm">Isian yang disunting manual (tidak ditimpa impor):</p>
                <div className="flex flex-wrap gap-2">
                  {fieldManual.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 rounded-full border bg-waspada-muda py-0.5 pl-3 pr-1 text-sm">
                      {LABEL_KOLOM[f] ?? f}
                      {bolehKelola && <TombolLepasManual id={id} field={f} label={LABEL_KOLOM[f] ?? f} />}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <div className="space-y-6">
            <Panel judul="Rezim disiplin" aksi={bolehKelola ? <DialogRezim id={id} rezim={rezimDaftar.map((r) => ({ kode: r.kode as string, nama: r.nama as string }))} sekarang={pg.rezim_manual ? (pg.rezim_kode ?? "verifikasi") : "ikuti"} /> : null}>
              <div className="space-y-2 text-sm">
                <LencanaRezim kode={pg.rezim_kode} nama={pg.rezim_nama} />
                {pg.rezim_keterangan && <p>{pg.rezim_keterangan}</p>}
                <p className="text-muted-foreground">{penjelasanRezim}</p>
                {!pg.rezim_kode && <p className="text-waspada">Kasus untuk pegawai ini memerlukan penetapan dasar hukum secara manual.</p>}
              </div>
            </Panel>

            <Panel judul="Unit kerja & atasan">
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Unit kerja</p>
                  {rantai.length ? (
                    <ol className="mt-1 space-y-1">
                      {rantai.map((u, i) => (
                        <li key={u.id} className="flex items-start gap-1" style={{ paddingLeft: `${i * 0.75}rem` }}>
                          {i > 0 && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                          <span className={i === rantai.length - 1 ? "font-medium" : undefined}>{u.nama}</span>
                          {u.punya_delegasi_hukdis_ringan && <Lencana warna="info" className="ml-1">delegasi ringan</Lencana>}
                        </li>
                      ))}
                    </ol>
                  ) : <p className="font-medium">{pg.unit_kerja ?? pg.direktorat_fakultas ?? "—"}</p>}
                  {pg.subag_unit_kerja && <p className="mt-1 text-muted-foreground">Subbagian: {pg.subag_unit_kerja}</p>}
                </div>
                <Atasan label="Atasan langsung (pejabat penilai)" nip={pg.pejabat_penilai_nip} p={namaAtasan(pg.pejabat_penilai_nip)} />
                <Atasan label="Atasan pejabat penilai" nip={pg.atasan_pejabat_penilai_nip} p={namaAtasan(pg.atasan_pejabat_penilai_nip)} />
              </div>
            </Panel>
          </div>
        </div>

        <Panel judul={`Kehadiran tahun ${tahun} (TMK)`} deskripsi="Jumlah hari tidak masuk kerja tanpa alasan sah per bulan.">
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm sm:p-4">
              <p className="text-base">
                Akumulasi tahun ini: <strong>{totalHari} hari</strong>
                {ambang && <> — usulan: <strong>{ambang.teks}</strong>{ambang.pasal ? ` (${ambang.pasal})` : ""}</>}
              </p>
              {berturut !== null && <p className="text-muted-foreground">Rentetan berturut-turut terpanjang: {berturut} hari</p>}
              {ambang?.catatan && <p className="text-muted-foreground">Catatan: {ambang.catatan}</p>}
              {ambang && <p className="mt-1">{ambang.berikutnya ? <>Ambang berikutnya pada <strong>{ambang.berikutnya}</strong>.</> : "Tidak ada ambang yang lebih tinggi."}</p>}
              {ambang?.regulasi && <p className="mt-1 text-xs text-muted-foreground">Dihitung dengan {ambang.regulasi} (berlaku per {tanggalPendek(hariIni)}).</p>}
              {ambangGalat && <p className="text-waspada">{ambangGalat}</p>}
            </div>
            <GridKehadiran
              id={id}
              tahun={tahun}
              awal={kehadiran.map((k) => ({ bulan: Number(k.bulan), jumlah_hari: Number(k.jumlah_hari), berturut_maks: k.berturut_maks == null ? null : Number(k.berturut_maks) }))}
              bolehUbah={p.hak.boleh_ubah}
            />
          </div>
        </Panel>

        <Panel judul="Riwayat kasus & catatan" deskripsi="Semua registrasi informasi, pembinaan, arsip, dan kasus hukuman disiplin atas pegawai ini.">
          {entri.length === 0 ? (
            <Kosong ikon={Gavel} judul="Belum ada catatan" deskripsi="Pegawai ini belum pernah tercatat dalam registrasi informasi, pembinaan, arsip, maupun kasus." />
          ) : (
            <ul className="divide-y">
              {entri.map((e) => (
                <li key={e.id}>
                  <Link href={`${TAUTAN_KELAS[e.kelas] ?? "/kasus"}/${e.id}`} className="flex items-start gap-3 py-3 hover:bg-accent/40">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium leading-snug">{e.judul}</p>
                      <p className="text-sm text-muted-foreground">
                        {e.nomor_registrasi} · {e.kelas_nama}
                        {e.tanggal_peristiwa ? ` · ${tanggalPendek(e.tanggal_peristiwa)}` : e.tahun_peristiwa ? ` · ${e.tahun_peristiwa}` : ""}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <LencanaStatus nama={e.status_nama} kelompok={e.kelompok} />
                        {e.diarsipkan_pada && <Lencana>diarsipkan</Lencana>}
                      </div>
                    </div>
                    <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel judul="Riwayat hukuman disiplin" deskripsi="Ditampilkan dari salinan yang dibekukan saat SK ditetapkan — tidak berubah walau katalog peraturan berubah.">
          {hukuman.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada hukuman disiplin yang tercatat.</p>
          ) : (
            <ul className="divide-y">
              {hukuman.map((h) => {
                const s = (h.snapshot_jenis_hukuman ?? {}) as SnapshotHukuman;
                const aktif = sedangMenjalani.some((x) => x.id === h.id);
                return (
                  <li key={h.id} className="space-y-1 py-3 text-sm">
                    <p className="font-medium">
                      {s.tingkat ? `${s.tingkat} — ` : ""}{s.nama ?? "Jenis hukuman tidak tercatat"}
                      {aktif && <Lencana warna="lewat" className="ml-2 align-middle">sedang dijalani</Lencana>}
                    </p>
                    {s.pengganti_sementara?.nama && <p className="text-muted-foreground">Dijalankan sebagai: {s.pengganti_sementara.nama}</p>}
                    <p className="text-muted-foreground">
                      {[s.regulasi, s.pasal_rujukan, h.nomor_sk ? `SK ${h.nomor_sk}` : null, h.tanggal_sk ? tanggalPendek(h.tanggal_sk) : null].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {(h.tanggal_mulai_berlaku || h.tanggal_selesai) && (
                      <p>Berlaku {tanggalPendek(h.tanggal_mulai_berlaku)}{h.tanggal_selesai ? ` s.d. ${tanggalPendek(h.tanggal_selesai)}` : ""}</p>
                    )}
                    <Link href={`${TAUTAN_KELAS[h.kelas] ?? "/kasus"}/${h.entri_id}`} className="inline-flex min-h-11 items-center font-medium underline">{h.nomor_registrasi}</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {!pg.aktif && (
          <Catatan jenis="info"><AlertOctagon className="mr-1 inline size-4" aria-hidden />Pegawai ini bertanda tidak aktif.</Catatan>
        )}
      </div>
    </>
  );
}

function Atasan({ label, nip, p }: { label: string; nip: string | null; p?: { id: string; nama_lengkap_gelar: string } }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      {!nip ? <p className="font-medium">—</p> : p ? (
        <Link href={`/pegawai/${p.id}`} className="inline-flex min-h-11 flex-col justify-center font-medium underline">
          <Pii>{p.nama_lengkap_gelar}</Pii>
          <Pii className="text-xs font-normal text-muted-foreground no-underline">NIP {nip}</Pii>
        </Link>
      ) : (
        <p><Pii className="font-medium">NIP {nip}</Pii> <span className="text-muted-foreground">(belum ada di master pegawai)</span></p>
      )}
    </div>
  );
}
