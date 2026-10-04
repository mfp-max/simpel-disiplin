import { History } from "lucide-react";
import { sql } from "@/lib/db";
import { waktuPendek } from "@/lib/format";
import { Panel } from "./dasar";

const LABEL_AKSI: Record<string, string> = {
  lihat: "membuka", buat: "membuat", ubah: "mengubah", arsipkan: "mengarsipkan", pulihkan: "memulihkan", unduh: "mengunduh",
  cetak: "mencetak", ekspor: "mengekspor", putar: "memutar rekaman", hapus: "menghapus", koreksi: "mengoreksi", impor: "mengimpor", masuk: "masuk",
};
const LABEL_TABEL: Record<string, string> = {
  entri: "data", berkas: "berkas", dokumen: "dokumen", tahapan_kasus: "tahapan", pelanggaran_entri: "pelanggaran", tim_pemeriksa: "tim pemeriksa",
  anggota_tim: "anggota tim", hukuman: "keputusan hukuman", sesi_pemeriksaan: "sesi pemeriksaan", qa_pemeriksaan: "tanya jawab",
  upaya_administratif: "upaya administratif", penghentian_gaji: "penghentian gaji", pembebasan_sementara: "pembebasan sementara",
};

/** Jejak akses & perubahan sebuah entri (termasuk peristiwa membaca). */
export async function RiwayatAudit({ entriId, batas = 50 }: { entriId: string; batas?: number }) {
  const rows = await sql`select a.waktu, a.email, a.aksi, a.tabel, a.alasan, a.ringkasan_perubahan, u.nama
    from audit_log a left join app_users u on u.id = a.user_id where a.entri_id = ${entriId} order by a.waktu desc limit ${batas}`;
  return (
    <Panel judul={<span className="flex items-center gap-2"><History className="size-5" aria-hidden />Riwayat akses & perubahan</span>} deskripsi="Dicatat otomatis dan tidak dapat diubah atau dihapus siapa pun.">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada catatan.</p>
      ) : (
        <ol className="space-y-3">
          {rows.map((r, i) => {
            const rinci = r.ringkasan_perubahan && typeof r.ringkasan_perubahan === "object"
              ? Object.entries(r.ringkasan_perubahan as Record<string, unknown>).slice(0, 4).map(([k, v]) => {
                  if (v && typeof v === "object" && "sesudah" in (v as object)) return `${k.replace(/_/g, " ")}: ${String((v as { sesudah: unknown }).sesudah ?? "—")}`;
                  return `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
                })
              : [];
            return (
              <li key={i} className="flex gap-3 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/60" aria-hidden />
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">{r.nama ?? r.email}</span> {LABEL_AKSI[r.aksi] ?? r.aksi} {LABEL_TABEL[r.tabel] ?? r.tabel ?? ""}
                    <span className="text-muted-foreground"> · {waktuPendek(r.waktu)}</span>
                  </p>
                  {r.alasan && <p className="text-muted-foreground">Alasan: {r.alasan}</p>}
                  {rinci.length > 0 && <p className="truncate text-muted-foreground">{rinci.join(" · ")}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
