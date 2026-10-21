// Uji "riwayat membeku": pegawai A kena kasus Oktober 2026, lalu naik jabatan/pangkat & ganti atasan
// (impor Simpega terbaru menimpa master pegawai), lalu kena kasus lagi Januari 2027.
// Kasus pertama harus tetap memakai keadaan saat dicatat; kasus kedua memakai keadaan baru.
//
// Jalankan: npm run uji:riwayat   (semua perubahan di dalam transaksi yang DIBATALKAN)
import { sql, izinkanKoreksi, type Sql } from "../lib/db";
import { buatKasus } from "../lib/kasus";
import { ambilPegawai, ringkasEntri, snapshotAnggota } from "../lib/entri";
import { konteksDokumen } from "../lib/dokumen/konteks";

let gagal = 0;
const cek = (ok: unknown, pesan: string, info?: unknown) => {
  console.log(`${ok ? "✓" : "✗"} ${pesan}${ok ? "" : ` — ${JSON.stringify(info)}`}`);
  if (!ok) gagal += 1;
};
class Batal extends Error {}

async function main() {
  try {
    await sql.begin(async (t) => {
      const tx = t as unknown as Sql;
      const [admin] = await tx`select id from app_users order by created_at limit 1`;
      const ins = async (nip: string, nama: string, gol: string, pangkat: string, jab: string, penilai: string | null) => {
        const [r] = await tx`insert into pegawai (nip, nama_lengkap_gelar, status_pegawai, golongan_ruang, pangkat, jabatan_fungsional, unit_kerja, rezim_kode, pejabat_penilai_nip, sumber)
          values (${nip}, ${nama}, 'PNS', ${gol}, ${pangkat}, ${jab}, 'Departemen Uji', 'A', ${penilai}, 'manual') returning id`;
        return r.id as string;
      };
      await ins("199001012015011901", "Dr. Atasan Lama, M.Pd.", "IV/a", "Pembina", "Lektor Kepala", null);
      await ins("199001012015011902", "Dr. Atasan Baru, M.Si.", "IV/b", "Pembina Tingkat I", "Lektor Kepala", null);
      const anggotaId = await ins("198001012010011903", "Prof. Anggota Tim, M.Pd.", "IV/c", "Pembina Utama Muda", "Lektor Kepala", null);
      const aId = await ins("198501012010011999", "Budi Pegawai A, S.Pd.", "III/b", "Penata Muda Tingkat I", "Asisten Ahli", "199001012015011901");

      // --- Oktober 2026: kasus pertama
      const k1 = await buatKasus(tx, { judul: "Uji riwayat 1", pegawaiId: aId, tanggalPeristiwa: "2026-10-05", tingkatKode: "sedang" }, admin.id);
      const [tim] = await tx`insert into tim_pemeriksa (entri_id, jenis, nomor_sk, tanggal_sk) values (${k1.id}, 'um', 'UJI/TIM/1', '2026-10-10') returning id`;
      await tx`insert into anggota_tim (tim_id, pegawai_id, golongan_ruang, unsur, jabatan_dalam_tim, pernyataan_bebas_konflik, snapshot_pegawai)
        values (${tim.id}, ${anggotaId}, 'IV/C', 'atasan_langsung', 'ketua', true, ${tx.json(snapshotAnggota((await ambilPegawai(anggotaId, tx))!) as never)})`;

      // --- November 2026: naik jabatan & pangkat, nama bergelar baru, atasan berganti, anggota tim juga naik jabatan
      await tx`update pegawai set nama_lengkap_gelar = 'Dr. Budi Pegawai A, S.Pd., M.Pd.', golongan_ruang = 'III/c', pangkat = 'Penata',
          jabatan_fungsional = 'Lektor', jabatan_tambahan = 'Sekretaris Departemen', unit_kerja = 'Departemen Baru', pejabat_penilai_nip = '199001012015011902'
        where id = ${aId}`;
      await tx`update pegawai set jabatan_tambahan = 'Dekan', golongan_ruang = 'IV/d' where id = ${anggotaId}`;

      // --- Januari 2027: kasus kedua
      const k2 = await buatKasus(tx, { judul: "Uji riwayat 2", pegawaiId: aId, tanggalPeristiwa: "2027-01-12", tingkatKode: "ringan" }, admin.id);

      const v1 = await konteksDokumen(k1.id, { db: tx });
      const v2 = await konteksDokumen(k2.id, { db: tx });
      cek(v1.jabatan_terperiksa === "Asisten Ahli" && v1.golongan_terperiksa === "III/b", "Kasus Okt 2026: jabatan & golongan tetap Asisten Ahli, III/b", [v1.jabatan_terperiksa, v1.golongan_terperiksa]);
      cek(v1.nama_terperiksa === "Budi Pegawai A, S.Pd.", "Kasus Okt 2026: nama tetap tanpa gelar baru", v1.nama_terperiksa);
      cek(v1.unit_kerja_terperiksa === "Departemen Uji", "Kasus Okt 2026: unit kerja tetap", v1.unit_kerja_terperiksa);
      cek(v1.nama_atasan_langsung === "Dr. Atasan Lama, M.Pd.", "Kasus Okt 2026: atasan langsung tetap atasan lama", v1.nama_atasan_langsung);
      const a1 = (v1.anggota_tim as { nama: string; jabatan: string; pangkat: string }[])[0];
      cek(a1?.jabatan === "Lektor Kepala" && /IV\/c/i.test(a1?.pangkat ?? ""), "Kasus Okt 2026: anggota tim tetap Lektor Kepala, IV/c (bukan Dekan, IV/d)", a1);
      cek(v2.jabatan_terperiksa === "Sekretaris Departemen" && v2.golongan_terperiksa === "III/c", "Kasus Jan 2027: memakai jabatan & golongan baru", [v2.jabatan_terperiksa, v2.golongan_terperiksa]);
      cek(v2.nama_atasan_langsung === "Dr. Atasan Baru, M.Si.", "Kasus Jan 2027: memakai atasan baru", v2.nama_atasan_langsung);
      const r1 = await ringkasEntri(k1.id, tx);
      cek(r1?.nama_pegawai === "Budi Pegawai A, S.Pd.", "Halaman kasus Okt 2026 menampilkan nama saat itu", r1?.nama_pegawai);

      let ditolak = false;
      try { await t.savepoint((sp) => sp`update entri set snapshot_pegawai = snapshot_pegawai || '{"jabatan":"diubah"}' where id = ${k1.id}`); } catch (e) { ditolak = /SNAPSHOT_KEKAL/.test(String(e)); }
      cek(ditolak, "Basis data menolak perubahan salinan pegawai pada kasus");
      let anggotaDitolak = false;
      try { await t.savepoint((sp) => sp`update anggota_tim set snapshot_pegawai = '{}' where tim_id = ${tim.id}`); } catch (e) { anggotaDitolak = /SNAPSHOT_KEKAL/.test(String(e)); }
      cek(anggotaDitolak, "Basis data menolak perubahan salinan anggota Tim Pemeriksa");
      let koreksi = false;
      await t.savepoint(async (sp) => {
        await izinkanKoreksi(sp as unknown as Sql);
        await sp`update entri set snapshot_pegawai = snapshot_pegawai || '{"nip":"198501012010011999"}' where id = ${k1.id}`;
        koreksi = true;
      });
      cek(koreksi, "Koreksi salah ketik tetap bisa lewat izin koreksi (wajib beralasan di log audit)");
      throw new Batal();
    });
  } catch (e) {
    if (!(e instanceof Batal)) { console.error(e); gagal += 1; }
  } finally {
    await sql.end({ timeout: 5 });
  }
  console.log(gagal ? `\n✗ ${gagal} uji gagal` : "\n✓ Semua uji lulus (transaksi dibatalkan, tidak ada data tertinggal).");
  process.exitCode = gagal ? 1 : 0;
}
main();
