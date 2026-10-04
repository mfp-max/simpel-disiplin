import "server-only";
// Uji regresi hukum (PRD §18.9): menjalankan seluruh fixture sebuah peraturan
// terhadap katalog di basis data, menyimpan hasilnya ke fixture_regresi, dan
// melaporkan uji yang tadinya lulus tetapi sekarang gagal.

import type { Sql } from "@/lib/db";
import type { Kalender } from "@/lib/hari-kerja";
import { aturanDariDefinisi } from "@/lib/hukdis/dari-definisi";
import { jalankanFixture } from "@/lib/hukdis/mesin";
import type { DefinisiRegulasi } from "./definisi";
import { muatAturan, muatKalender } from "./index";

export type HasilUjiFixture = {
  id: string | null;
  nama: string;
  lulus: boolean;
  lulusSebelumnya: boolean | null;
  selisih: string[];
  hasil: Record<string, unknown>;
};

export type RingkasRegresi = {
  jumlah: number;
  lulus: number;
  /** Uji yang sebelumnya lulus tetapi sekarang gagal — wajib diperingatkan. */
  memburuk: { nama: string; selisih: string[] }[];
  hasil: HasilUjiFixture[];
};

/** Menjalankan semua fixture peraturan dari basis data dan menyimpan hasilnya. */
export async function jalankanRegresi(db: Sql, regulasiId: string): Promise<RingkasRegresi> {
  const fixture = await db`select id, nama, masukan, harapan, lulus from fixture_regresi where regulasi_id = ${regulasiId} order by created_at, nama`;
  if (!fixture.length) return { jumlah: 0, lulus: 0, memburuk: [], hasil: [] };
  const [aturan, kal] = await Promise.all([muatAturan(regulasiId, db), muatKalender(db)]);
  const hasil: HasilUjiFixture[] = [];
  for (const f of fixture) {
    let h: { lulus: boolean; hasil: Record<string, unknown>; selisih: string[] };
    try {
      h = jalankanFixture(aturan, (f.masukan ?? {}) as Record<string, unknown>, (f.harapan ?? {}) as Record<string, unknown>, kal);
    } catch (e) {
      h = { lulus: false, hasil: {}, selisih: [`Uji tidak dapat dijalankan: ${(e as Error).message}`] };
    }
    await db`update fixture_regresi set hasil_terakhir = ${db.json({ hasil: h.hasil, selisih: h.selisih } as never)}, lulus = ${h.lulus},
        dijalankan_pada = now() where id = ${f.id}`;
    hasil.push({ id: f.id, nama: f.nama, lulus: h.lulus, lulusSebelumnya: f.lulus ?? null, selisih: h.selisih, hasil: h.hasil });
  }
  return ringkas(hasil);
}

function ringkas(hasil: HasilUjiFixture[]): RingkasRegresi {
  return {
    jumlah: hasil.length,
    lulus: hasil.filter((h) => h.lulus).length,
    memburuk: hasil.filter((h) => h.lulusSebelumnya === true && !h.lulus).map((h) => ({ nama: h.nama, selisih: h.selisih })),
    hasil,
  };
}

/** Menjalankan fixture sebuah definisi di memori (sebelum disimpan: wizard & impor). */
export function ujiDefinisi(def: DefinisiRegulasi, kal: Kalender): RingkasRegresi {
  const aturan = aturanDariDefinisi(def);
  const hasil: HasilUjiFixture[] = (def.fixture ?? []).map((f) => {
    try {
      const h = jalankanFixture(aturan, f.masukan ?? {}, f.harapan ?? {}, kal);
      return { id: null, nama: f.nama, lulus: h.lulus, lulusSebelumnya: null, selisih: h.selisih, hasil: h.hasil };
    } catch (e) {
      return { id: null, nama: f.nama, lulus: false, lulusSebelumnya: null, selisih: [`Uji tidak dapat dijalankan: ${(e as Error).message}`], hasil: {} };
    }
  });
  return ringkas(hasil);
}

export { muatKalender };
