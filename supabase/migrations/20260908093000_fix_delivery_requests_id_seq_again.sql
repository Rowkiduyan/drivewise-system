-- Same drift as 20260815000000_fix_delivery_requests_id_seq.sql, same root
-- cause: test fixtures (DR-0058..DR-0061, seeded directly via service_role
-- with explicit ids while verifying the 2026-09-08 Driver Today/Upcoming/
-- History tabs restructure) bypassed delivery_requests_id_seq, which fell
-- behind the actual max id in the table. nextval() then produced an id that
-- already existed -- hit live 2026-09-08 when testing whether a freshly
-- submitted Customer request's route reaches the Driver before Start Trip.
-- Fast-forward the sequence past the current max id so it never repeats one.
select setval(
  'public.delivery_requests_id_seq',
  greatest(
    (select coalesce(max(substring(id from 4)::int), 0) from public.delivery_requests),
    1
  ),
  true
);
