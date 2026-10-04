// Adapter API Simpega (jalur pelengkap, PRD §8.2).
// Endpoint, kunci, dan pemetaan field dibaca dari variabel lingkungan:
//   SIMPEGA_API_URL       — URL yang mengembalikan JSON array pegawai (atau { data: [...] })
//   SIMPEGA_API_KEY       — dikirim sebagai "Authorization: Bearer <kunci>"
//   SIMPEGA_API_PEMETAAN  — (opsional) JSON { "<nama field API>": "<field pegawai SIMPEL>" };
//                           tanpa ini, hanya field API yang namanya sama dengan field SIMPEL yang dipakai.
// Bila URL/kunci belum diisi, adapter nonaktif ("belum dikonfigurasi").
// Kebijakan: Excel tetap sumber kebenaran untuk field yang hanya ada di Excel — API hanya
// menyegarkan field yang ia punya; field hasil suntingan manual tidak ditimpa (lihat impor.ts).

import { adalahField, type BarisSumber, type FieldPegawai } from "./normalisasi";
import type { StatusSumber, SumberSimpega } from "./jenis";

function konfigurasi() {
  const url = process.env.SIMPEGA_API_URL?.trim();
  const kunci = process.env.SIMPEGA_API_KEY?.trim();
  let pemetaan: Record<string, FieldPegawai> | null = null;
  const mentah = process.env.SIMPEGA_API_PEMETAAN?.trim();
  if (mentah) {
    try {
      const o = JSON.parse(mentah) as Record<string, unknown>;
      // Hanya field dalam daftar putih yang boleh dipetakan.
      pemetaan = Object.fromEntries(Object.entries(o).filter(([, v]) => adalahField(v))) as Record<string, FieldPegawai>;
    } catch {
      pemetaan = null;
    }
  }
  return { url, kunci, pemetaan, pemetaanRusak: !!mentah && !pemetaan };
}

export function statusApi(): StatusSumber {
  const k = konfigurasi();
  if (!k.url || !k.kunci) return { aktif: false, pesan: "belum dikonfigurasi" };
  if (k.pemetaanRusak) return { aktif: false, pesan: "pemetaan field (SIMPEGA_API_PEMETAAN) tidak dapat dibaca" };
  return { aktif: true, pesan: "terkonfigurasi" };
}

function keBaris(o: Record<string, unknown>, pemetaan: Record<string, FieldPegawai> | null): BarisSumber {
  const b: BarisSumber = {};
  if (pemetaan) {
    for (const [asal, tujuan] of Object.entries(pemetaan)) {
      if (asal in o) b[tujuan] = o[asal] == null ? null : String(o[asal]);
    }
  } else {
    for (const [k, v] of Object.entries(o)) if (adalahField(k)) b[k] = v == null ? null : String(v);
  }
  return b;
}

export function sumberApi(): SumberSimpega {
  return {
    kode: "api_simpega",
    nama: "API Simpega",
    async status() {
      return statusApi();
    },
    async ambil() {
      const k = konfigurasi();
      if (!k.url || !k.kunci) throw new Error("API Simpega belum dikonfigurasi.");
      const r = await fetch(k.url, { headers: { Authorization: `Bearer ${k.kunci}`, Accept: "application/json" }, cache: "no-store" });
      if (!r.ok) throw new Error("API Simpega tidak dapat dihubungi.");
      const j = (await r.json()) as unknown;
      const daftar = (Array.isArray(j) ? j : Array.isArray((j as { data?: unknown })?.data) ? (j as { data: unknown[] }).data : []) as Record<string, unknown>[];
      return daftar.map((o, i) => ({ nomor: i + 1, ...keBaris(o ?? {}, k.pemetaan) }));
    },
  };
}
