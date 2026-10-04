import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronDown, Lock, ScrollText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Catatan, JudulHalaman, Kosong, Panel } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { Halaman } from "@/components/simpel/tabel-entri";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { waktuPendek } from "@/lib/format";
import { ambilAudit, bolehLihatAudit, hitungAudit, LABEL_AKSI, rapikanFilter, type BarisAudit } from "./_kueri";
import { TombolEkspor } from "./audit_klien";

export const metadata = { title: "Log audit" };
const PER = 50;

const HREF_KELAS: Record<string, string> = { informasi: "/informasi", hukdis: "/kasus", non_hukdis: "/pembinaan", arsip: "/arsip" };
const WARNA_AKSI: Record<string, "netral" | "aman" | "waspada" | "lewat" | "info"> = {
  lihat: "netral", buat: "aman", ubah: "info", koreksi: "waspada", hapus: "lewat", arsipkan: "waspada", musnahkan: "lewat",
  unduh: "netral", cetak: "netral", ekspor: "waspada", masuk: "netral", putar: "waspada", impor: "info", pulihkan: "aman",
};
const KELAS_INPUT = "flex h-11 w-full rounded-md border border-input bg-card px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default async function HalamanAudit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await wajibMasuk();
  if (!bolehLihatAudit(p)) redirect("/beranda?galat=hak");
  const sp = await searchParams;
  const f = rapikanFilter(sp);
  const hal = Math.max(1, Math.floor(Number(sp.hal) || 1));

  const [rows, total, users, tabel] = await Promise.all([
    ambilAudit(f, PER, (hal - 1) * PER),
    hitungAudit(f),
    sql`select id, nama, email from app_users order by nama`,
    sql`select distinct tabel from audit_log where tabel is not null order by tabel`,
  ]);
  const adaFilter = Object.values(f).some(Boolean);
  const dasar = (h: number) => {
    const u = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
    u.set("hal", String(h));
    return `/pengaturan/audit?${u}`;
  };

  return (
    <>
      <JudulHalaman
        judul="Log audit"
        deskripsi="Catatan otomatis setiap kali data dibuka, dibuat, diubah, diarsipkan, diunduh, dicetak, atau diekspor."
        kembali={{ href: "/pengaturan", label: "Pengaturan" }}
        aksi={<TombolEkspor filter={f} total={total} />}
      />
      <div className="mb-5">
        <Catatan jenis="info" judul="Log ini tidak dapat diubah atau dihapus oleh siapa pun">
          <span className="inline-flex items-start gap-1.5"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            Termasuk admin dan pengelola basis data — basis data menolak setiap upaya mengubah atau menghapus catatan. Ekspor ke Excel juga tercatat di sini.</span>
        </Catatan>
      </div>

      <Panel className="mb-5">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1.5">
            <Label htmlFor="f-dari">Dari tanggal</Label>
            <Input id="f-dari" name="dari" type="date" defaultValue={f.dari} className="bg-card" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-sampai">Sampai tanggal</Label>
            <Input id="f-sampai" name="sampai" type="date" defaultValue={f.sampai} className="bg-card" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-user">Pengguna</Label>
            <select id="f-user" name="user" defaultValue={f.user ?? ""} className={KELAS_INPUT}>
              <option value="">Semua pengguna</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.nama}</option>)}
              <option value="sistem">Sistem (otomatis)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-aksi">Aksi</Label>
            <select id="f-aksi" name="aksi" defaultValue={f.aksi ?? ""} className={KELAS_INPUT}>
              <option value="">Semua aksi</option>
              {Object.entries(LABEL_AKSI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-tabel">Jenis data</Label>
            <select id="f-tabel" name="tabel" defaultValue={f.tabel ?? ""} className={KELAS_INPUT}>
              <option value="">Semua</option>
              {tabel.map((t) => <option key={t.tabel} value={t.tabel}>{t.tabel}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-q">Nomor registrasi / ID</Label>
            <Input id="f-q" name="q" defaultValue={f.q} placeholder="mis. HD-2026-0001" className="bg-card" />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-6">
            <Button type="submit"><Search /> Terapkan filter</Button>
            {adaFilter && <Button asChild variant="ghost"><Link href="/pengaturan/audit">Hapus filter</Link></Button>}
          </div>
        </form>
      </Panel>

      {rows.length === 0 ? (
        <Kosong ikon={ScrollText} judul={adaFilter ? "Tidak ada catatan yang cocok" : "Belum ada catatan"} deskripsi={adaFilter ? "Ubah atau hapus filter." : undefined} />
      ) : (
        <>
          <ul className="space-y-2" aria-label="Catatan audit, terbaru di atas">
            {rows.map((r) => <KartuAudit key={r.id} r={r} />)}
          </ul>
          <Halaman total={total} halaman={hal} perHalaman={PER} dasar={dasar} />
        </>
      )}
    </>
  );
}

function KartuAudit({ r }: { r: BarisAudit }) {
  const ada = r.ringkasan_perubahan || r.alasan || r.ip || r.user_agent || r.record_id;
  return (
    <li className="rounded-lg border bg-card shadow-sm">
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none flex-col gap-1 p-3 sm:flex-row sm:items-center sm:gap-4 [&::-webkit-details-marker]:hidden">
          <span className="w-40 shrink-0 text-sm tabular-nums text-muted-foreground">{waktuPendek(r.waktu)}</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{r.nama ?? (r.email === "sistem" ? "Sistem" : r.email)}</span>{" "}
            <Lencana warna={WARNA_AKSI[r.aksi] ?? "netral"}>{LABEL_AKSI[r.aksi] ?? r.aksi}</Lencana>{" "}
            <span className="text-sm">{r.tabel ?? ""}</span>
            {r.nomor_registrasi && <span className="text-sm text-muted-foreground"> · {r.nomor_registrasi}</span>}
            {r.alasan && <span className="block truncate text-sm text-muted-foreground">Alasan: {r.alasan}</span>}
          </span>
          {ada && <ChevronDown className="hidden size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 sm:block" aria-hidden />}
        </summary>
        {ada && (
          <div className="space-y-3 border-t p-3 text-sm">
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[10rem_1fr]">
              {r.email && <><dt className="text-muted-foreground">Email</dt><dd className="break-all">{r.email}</dd></>}
              {r.record_id && <><dt className="text-muted-foreground">ID data</dt><dd className="break-all font-mono text-xs">{r.record_id}</dd></>}
              {r.entri_id && (
                <>
                  <dt className="text-muted-foreground">Entri</dt>
                  <dd>{r.kelas && HREF_KELAS[r.kelas] ? <Link className="text-primary underline underline-offset-4" href={`${HREF_KELAS[r.kelas]}/${r.entri_id}`}>{r.nomor_registrasi ?? r.entri_id}</Link> : r.entri_id}</dd>
                </>
              )}
              {r.alasan && <><dt className="text-muted-foreground">Alasan</dt><dd className="whitespace-pre-wrap">{r.alasan}</dd></>}
              {r.ip && <><dt className="text-muted-foreground">Alamat IP</dt><dd>{r.ip}</dd></>}
              {r.user_agent && <><dt className="text-muted-foreground">Perangkat</dt><dd className="break-all text-xs text-muted-foreground">{r.user_agent}</dd></>}
            </dl>
            {r.ringkasan_perubahan != null && <RincianJson nilai={r.ringkasan_perubahan} />}
          </div>
        )}
      </details>
    </li>
  );
}

function teksNilai(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Ya" : "Tidak";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

function label(k: string) {
  const s = k.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function adalahSelisih(v: unknown): v is { sebelum: unknown; sesudah: unknown } {
  return !!v && typeof v === "object" && !Array.isArray(v) && "sebelum" in v && "sesudah" in v;
}

/** Menampilkan isi ringkasan perubahan dengan rapi: tabel sebelum/sesudah, atau daftar kunci–nilai. */
function RincianJson({ nilai }: { nilai: unknown }) {
  if (!nilai || typeof nilai !== "object" || Array.isArray(nilai)) {
    return <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{teksNilai(nilai)}</pre>;
  }
  const isi = Object.entries(nilai as Record<string, unknown>);
  const perubahan = isi.filter(([, v]) => adalahSelisih(v)) as [string, { sebelum: unknown; sesudah: unknown }][];
  const lain = isi.filter(([, v]) => !adalahSelisih(v));
  return (
    <div className="space-y-3">
      {perubahan.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr><th className="px-3 py-2 font-semibold">Isian</th><th className="px-3 py-2 font-semibold">Sebelum</th><th className="px-3 py-2 font-semibold">Sesudah</th></tr>
            </thead>
            <tbody>
              {perubahan.map(([k, v]) => (
                <tr key={k} className="border-t align-top">
                  <td className="px-3 py-2 font-medium">{label(k)}</td>
                  <td className="px-3 py-2"><span className="whitespace-pre-wrap break-words rounded bg-lewat-muda px-1">{teksNilai(v.sebelum)}</span></td>
                  <td className="px-3 py-2"><span className="whitespace-pre-wrap break-words rounded bg-aman-muda px-1">{teksNilai(v.sesudah)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lain.length > 0 && (
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[10rem_1fr]">
          {lain.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{label(k)}</dt>
              <dd className={typeof v === "object" && v !== null ? "whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-mono text-xs" : "break-words"}>{teksNilai(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
