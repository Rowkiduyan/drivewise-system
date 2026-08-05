-- delivery_requests: add the customer's counter-offer (Reject & Price Range)
-- columns. Backs the customer "Reject & Price Range" quotation action and the
-- supervisor's "Customer's Counter Offer" card (the customer submits a min-max
-- price range, which the supervisor reads back).
-- No new grants/RLS needed: columns inherit the table's existing grants, and
-- the existing "Customers can update their own delivery requests" policy
-- already covers writes.
alter table public.delivery_requests
  add column customer_counter_min numeric,
  add column customer_counter_max numeric;
