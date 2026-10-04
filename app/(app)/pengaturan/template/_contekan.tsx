// Contekan sintaks docxtemplater untuk admin (PRD §7.1). Komponen statis.

function Kode({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[13px] text-secondary-foreground">{children}</code>;
}

export function ContekanSintaks() {
  return (
    <details className="group rounded-xl border bg-card p-4 text-sm shadow-sm sm:p-5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold">
        Contekan: cara menulis penanda di berkas Word
        <span className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="mt-3 space-y-4 leading-relaxed">
        <div>
          <p className="font-medium">1. Isian biasa</p>
          <p>Ketik kode placeholder di antara kurung kurawal, misalnya <Kode>{"{nama_terperiksa}"}</Kode> atau <Kode>{"{nip_terperiksa}"}</Kode>. Format huruf (tebal, ukuran, jenis huruf) mengikuti format penanda di Word.</p>
        </div>
        <div>
          <p className="font-medium">2. Perulangan (tabel)</p>
          <p>
            Untuk daftar seperti anggota tim, letakkan <Kode>{"{#anggota_tim}"}</Kode> di sel pertama dan <Kode>{"{/anggota_tim}"}</Kode> di sel terakhir dari
            <strong> satu baris tabel</strong>. Di antaranya tulis kolomnya: <Kode>{"{nomor}"}</Kode> <Kode>{"{nama}"}</Kode> <Kode>{"{nip}"}</Kode> <Kode>{"{jabatan_dalam_tim}"}</Kode>.
            Baris itu akan diulang untuk setiap anggota. Hal yang sama untuk <Kode>{"{#qa}"}</Kode>…<Kode>{"{/qa}"}</Kode>, <Kode>{"{#pelanggaran}"}</Kode>, <Kode>{"{#mengingat}"}</Kode>, <Kode>{"{#rekap_tmk}"}</Kode>.
          </p>
          <p className="mt-1">Perulangan juga bisa berupa paragraf: tulis <Kode>{"{#mengingat}"}</Kode><Kode>{"{nomor}"}</Kode>. <Kode>{"{teks}"}</Kode><Kode>{"{/mengingat}"}</Kode> dalam satu paragraf.</p>
        </div>
        <div>
          <p className="font-medium">3. Bagian bersyarat</p>
          <p>
            <Kode>{"{#nomor_panggilan_2}"}</Kode> … <Kode>{"{/nomor_panggilan_2}"}</Kode> — teks di antaranya hanya tampil bila isian tersebut tidak kosong.
            Kebalikannya: <Kode>{"{^nomor_panggilan_2}"}</Kode> … <Kode>{"{/nomor_panggilan_2}"}</Kode> tampil bila isian kosong.
          </p>
        </div>
        <div>
          <p className="font-medium">4. Tips agar tidak gagal</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Ketik penanda sekaligus tanpa berhenti; jangan mewarnai sebagian huruf di dalam penanda (Word bisa memecahnya).</li>
            <li>Kode tidak memakai spasi atau huruf kapital. Salah ketik akan ditandai kuning beserta saran &quot;mungkin maksud Anda …&quot;.</li>
            <li>Penanda yang tidak ada di katalog boleh dijadikan <strong>isian manual</strong>: pengguna akan ditanya saat membuat dokumen.</li>
            <li>Setelah diunggah, tekan <strong>Uji</strong> untuk mengunduh contoh berisi data dummy sebelum menjadikan versi itu aktif.</li>
          </ul>
        </div>
      </div>
    </details>
  );
}
