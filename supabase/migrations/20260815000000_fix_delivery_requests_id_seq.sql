-- The delivery_requests_id_seq (added 20260803225514) fell behind the
-- actual max id in the table -- some rows (test fixtures like DR-0020/
-- DR-0021, seeded directly with an explicit id rather than via the
-- sequence-backed default) were inserted with an id higher than the
-- sequence's current value. nextval() then produced an id that already
-- existed, and the insert failed with a 409 (unique_violation) -- hit live
-- 2026-08-15 when a Customer tried to submit a new delivery request.
-- Fast-forward the sequence past the current max id so it never repeats one.
select setval(
  'public.delivery_requests_id_seq',
  greatest(
    (select coalesce(max(substring(id from 4)::int), 0) from public.delivery_requests),
    1
  ),
  true
);
