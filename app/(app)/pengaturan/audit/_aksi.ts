"use server";

import ExcelJS from "exceljs";
import { wajibPengguna } from "@/lib/auth";
import { catatAudit } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";
import { waktuPendek } from "@/lib/format";
import { ambilAudit, bolehLihatAudit, hitungAudit, LABEL_AKSI, rapikanFilter } from "./_kueri";

const BATAS_EKSPOR = 20000;

/** Ekspor tampilan log audit yang sedang difilter ke Excel. Mengembalikan isi berkas (base64). */
export async function eksporAudit(filter: Record<string, string | undefined>) {
  return jalankan(async () => {
    const p = await wajibPengguna();
    if (!bolehLihatAudit(p)) throw new GalatPengguna("Anda tidak memiliki hak untuk melihat log audit.");
    const f = rapikanFilter(filter);
    const total = await hitungAudit(f);
    if (!total) throw new GalatPengguna("Tidak ada catatan yang cocok dengan filter untuk diekspor.");
    if (total > BATAS_EKSPOR) throw new GalatPengguna(`Terlalu banyak catatan (${total.toLocaleString("id-ID")}). Persempit rentang tanggal hingga paling banyak ${BATAS_EKSPOR.toLocaleString("id-ID")} catatan.`);
    const rows = await ambilAudit(f, BATAS_EKSPOR);

    const wb = new ExcelJS.Workbook();
    wb.creator = "SIMPEL";
    wb.created = new Date();
    const ws = wb.addWorksheet("Log audit", {
      headerFooter: { oddHeader: "&C&\"-,Bold\"RAHASIA", oddFooter: "&LSIMPEL — Log audit&RHalaman &P dari &N" },
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
      views: [{ state: "frozen", ySplit: 4 }],
    });
    ws.mergeCells("A1:J1");
    ws.getCell("A1").value = "RAHASIA — Log audit SIMPEL";
    ws.getCell("A1").font = { bold: true, size: 14 };
    ws.mergeCells("A2:J2");
    const ket = [
      f.dari || f.sampai ? `Tanggal: ${f.dari ?? "awal"} s.d. ${f.sampai ?? "kini"}` : "Semua tanggal",
      f.aksi ? `Aksi: ${LABEL_AKSI[f.aksi] ?? f.aksi}` : null,
      f.tabel ? `Tabel: ${f.tabel}` : null,
      f.user ? `Pengguna: ${f.user === "sistem" ? "sistem" : rows[0]?.email ?? f.user}` : null,
      f.q ? `Kata kunci: ${f.q}` : null,
      `Diekspor oleh ${p.nama} (${p.email}), ${waktuPendek(new Date())} WIB · ${rows.length} catatan`,
    ].filter(Boolean).join(" · ");
    ws.getCell("A2").value = ket;
    ws.getCell("A2").font = { italic: true, color: { argb: "FF555555" } };

    const kolom = [
      { judul: "Waktu (WIB)", lebar: 20 }, { judul: "Nama", lebar: 24 }, { judul: "Email", lebar: 28 }, { judul: "Aksi", lebar: 14 },
      { judul: "Tabel", lebar: 18 }, { judul: "ID data", lebar: 38 }, { judul: "Nomor registrasi", lebar: 20 }, { judul: "Alasan", lebar: 30 },
      { judul: "Rincian", lebar: 70 }, { judul: "Alamat IP", lebar: 16 },
    ];
    ws.columns = kolom.map((k) => ({ width: k.lebar }));
    const kepala = ws.getRow(4);
    kolom.forEach((k, i) => { kepala.getCell(i + 1).value = k.judul; });
    kepala.font = { bold: true };
    kepala.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } }; c.border = { bottom: { style: "thin" } }; });

    for (const r of rows) {
      const baris = ws.addRow([
        waktuPendek(r.waktu), r.nama ?? (r.email === "sistem" ? "Sistem" : ""), r.email ?? "", LABEL_AKSI[r.aksi] ?? r.aksi, r.tabel ?? "",
        r.record_id ?? "", r.nomor_registrasi ?? "", r.alasan ?? "", r.ringkasan_perubahan ? JSON.stringify(r.ringkasan_perubahan) : "", r.ip ?? "",
      ]);
      baris.alignment = { vertical: "top", wrapText: true };
    }
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: kolom.length } };

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    await catatAudit(p, { aksi: "ekspor", tabel: "audit_log", ringkasan: { format: "xlsx", jumlah: rows.length, filter: f } });
    const tgl = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    return { base64: buf.toString("base64"), nama: `log-audit-simpel-${tgl}.xlsx`, jumlah: rows.length };
  });
}
