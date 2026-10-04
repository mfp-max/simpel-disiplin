-- Mode sidang (PRD §9): asal setiap butir tanya-jawab.
--   baku     = disalin dari pertanyaan_baku saat sesi pertama kali dibuka (tidak bisa disunting/dihapus)
--   tambahan = disisipkan notulis ("+ Pertanyaan substansi")
--   bank     = disisipkan dari bank_pertanyaan
-- NULL diperlakukan sebagai "baku".
alter table qa_pemeriksaan add column if not exists sumber text;
