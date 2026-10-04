import Link from "next/link";
import { CalendarClock, Mic, MonitorPlay } from "lucide-react";
import { penggunaSaatIni } from "@/lib/auth";
import { sql } from "@/lib/db";
import { referensi } from "@/lib/pengaturan";
import { tanggalPanjang } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Kosong, Panel } from "./dasar";
import { Lencana } from "./lencana";
import { FormJadwalSesi, TombolTidakHadir } from "./panel-pemeriksaan-klien";

const ROMAWI = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const STATUS: Record<string, { label: string; warna: "netral" | "info" | "aman" }> = {
  direncanakan: { label: "Direncanakan", warna: "netral" },
  berjalan: { label: "Berjalan", warna: "info" },
  selesai: { label: "Selesai", warna: "aman" },
};

/** Daftar sesi pemeriksaan sebuah kasus + penjadwalan + pintasan ke mode sidang (PRD §9). */
export async function PanelPemeriksaan({ entriId }: { entriId: string }) {
  const p = await penggunaSaatIni();
  const [sesi, moda, pengguna, [entri]] = await Promise.all([
    sql`select s.id, s.urutan, s.status, s.tanggal, s.jam_mulai, s.tempat, s.moda, s.terperiksa_hadir, s.persetujuan_ditolak,
          (s.rekaman_path is not null) as ada_rekaman, s.rekaman_dihapus_pada, u.nama as notulis,
          (select count(*)::int from qa_pemeriksaan q where q.sesi_id = s.id) as jumlah_qa,
          (select count(*)::int from qa_pemeriksaan q where q.sesi_id = s.id and coalesce(q.jawaban, '') <> '') as jumlah_jawab
        from sesi_pemeriksaan s left join app_users u on u.id = s.notulis_user_id
        where s.entri_id = ${entriId} order by s.urutan`,
    referensi("moda_pemeriksaan"),
    sql`select id, nama from app_users where aktif order by nama`,
    sql`select diarsipkan_pada from entri where id = ${entriId}`,
  ]);
  const bolehBuat = !!p?.hak.boleh_buat && !!entri && !entri.diarsipkan_pada;
  const labelModa = Object.fromEntries(moda.map((m) => [m.kode, m.label]));

  return (
    <Panel
      judul={<span className="flex items-center gap-2"><CalendarClock className="size-5" aria-hidden /> Sesi pemeriksaan</span>}
      deskripsi="Jadwalkan pemeriksaan, lalu buka mode sidang untuk mencatat tanya jawab secara langsung."
      aksi={bolehBuat ? (
        <FormJadwalSesi
          entriId={entriId}
          moda={moda.map((m) => ({ kode: m.kode, label: m.label }))}
          pengguna={pengguna.map((u) => ({ id: u.id as string, nama: u.nama as string }))}
          notulisBawaan={p?.id ?? null}
        />
      ) : undefined}
    >
      {!sesi.length ? (
        <Kosong ikon={CalendarClock} judul="Belum ada sesi pemeriksaan" deskripsi={bolehBuat ? "Tekan Jadwalkan sesi untuk menjadwalkan pemeriksaan pertama." : undefined} />
      ) : (
        <ul className="space-y-3">
          {sesi.map((s) => {
            const st = STATUS[s.status] ?? STATUS.direncanakan;
            return (
              <li key={s.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">Pemeriksaan {ROMAWI[s.urutan] ?? s.urutan}</p>
                      <Lencana warna={st.warna}>{st.label}</Lencana>
                      {s.terperiksa_hadir === true && <Lencana warna="aman">Terperiksa hadir</Lencana>}
                      {s.terperiksa_hadir === false && <Lencana warna="lewat">Tidak hadir</Lencana>}
                      {s.ada_rekaman && <Lencana warna="info"><Mic className="size-3.5" aria-hidden /> Ada rekaman</Lencana>}
                      {s.rekaman_dihapus_pada && <Lencana>Rekaman dihapus</Lencana>}
                      {s.persetujuan_ditolak && <Lencana>Tanpa rekaman (ditolak)</Lencana>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {s.tanggal ? tanggalPanjang(s.tanggal) : "Tanggal belum ditentukan"}
                      {s.jam_mulai && <> · pukul {String(s.jam_mulai).slice(0, 5).replace(":", ".")}</>}
                      {s.tempat && <> · {s.tempat}</>}
                      {" · "}{labelModa[s.moda] ?? s.moda}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Notulis: {s.notulis ?? "—"} · {s.jumlah_qa ? `${s.jumlah_jawab} dari ${s.jumlah_qa} pertanyaan terjawab` : "Tanya jawab belum dibuka"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 md:shrink-0 md:justify-end">
                    {bolehBuat && s.status === "direncanakan" && <TombolTidakHadir sesiId={s.id} />}
                    <Button asChild variant={s.status === "selesai" ? "outline" : "default"}>
                      <Link href={`/kasus/${entriId}/sidang/${s.id}`}>
                        <MonitorPlay aria-hidden /> {s.status === "selesai" ? "Lihat hasil sidang" : "Buka mode sidang"}
                      </Link>
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
