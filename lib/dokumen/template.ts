import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import InspectModule from "docxtemplater/js/inspect-module.js";

export type PlaceholderTemplate = { kode: string; jenis: "teks" | "loop"; field: string[] };
export type Pemetaan = Record<string, { sumber: "katalog"; katalog: string } | { sumber: "manual"; label: string }>;

const OPSI = { paragraphLoop: true, linebreaks: true } as const;

/** Membaca seluruh placeholder {..} dari berkas .docx (PRD §7.2 langkah 3). */
export function pindaiPlaceholder(isi: Buffer | ArrayBuffer | Uint8Array): PlaceholderTemplate[] {
  const zip = new PizZip(isi as never);
  const inspect = new InspectModule();
  try {
    new Docxtemplater(zip, { ...OPSI, modules: [inspect] });
  } catch (e) {
    throw new Error(`Berkas template tidak valid: ${pesanGalatDocx(e)}`);
  }
  const semua = inspect.getAllTags() as Record<string, Record<string, unknown>>;
  return Object.entries(semua).map(([kode, anak]) => {
    const field = Object.keys(anak ?? {}).filter((f) => f !== kode);
    return { kode, jenis: field.length ? "loop" : "teks", field };
  });
}

/** Placeholder yang kodenya ada di katalog dipetakan otomatis; sisanya isian manual. */
export function petakanOtomatis(ph: PlaceholderTemplate[], katalog: { kode: string; jenis: string }[]): Pemetaan {
  const ada = new Set(katalog.map((k) => k.kode));
  const hasil: Pemetaan = {};
  for (const p of ph) {
    hasil[p.kode] = ada.has(p.kode) ? { sumber: "katalog", katalog: p.kode } : { sumber: "manual", label: labelDariKode(p.kode) };
  }
  return hasil;
}

export function labelDariKode(kode: string) {
  const s = kode.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Mengisi template dengan data → berkas .docx baru (format asli terjaga). */
export function isiTemplate(isi: Buffer | Uint8Array, data: Record<string, unknown>): Buffer {
  const zip = new PizZip(isi as never);
  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, { ...OPSI, nullGetter: () => "" });
    doc.render(data);
  } catch (e) {
    throw new Error(`Template tidak dapat diisi: ${pesanGalatDocx(e)}`);
  }
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

function pesanGalatDocx(e: unknown): string {
  const err = e as { properties?: { errors?: { properties?: { explanation?: string } }[] }; message?: string };
  const rinci = err.properties?.errors?.map((x) => x.properties?.explanation).filter(Boolean);
  return rinci?.length ? rinci.join("; ") : err.message ?? "kesalahan tidak dikenal";
}
