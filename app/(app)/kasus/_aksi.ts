"use server";

import { revalidatePath } from "next/cache";
import { wajibHak, wajibPengguna } from "@/lib/auth";
import { sql, transaksi } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";
import { buatKasus, catatHukuman, gantiTingkat, pratinjauKasus, segarkanTenggat, selaraskanStatus, selesaikanTahap, tambahPelanggaran, type MasukanKasus, type MasukanPratinjau } from "@/lib/kasus";
import { muatAturan, muatKalender } from "@/lib/regulasi";
import { hitungTanggalTenggat, usulTingkatPelanggaran, validasiTim } from "@/lib/hukdis/mesin";
import { ambilPegawai, peringkatGolongan } from "@/lib/entri";

function segarkan(id?: string) {
  revalidatePath("/kasus");
  if (id) revalidatePath(`/kasus/${id}`);
  revalidatePath("/beranda");
}

/** Pratinjau turunan aturan untuk wizard kasus baru (tanpa menyimpan). */
export async function pratinjauKasusAksi(m: MasukanPratinjau) {
  return jalankan(async () => {
    await wajibPengguna();
    const p = await pratinjauKasus(m);
    return {
      pegawai: p.pegawai ? { id: p.pegawai.id, nama: p.pegawai.nama_lengkap_gelar, nip: p.pegawai.nip, status: p.pegawai.status_pegawai, golongan: p.pegawai.golongan_ruang, unit: p.pegawai.unit_kerja } : null,
      rezimKode: p.rezimKode,
      resolusi: p.resolusi ? { status: p.resolusi.status, pesan: "pesan" in p.resolusi ? p.resolusi.pesan : null, kandidat: p.resolusi.kandidat.map((k) => ({ id: k.id, nama_singkat: k.nama_singkat, berlaku_dari: k.berlaku_dari, berlaku_sampai: k.berlaku_sampai })) } : null,
      regulasi: p.regulasi ? { id: p.regulasi.id, nama_singkat: p.regulasi.nama_singkat, nama_lengkap: p.regulasi.nama_lengkap, berlaku_dari: p.regulasi.berlaku_dari, berlaku_sampai: p.regulasi.berlaku_sampai, katalog_pasal_lengkap: p.regulasi.katalog_pasal_lengkap } : null,
      tingkat: p.tingkat.map((t) => ({ kode: t.kode, nama: t.nama, urutan: t.urutan })),
      tingkatKode: p.tingkatKode,
      usulanKehadiran: p.usulanKehadiran,
      kewenangan: p.kewenangan ? {
        pemeriksa: p.kewenangan.pemeriksa ? { nama: p.kewenangan.pemeriksa.aturan.nama_peran, pasal: p.kewenangan.pemeriksa.aturan.pasal_rujukan, catatan: p.kewenangan.pemeriksa.aturan.catatan } : null,
        pembentuk_tim: p.kewenangan.pembentuk_tim ? { nama: p.kewenangan.pembentuk_tim.aturan.nama_peran, pasal: p.kewenangan.pembentuk_tim.aturan.pasal_rujukan, catatan: p.kewenangan.pembentuk_tim.aturan.catatan } : null,
        penjatuh: p.kewenangan.penjatuh ? { nama: p.kewenangan.penjatuh.aturan.nama_peran, pasal: p.kewenangan.penjatuh.aturan.pasal_rujukan, catatan: p.kewenangan.penjatuh.aturan.catatan } : null,
        bentukTim: p.kewenangan.bentukTim,
      } : null,
      tahapan: p.tahapan.map((t) => ({ kode: t.kode_tahap, nama: t.nama, opsional: t.opsional, pasal: t.pasal_rujukan })),
      pemotonganIk: p.pemotonganIk,
      peringatan: p.peringatan,
    };
  });
}

/** Daftar pasal kewajiban/larangan milik satu peraturan (pemilihan pasal terikat peraturan). */
export async function daftarPasalAksi(regulasiId: string) {
  return jalankan(async () => {
    await wajibPengguna();
    const rows = await sql`select id, jenis, pasal, ayat, huruf, angka, teks, perlu_verifikasi from pasal_regulasi
      where regulasi_id = ${regulasiId} and aktif and jenis in ('kewajiban','larangan') order by urutan`;
    return rows.map((r) => ({ id: r.id as string, jenis: r.jenis as string, pasal: r.pasal as string, ayat: r.ayat as string | null, huruf: r.huruf as string | null, angka: r.angka as string | null, teks: r.teks as string, perlu_verifikasi: r.perlu_verifikasi as boolean }));
  });
}

export async function usulTingkatAksi(regulasiId: string, pasalId: string | null, dampak: string | null) {
  return jalankan(async () => {
    await wajibPengguna();
    const a = await muatAturan(regulasiId);
    const u = usulTingkatPelanggaran(a, pasalId, dampak);
    return u ? { tingkat: u.tingkat?.kode ?? null, nama: u.tingkat?.nama ?? null, rujukan: u.rujukan } : null;
  });
}

export async function buatKasusAksi(m: MasukanKasus) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const h = await transaksi(async (tx) => {
      const r = await buatKasus(tx, m, p.id);
      if (m.berasalDariId) {
        await tx`update entri set status_kasus = 'dinaikkan', dinaikkan_ke_id = ${r.id}, updated_by = ${p.id}
          where id = ${m.berasalDariId} and kelas = 'informasi'`;
        await catatAudit(p, { aksi: "ubah", tabel: "entri", record_id: m.berasalDariId, entri_id: m.berasalDariId, ringkasan: { dinaikkan_menjadi: r.nomor } }, tx);
      }
      await catatAudit(p, { aksi: "buat", tabel: "entri", record_id: r.id, entri_id: r.id, ringkasan: { kelas: "hukdis", nomor: r.nomor, judul: m.judul, tingkat: m.tingkatKode } }, tx);
      return r;
    });
    segarkan();
    revalidatePath("/informasi");
    return h.id;
  }, "Kasus dibuat");
}

export async function tambahPelanggaranAksi(entriId: string, x: { pasalRegulasiId?: string | null; pasalTeksBebas?: string | null; uraian?: string | null; dampak?: string | null; waktu?: string | null; tempat?: string | null }) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    await transaksi(async (tx) => {
      const [{ n }] = await tx`select coalesce(max(urutan), 0)::int + 1 as n from pelanggaran_entri where entri_id = ${entriId}`;
      await tambahPelanggaran(tx, entriId, x, n, p.id);
      await catatAudit(p, { aksi: "buat", tabel: "pelanggaran_entri", entri_id: entriId, ringkasan: x }, tx);
    });
    segarkan(entriId);
  }, "Pelanggaran ditambahkan");
}

export async function ubahPelanggaranAksi(id: string, x: { uraian?: string | null; dampak?: string | null; waktu?: string | null; tempat?: string | null }) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    await transaksi(async (tx) => {
      const [lama] = await tx`select entri_id, uraian_perbuatan, dampak, waktu, tempat from pelanggaran_entri where id = ${id}`;
      await tx`update pelanggaran_entri set uraian_perbuatan = ${x.uraian ?? null}, dampak = ${x.dampak ?? null}, waktu = ${x.waktu ?? null}, tempat = ${x.tempat ?? null}, updated_by = ${p.id} where id = ${id}`;
      await catatAudit(p, { aksi: "ubah", tabel: "pelanggaran_entri", record_id: id, entri_id: lama.entri_id, ringkasan: selisih(lama, { uraian_perbuatan: x.uraian, dampak: x.dampak, waktu: x.waktu, tempat: x.tempat }) }, tx);
      segarkan(lama.entri_id);
    });
  }, "Pelanggaran diperbarui");
}

export async function hapusPelanggaranAksi(id: string, alasan: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    await transaksi(async (tx) => {
      const [x] = await tx`select entri_id, snapshot_pasal, pasal_teks_bebas, uraian_perbuatan from pelanggaran_entri where id = ${id}`;
      const [h] = await tx`select id from hukuman where entri_id = ${x.entri_id} and tanggal_sk is not null`;
      if (h) throw new GalatPengguna("Pelanggaran tidak dapat dihapus setelah keputusan hukuman ditetapkan.");
      await tx`delete from pelanggaran_entri where id = ${id}`;
      await catatAudit(p, { aksi: "hapus", tabel: "pelanggaran_entri", record_id: id, entri_id: x.entri_id, alasan, ringkasan: { pasal: x.snapshot_pasal?.kunci ?? x.pasal_teks_bebas, uraian: x.uraian_perbuatan } }, tx);
      segarkan(x.entri_id);
    });
  }, "Pelanggaran dihapus");
}

// ---------------------------------------------------------------- tahapan
export async function ubahTahapAksi(tahapId: string, d: { tanggal_rencana?: string | null; tanggal_realisasi?: string | null; catatan?: string | null; pic_user_id?: string | null }) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    await transaksi(async (tx) => {
      const [lama] = await tx`select * from tahapan_kasus where id = ${tahapId}`;
      if (!lama) throw new GalatPengguna("Tahap tidak ditemukan.");
      const baru = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === "" ? null : v]));
      if (!Object.keys(baru).length) return;
      await tx`update tahapan_kasus set ${tx(baru as never, ...(Object.keys(baru) as never[]))}, updated_by = ${p.id} where id = ${tahapId}`;
      await segarkanTenggat(tx, lama.entri_id);
      await catatAudit(p, { aksi: "ubah", tabel: "tahapan_kasus", record_id: tahapId, entri_id: lama.entri_id, ringkasan: { tahap: lama.nama, ...selisih(lama, baru) } }, tx);
      segarkan(lama.entri_id);
    });
  }, "Tahap diperbarui");
}

export async function selesaikanTahapAksi(tahapId: string, tanggal: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah_status");
    if (!tanggal) throw new GalatPengguna("Isi tanggal realisasi.");
    await transaksi(async (tx) => {
      const [t] = await tx`select nama, entri_id from tahapan_kasus where id = ${tahapId}`;
      const entri = await selesaikanTahap(tx, tahapId, tanggal, p.id);
      await catatAudit(p, { aksi: "ubah", tabel: "tahapan_kasus", record_id: tahapId, entri_id: entri, ringkasan: { tahap: t?.nama, status: "selesai", tanggal_realisasi: tanggal } }, tx);
      segarkan(entri);
    });
  }, "Tahap ditandai selesai");
}

export async function aturStatusTahapAksi(tahapId: string, status: "berjalan" | "dilewati" | "belum", alasan?: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah_status");
    await transaksi(async (tx) => {
      const [t] = await tx`select entri_id, nama, opsional, status from tahapan_kasus where id = ${tahapId}`;
      if (status === "dilewati" && !t.opsional && !alasan) throw new GalatPengguna("Tahap wajib hanya dapat dilewati dengan alasan tertulis.");
      await tx`update tahapan_kasus set status = ${status}, catatan = case when ${alasan ?? null}::text is null then catatan else trim(both from coalesce(catatan,'') || ${"\n[" + status + "] " + (alasan ?? "")}) end, updated_by = ${p.id} where id = ${tahapId}`;
      await selaraskanStatus(tx, t.entri_id);
      await segarkanTenggat(tx, t.entri_id);
      await catatAudit(p, { aksi: "ubah", tabel: "tahapan_kasus", record_id: tahapId, entri_id: t.entri_id, alasan, ringkasan: { tahap: t.nama, status: { sebelum: t.status, sesudah: status } } }, tx);
      segarkan(t.entri_id);
    });
  }, "Status tahap diperbarui");
}

export async function gantiTingkatAksi(entriId: string, tingkatKode: string, alasan: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    await transaksi(async (tx) => {
      const [lama] = await tx`select th.kode from entri e left join tingkat_hukuman th on th.id = e.tingkat_hukuman_dugaan_id where e.id = ${entriId}`;
      await gantiTingkat(tx, entriId, tingkatKode, p.id);
      await catatAudit(p, { aksi: "ubah", tabel: "entri", record_id: entriId, entri_id: entriId, alasan, ringkasan: { tingkat_dugaan: { sebelum: lama?.kode, sesudah: tingkatKode } } }, tx);
    });
    segarkan(entriId);
  }, "Tingkat dugaan diganti dan tahapan disusun ulang");
}

// ---------------------------------------------------------------- tim pemeriksa
export async function simpanTimAksi(entriId: string, d: { jenis: string; nomor_sk?: string | null; tanggal_sk?: string | null; pejabat_pembentuk?: string | null; dilaporkan_ke_sekjen_pada?: string | null; catatan?: string | null }) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    await transaksi(async (tx) => {
      const [ada] = await tx`select * from tim_pemeriksa where entri_id = ${entriId} limit 1`;
      const bersih = { jenis: d.jenis, nomor_sk: d.nomor_sk || null, tanggal_sk: d.tanggal_sk || null, pejabat_pembentuk: d.pejabat_pembentuk || null, dilaporkan_ke_sekjen_pada: d.dilaporkan_ke_sekjen_pada || null, catatan: d.catatan || null };
      if (ada) await tx`update tim_pemeriksa set ${tx(bersih)}, updated_by = ${p.id} where id = ${ada.id}`;
      else await tx`insert into tim_pemeriksa ${tx({ ...bersih, entri_id: entriId, created_by: p.id, updated_by: p.id })}`;
      // Selaraskan tahap terkait bila tanggal diisi
      if (bersih.tanggal_sk) await tx`update tahapan_kasus set tanggal_realisasi = coalesce(tanggal_realisasi, ${bersih.tanggal_sk}) where entri_id = ${entriId} and kode_tahap = 'pembentukan_tim'`;
      if (bersih.dilaporkan_ke_sekjen_pada) await tx`update tahapan_kasus set tanggal_realisasi = coalesce(tanggal_realisasi, ${bersih.dilaporkan_ke_sekjen_pada}) where entri_id = ${entriId} and kode_tahap = 'lapor_sekjen'`;
      await segarkanTenggat(tx, entriId);
      await catatAudit(p, { aksi: ada ? "ubah" : "buat", tabel: "tim_pemeriksa", record_id: ada?.id, entri_id: entriId, ringkasan: selisih(ada, bersih) }, tx);
    });
    segarkan(entriId);
  }, "Data Tim Pemeriksa tersimpan");
}

export type MasukanAnggota = { pegawaiId?: string | null; namaBebas?: string | null; nipBebas?: string | null; jabatanBebas?: string | null; golonganRuang?: string | null; unsur: string; jabatanDalamTim: string; pernyataanBebasKonflik: boolean };

/** Menambah anggota tim — DITOLAK bila jabatan/pangkat anggota lebih rendah dari terperiksa (aturan dari kaidah peraturan). */
export async function tambahAnggotaAksi(entriId: string, a: MasukanAnggota) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    if (!a.pegawaiId && !a.namaBebas?.trim()) throw new GalatPengguna("Pilih pegawai atau ketik nama anggota.");
    if (!a.pernyataanBebasKonflik) throw new GalatPengguna("Anggota wajib menyatakan bebas dari konflik kepentingan.");
    const r = await transaksi(async (tx) => {
      const [e] = await tx`select e.regulasi_id, e.pegawai_id, e.snapshot_pegawai from entri e where e.id = ${entriId}`;
      let [tim] = await tx`select id from tim_pemeriksa where entri_id = ${entriId} limit 1`;
      if (!tim) [tim] = await tx`insert into tim_pemeriksa (entri_id, jenis, created_by, updated_by) values (${entriId}, 'um', ${p.id}, ${p.id}) returning id`;
      const pg = a.pegawaiId ? await ambilPegawai(a.pegawaiId, tx) : null;
      if (pg && pg.id === e.pegawai_id) throw new GalatPengguna("Terperiksa tidak boleh menjadi anggota Tim Pemeriksa.");
      const golAnggota = (pg?.golongan_ruang ?? a.golonganRuang ?? "").toUpperCase() || null;
      const golTerperiksa = String(e.snapshot_pegawai?.golongan_ruang ?? "").toUpperCase() || null;
      const peringkat = await peringkatGolongan(tx);
      const aturan = await muatAturan(e.regulasi_id, tx);
      const ada = await tx`select coalesce(p.nama_lengkap_gelar, a.nama_bebas) as nama, a.unsur, a.jabatan_dalam_tim, coalesce(p.golongan_ruang, a.golongan_ruang) as gol
        from anggota_tim a left join pegawai p on p.id = a.pegawai_id where a.tim_id = ${tim.id}`;
      const calon = { nama: pg?.nama_lengkap_gelar ?? a.namaBebas!.trim(), unsur: a.unsur, jabatan_dalam_tim: a.jabatanDalamTim, peringkat: golAnggota ? peringkat.get(golAnggota) ?? null : null };
      const v = validasiTim(aturan, [calon], golTerperiksa ? peringkat.get(golTerperiksa) ?? null : null);
      if (v.galat.length) throw new GalatPengguna(v.galat.join(" "));
      if (a.jabatanDalamTim !== "anggota" && ada.some((x) => x.jabatan_dalam_tim === a.jabatanDalamTim)) throw new GalatPengguna(`Tim sudah memiliki ${a.jabatanDalamTim}.`);
      const [{ n }] = await tx`select coalesce(max(urutan), 0)::int + 1 as n from anggota_tim where tim_id = ${tim.id}`;
      const [row] = await tx`insert into anggota_tim (tim_id, pegawai_id, nama_bebas, nip_bebas, jabatan_bebas, golongan_ruang, unsur, jabatan_dalam_tim,
          pernyataan_bebas_konflik, eselon_setara, urutan, created_by, updated_by)
        values (${tim.id}, ${pg?.id ?? null}, ${pg ? null : a.namaBebas?.trim() || null}, ${pg ? null : a.nipBebas || null}, ${pg ? null : a.jabatanBebas || null},
          ${golAnggota}, ${a.unsur}, ${a.jabatanDalamTim}, true, ${calon.peringkat}, ${n}, ${p.id}, ${p.id}) returning id`;
      await catatAudit(p, { aksi: "buat", tabel: "anggota_tim", record_id: row.id, entri_id: entriId, ringkasan: { nama: calon.nama, unsur: a.unsur, jabatan_dalam_tim: a.jabatanDalamTim } }, tx);
      // Peringatan komposisi setelah penambahan
      const semua = [...ada.map((x) => ({ nama: x.nama, unsur: x.unsur, jabatan_dalam_tim: x.jabatan_dalam_tim, peringkat: null })), calon];
      return validasiTim(aturan, semua, null).peringatan.filter((w) => !w.startsWith("Jenjang"));
    });
    segarkan(entriId);
    return r;
  }, "Anggota tim ditambahkan");
}

export async function hapusAnggotaAksi(anggotaId: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    await transaksi(async (tx) => {
      const [a] = await tx`select a.id, t.entri_id, coalesce(pg.nama_lengkap_gelar, a.nama_bebas) as nama from anggota_tim a join tim_pemeriksa t on t.id = a.tim_id left join pegawai pg on pg.id = a.pegawai_id where a.id = ${anggotaId}`;
      if (!a) throw new GalatPengguna("Anggota tidak ditemukan.");
      await tx`delete from anggota_tim where id = ${anggotaId}`;
      await catatAudit(p, { aksi: "hapus", tabel: "anggota_tim", record_id: anggotaId, entri_id: a.entri_id, ringkasan: { nama: a.nama } }, tx);
      segarkan(a.entri_id);
    });
  }, "Anggota dihapus dari tim");
}

// ---------------------------------------------------------------- keputusan
export async function catatHukumanAksi(entriId: string, m: { jenisHukumanId: string; nomorSk?: string | null; tanggalSk?: string | null; pejabatPenjatuh?: string | null; tanggalDiterima?: string | null; catatan?: string | null }) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    if (!m.jenisHukumanId) throw new GalatPengguna("Pilih jenis hukuman disiplin.");
    const h = await transaksi(async (tx) => {
      const r = await catatHukuman(tx, entriId, m, p.id);
      if (m.tanggalDiterima) await tx`update tahapan_kasus set tanggal_realisasi = coalesce(tanggal_realisasi, ${m.tanggalDiterima}) where entri_id = ${entriId} and kode_tahap = 'penyampaian_sk'`;
      await segarkanTenggat(tx, entriId);
      await catatAudit(p, { aksi: "ubah", tabel: "hukuman", entri_id: entriId, ringkasan: { ...m, tanggal_mulai_berlaku: r.mulai, tanggal_selesai: r.selesai, pemotongan_ik: r.pemotonganIk } }, tx);
      return r;
    });
    segarkan(entriId);
    return h;
  }, "Keputusan hukuman tersimpan");
}

/** Pratinjau tanggal berlaku dari aturan tenggat 'berlaku' peraturan kasus. */
export async function hitungBerlakuAksi(entriId: string, tanggalDiterima: string) {
  return jalankan(async () => {
    await wajibPengguna();
    const [e] = await sql`select regulasi_id from entri where id = ${entriId}`;
    const a = await muatAturan(e.regulasi_id);
    const t = a.tenggat.find((x) => x.kode_tahap === "berlaku");
    if (!t || !tanggalDiterima) return null;
    return { tanggal: hitungTanggalTenggat(t, tanggalDiterima, await muatKalender()), aturan: `${t.jumlah} ${t.satuan.replace("_", " ")} ${t.arah} diterima — ${t.pasal_rujukan ?? ""}` };
  });
}

// ---------------------------------------------------------------- cabang proses
export async function simpanUpayaAksi(entriId: string, d: { id?: string; jenis: string; tanggal_pengajuan?: string | null; diajukan_kepada?: string | null; tanggal_putusan?: string | null; hasil?: string | null; nomor_putusan?: string | null; catatan?: string | null }) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    await transaksi(async (tx) => {
      const [e] = await tx`select regulasi_id, status_kasus from entri where id = ${entriId}`;
      const a = await muatAturan(e.regulasi_id, tx);
      const t = a.tenggat.find((x) => x.kode_tahap === "upaya_administratif");
      const pengingat = t && d.tanggal_pengajuan ? hitungTanggalTenggat({ ...t, dihitung_dari: "upaya_administratif" }, d.tanggal_pengajuan, await muatKalender(tx)) : null;
      const bersih = { jenis: d.jenis, tanggal_pengajuan: d.tanggal_pengajuan || null, diajukan_kepada: d.diajukan_kepada || null, tanggal_putusan: d.tanggal_putusan || null, hasil: d.hasil || null, nomor_putusan: d.nomor_putusan || null, catatan: d.catatan || null, tenggat_pengingat: pengingat };
      if (d.id) await tx`update upaya_administratif set ${tx(bersih)}, updated_by = ${p.id} where id = ${d.id} and entri_id = ${entriId}`;
      else await tx`insert into upaya_administratif ${tx({ ...bersih, entri_id: entriId, created_by: p.id, updated_by: p.id })}`;
      // Status kasus: upaya administratif selama ada pengajuan tanpa putusan
      const [{ terbuka }] = await tx`select count(*)::int as terbuka from upaya_administratif where entri_id = ${entriId} and tanggal_putusan is null`;
      if (terbuka > 0 && !["selesai", "dihentikan"].includes(e.status_kasus)) await tx`update entri set status_kasus = 'upaya_administratif' where id = ${entriId}`;
      if (terbuka === 0 && e.status_kasus === "upaya_administratif") {
        await tx`update entri set status_kasus = 'penyampaian' where id = ${entriId}`;
        await selaraskanStatus(tx, entriId);
      }
      await catatAudit(p, { aksi: d.id ? "ubah" : "buat", tabel: "upaya_administratif", record_id: d.id, entri_id: entriId, ringkasan: bersih }, tx);
    });
    segarkan(entriId);
  }, "Upaya administratif tersimpan");
}

export async function simpanPembebasanAksi(entriId: string, d: { nomor_sk?: string | null; tanggal_sk?: string | null; tanggal_mulai?: string | null; tanggal_selesai?: string | null; catatan?: string | null }) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    await transaksi(async (tx) => {
      const [ada] = await tx`select id from pembebasan_sementara where entri_id = ${entriId} limit 1`;
      const bersih = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v || null]));
      if (ada) await tx`update pembebasan_sementara set ${tx(bersih)}, updated_by = ${p.id} where id = ${ada.id}`;
      else await tx`insert into pembebasan_sementara ${tx({ ...bersih, entri_id: entriId, created_by: p.id, updated_by: p.id })}`;
      await catatAudit(p, { aksi: ada ? "ubah" : "buat", tabel: "pembebasan_sementara", entri_id: entriId, ringkasan: bersih }, tx);
    });
    segarkan(entriId);
  }, "Pembebasan sementara tersimpan");
}

export async function simpanPenghentianGajiAksi(entriId: string, d: { tanggal_mulai_tmk?: string | null; jumlah_hari_berturut?: number | null; tanggal_lapor_atasan?: string | null; tanggal_verval?: string | null; tanggal_ke_kpa?: string | null; tanggal_sk_kpa?: string | null; nomor_sk_kpa?: string | null; catatan?: string | null }) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    await transaksi(async (tx) => {
      const [ada] = await tx`select id from penghentian_gaji where entri_id = ${entriId} limit 1`;
      const bersih: Record<string, unknown> = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === "" ? null : v ?? null]));
      bersih.status = bersih.tanggal_sk_kpa ? "selesai" : "berjalan";
      if (ada) await tx`update penghentian_gaji set ${tx(bersih as never)}, updated_by = ${p.id} where id = ${ada.id}`;
      else await tx`insert into penghentian_gaji ${tx({ ...bersih, entri_id: entriId, created_by: p.id, updated_by: p.id } as never)}`;
      await catatAudit(p, { aksi: ada ? "ubah" : "buat", tabel: "penghentian_gaji", entri_id: entriId, ringkasan: bersih }, tx);
    });
    segarkan(entriId);
  }, "Checklist penghentian gaji tersimpan");
}

export async function hentikanKasusAksi(entriId: string, alasanKode: string, alasan: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah_status");
    await transaksi(async (tx) => {
      await tx`update entri set status_kasus = 'dihentikan', alasan_penghentian = ${alasanKode}, tanggal_selesai = current_date,
          catatan_internal = trim(both from coalesce(catatan_internal,'') || ${"\n[Dihentikan] " + alasan}), updated_by = ${p.id} where id = ${entriId}`;
      await tx`update tahapan_kasus set status = 'dilewati' where entri_id = ${entriId} and status in ('belum','berjalan')`;
      await catatAudit(p, { aksi: "ubah", tabel: "entri", record_id: entriId, entri_id: entriId, alasan, ringkasan: { status_kasus: "dihentikan", alasan_penghentian: alasanKode } }, tx);
    });
    segarkan(entriId);
  }, "Kasus dihentikan");
}

export async function aturPicAksi(entriId: string, userId: string | null) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    await sql`update entri set pic_user_id = ${userId}, updated_by = ${p.id} where id = ${entriId}`;
    await catatAudit(p, { aksi: "ubah", tabel: "entri", record_id: entriId, entri_id: entriId, ringkasan: { pic_user_id: userId } });
    segarkan(entriId);
  }, "Penanggung jawab diperbarui");
}
