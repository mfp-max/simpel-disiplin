// Matriks kewenangan (tingkat × jenis kewenangan) — komponen tampilan murni,
// dipakai editor dan halaman ringkasan.
import { LABEL_JENIS_KEWENANGAN, uraikanSyarat } from "../_skema";

export type BarisMatriks = { tingkat: string | null; jenis: string; nama_peran: string; syarat: unknown; prioritas: number | null; perlu_verifikasi?: boolean };

export function MatriksKewenangan({ tingkat, baris }: { tingkat: { kunci: string; nama: string }[]; baris: BarisMatriks[] }) {
  const jenis = Object.keys(LABEL_JENIS_KEWENANGAN);
  const sel = (t: string, j: string) =>
    baris
      .filter((b) => b.jenis === j && (b.tingkat === null || b.tingkat === t))
      .sort((a, b) => (a.prioritas ?? 100) - (b.prioritas ?? 100));
  if (!tingkat.length) return <p className="text-sm text-muted-foreground">Belum ada tingkat hukuman.</p>;
  return (
    <>
      {/* Ponsel: kartu per tingkat */}
      <div className="space-y-3 md:hidden">
        {tingkat.map((t) => (
          <div key={t.kunci} className="rounded-lg border p-3">
            <p className="mb-2 font-semibold">Tingkat {t.nama}</p>
            <dl className="space-y-2 text-sm">
              {jenis.map((j) => (
                <div key={j}>
                  <dt className="text-muted-foreground">{LABEL_JENIS_KEWENANGAN[j]}</dt>
                  <dd><Isi baris={sel(t.kunci, j)} /></dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {/* Layar lebar: tabel */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="p-3 font-semibold">Tingkat</th>
              {jenis.map((j) => <th key={j} className="p-3 font-semibold">{LABEL_JENIS_KEWENANGAN[j]}</th>)}
            </tr>
          </thead>
          <tbody>
            {tingkat.map((t) => (
              <tr key={t.kunci} className="border-t align-top">
                <td className="p-3 font-medium">{t.nama}</td>
                {jenis.map((j) => <td key={j} className="p-3"><Isi baris={sel(t.kunci, j)} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Isi({ baris }: { baris: BarisMatriks[] }) {
  if (!baris.length) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="space-y-1">
      {baris.map((b, i) => (
        <li key={i}>
          <span className="font-medium">{b.nama_peran}</span>
          {uraikanSyarat(b.syarat) !== "selalu" && <span className="text-muted-foreground"> — bila {uraikanSyarat(b.syarat)}</span>}
          {baris.length > 1 && i < baris.length - 1 && <span className="text-muted-foreground">; selain itu:</span>}
          {b.perlu_verifikasi && <span className="ml-1 text-xs font-semibold text-waspada">(perlu verifikasi)</span>}
        </li>
      ))}
    </ul>
  );
}
