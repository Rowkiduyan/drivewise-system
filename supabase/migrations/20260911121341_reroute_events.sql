-- Reroute-aware route deviation verdict (11_ROUTE_COMPARISON.md follow-up).
-- LiveNavigationMap (DriverDeliveries.jsx) already auto-recomputes a route
-- the moment the driver's GPS reads >100m off the planned suggested_route
-- polyline -- that behavior itself is unchanged (the driver decides nothing
-- mid-drive, per explicit user request: no button, no distraction while
-- driving). This table only persists what the app already decided, so
-- classifyRouteDeviation (lib/suggestedRoute.js) can tell "the app itself
-- gave the driver this new path" apart from unexplained deviation, instead
-- of unfairly flagging a driver who followed every instruction the app gave
-- them. `reason` is optional and set later, if at all -- the driver can
-- tag it while reviewing their own completed trip's report (never a live-
-- driving prompt), via driver-trip's tag-reroute-reason action.
create table if not exists public.reroute_events (
  id bigint generated always as identity primary key,
  delivery_request_id text not null references public.delivery_requests(id),
  session_id text references public.sessions(session_id),
  occurred_at timestamptz not null default now(),
  reason text,
  new_path jsonb not null,
  created_at timestamptz not null default now()
);

grant select, insert, update on public.reroute_events to service_role;
grant select on public.reroute_events to authenticated;

alter table public.reroute_events enable row level security;

create policy "authenticated select reroute_events"
  on public.reroute_events for select to authenticated using (true);
