-- Pertanyaan baku BAP juga memiliki blok substansi umum (PRD §9).
alter table pertanyaan_baku drop constraint if exists pertanyaan_baku_bagian_check;
alter table pertanyaan_baku add constraint pertanyaan_baku_bagian_check
  check (bagian in ('pembuka','substansi','penutup'));
