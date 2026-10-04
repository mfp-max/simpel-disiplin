import { NextResponse } from "next/server";
import { jalankanRetensi } from "@/lib/rekaman";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Tugas terjadwal harian (vercel.json): retensi rekaman audio pemeriksaan (PRD §9.1 butir 5).
// Dijaga dengan header Authorization: Bearer ${CRON_SECRET}.
export async function GET(req: Request) {
  const rahasia = process.env.CRON_SECRET;
  if (!rahasia || req.headers.get("authorization") !== `Bearer ${rahasia}`) {
    return NextResponse.json({ ok: false, pesan: "Tidak diizinkan" }, { status: 401 });
  }
  try {
    const hasil = await jalankanRetensi();
    return NextResponse.json({ ok: true, ...hasil });
  } catch (e) {
    console.error("[SIMPEL] cron hapus-rekaman", e);
    return NextResponse.json({ ok: false, pesan: "Tugas retensi gagal" }, { status: 500 });
  }
}
