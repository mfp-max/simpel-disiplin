import Link from "next/link";
import { Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JudulHalaman, Kosong } from "@/components/simpel/dasar";
import { Lencana, LencanaRezim } from "@/components/simpel/lencana";
import { BilahFilter } from "@/components/simpel/bilah-filter";
import { Halaman, NamaPegawai, TabelEntri } from "@/components/simpel/tabel-entri";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { angka } from "@/lib/format";

export const metadata = { title: "Pegawai" };
const PER = 25;

type Baris = {
  id: string; nip: string | null; nama_lengkap_gelar: string; status_pegawai: string | null; rezim_kode: string | null; rezim_nama: string | null;
  golongan_ruang: string | null; jabatan: string | null; unit_kerja: string | null; direktorat_fakultas: string | null; aktif: boolean; hukdis_aktif: number;
};

export default async function DaftarPegawai({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await wajibMasuk();
  const sp = await searchParams;
  const hal = Math.max(1, Math.floor(Number(sp.hal ?? 1)) || 1);
  const q = sp.q?.trim();
  const pola = q ? `%${q}%` : null;
  const status = sp.status;
  const rezim = sp.rezim;
  const unit = sp.unit && /^[0-9a-f-]{36}$/i.test(sp.unit) ? sp.unit : null;

  const where = sql`pg.diarsipkan_pada is null
    ${pola ? sql`and (pg.nama_lengkap_gelar ilike ${pola} or pg.nama_tanpa_gelar ilike ${pola} or pg.nip ilike ${pola} or pg.nip_lama ilike ${pola})` : sql``}
    ${status ? sql`and pg.status_pegawai = ${status}` : sql``}
    ${rezim === "verifikasi" ? sql`and pg.rezim_kode is null` : rezim ? sql`and pg.rezim_kode = ${rezim}` : sql``}
    ${unit ? sql`and pg.unit_kerja_id in (
        with recursive turun as (select id from unit_kerja where id = ${unit} union all select u.id from unit_kerja u join turun t on u.induk_id = t.id)
        select id from turun)` : sql``}`;

  const [rows, [{ total }], semua, statusOpsi, rezimOpsi, unitOpsi] = await Promise.all([
    sql`select pg.id, pg.nip, pg.nama_lengkap_gelar, pg.status_pegawai, pg.rezim_kode, rz.nama as rezim_nama, pg.golongan_ruang, pg.aktif,
          coalesce(nullif(pg.jabatan_tambahan, ''), nullif(pg.jabatan_fungsional, ''), pg.jenis_pegawai) as jabatan,
          coalesce(uk.nama, pg.unit_kerja) as unit_kerja, pg.direktorat_fakultas,
          (select count(*) from entri e where e.pegawai_id = pg.id and e.kelas = 'hukdis' and e.diarsipkan_pada is null
             and e.status_kasus in (select kode from status_kasus where kelompok = 'berjalan'))::int as hukdis_aktif
        from pegawai pg left join rezim rz on rz.kode = pg.rezim_kode left join unit_kerja uk on uk.id = pg.unit_kerja_id
        where ${where} order by pg.nama_lengkap_gelar limit ${PER} offset ${(hal - 1) * PER}`,
    sql`select count(*)::int as total from pegawai pg where ${where}`,
    sql`select count(*)::int as n, count(*) filter (where rezim_kode is null)::int as verifikasi from pegawai where diarsipkan_pada is null`,
    sql`select status_pegawai, count(*)::int as n from pegawai where diarsipkan_pada is null and status_pegawai is not null group by 1 order by 2 desc`,
    sql`select kode, nama from rezim where aktif order by urutan`,
    sql`select id, nama from unit_kerja where induk_id is null and aktif order by nama`,
  ]);
  const ringkas = semua[0] as { n: number; verifikasi: number };

  const dasar = (h: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set("hal", String(h));
    return `/pegawai?${u}`;
  };
  const adaFilter = !!(q || status || rezim || unit);
  const aksiImpor = p.hak.kelola_pengaturan ? (
    <Button asChild size="lg"><Link href="/pengaturan/impor"><Upload /> Impor dari Simpega</Link></Button>
  ) : null;

  return (
    <>
      <JudulHalaman
        judul="Pegawai"
        deskripsi="Master pegawai hasil impor Simpega, beserta rezim disiplin dan riwayat kasusnya."
        aksi={aksiImpor}
      />

      {ringkas.n === 0 ? (
        <Kosong
          ikon={Users}
          judul="Belum ada data pegawai"
          deskripsi={p.hak.kelola_pengaturan
            ? "Impor berkas Excel rekap Simpega agar pegawai bisa dipilih saat mencatat informasi atau membuat kasus."
            : "Data pegawai belum diimpor. Minta admin mengimpor berkas Excel rekap Simpega."}
          aksi={aksiImpor}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            <Lencana>{angka(ringkas.n)} pegawai</Lencana>
            {ringkas.verifikasi > 0 && (
              <Link href="/pegawai?rezim=verifikasi" className="inline-flex"><Lencana warna="waspada">{angka(ringkas.verifikasi)} rezim perlu verifikasi</Lencana></Link>
            )}
          </div>
          <BilahFilter
            placeholder="Cari nama atau NIP…"
            filter={[
              { nama: "status", label: "Status pegawai", opsi: statusOpsi.map((s) => ({ nilai: s.status_pegawai as string, label: `${s.status_pegawai} (${s.n})` })) },
              { nama: "rezim", label: "Rezim", opsi: [...rezimOpsi.map((r) => ({ nilai: r.kode as string, label: r.nama as string })), { nilai: "verifikasi", label: "Perlu verifikasi" }] },
              { nama: "unit", label: "Unit / fakultas", opsi: unitOpsi.map((u) => ({ nilai: u.id as string, label: u.nama as string })) },
            ]}
          />
          {rows.length === 0 ? (
            <Kosong ikon={Users} judul="Tidak ada yang cocok" deskripsi="Coba kata kunci lain atau hapus filter." />
          ) : (
            <>
              {adaFilter && <p className="mb-2 text-sm text-muted-foreground">{angka(total)} pegawai cocok dengan pencarian.</p>}
              <TabelEntri<Baris>
                rows={rows as unknown as Baris[]}
                href={(r) => `/pegawai/${r.id}`}
                judulKartu={(r) => <NamaPegawai nama={r.nama_lengkap_gelar} nip={r.nip} />}
                subKartu={(r) => [r.jabatan, r.unit_kerja].filter(Boolean).join(" · ") || "—"}
                kolom={[
                  { judul: "Pegawai", isi: (r) => <NamaPegawai nama={r.nama_lengkap_gelar} nip={r.nip} />, kelas: "max-w-72" },
                  { judul: "Status", isi: (r) => <Lencana>{r.status_pegawai ?? "—"}</Lencana>, ponsel: true },
                  { judul: "Rezim", isi: (r) => <LencanaRezim kode={r.rezim_kode} nama={r.rezim_nama} />, ponsel: true },
                  { judul: "Jabatan", isi: (r) => <span className="block max-w-56 truncate">{r.jabatan ?? "—"}{r.golongan_ruang ? ` · ${r.golongan_ruang}` : ""}</span> },
                  { judul: "Unit kerja", isi: (r) => <span className="block max-w-64"><span className="block truncate">{r.unit_kerja ?? "—"}</span>{r.direktorat_fakultas && r.direktorat_fakultas !== r.unit_kerja && <span className="block truncate text-xs text-muted-foreground">{r.direktorat_fakultas}</span>}</span> },
                  { judul: "Kasus", isi: (r) => (r.hukdis_aktif ? <Lencana warna="lewat">{r.hukdis_aktif} kasus berjalan</Lencana> : <span className="text-muted-foreground">—</span>), ponsel: true },
                ]}
              />
              <Halaman total={total} halaman={hal} perHalaman={PER} dasar={dasar} />
            </>
          )}
        </>
      )}
    </>
  );
}
