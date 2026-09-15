import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";
import {
  getPmsStatus,
  addMaintenanceBaselines,
} from "../components/trucks/utils/pms.js";

const PENDING_DELIVERY_STATUSES = [
  "PENDING_REQUEST",
  "QUOTATION_SUBMITTED",
  "COUNTER_OFFER_SUBMITTED",
  "FINAL_QUOTATION_SUBMITTED",
];

const ASSIGNABLE_DELIVERY_STATUSES = ["APPROVED", "ASSIGNED"];

const POLL_MS = 60_000;

// Module-level cache shared across all hook instances.  Initialized to null
// so the very first render still starts at zero, but every subsequent mount
// (including sidebar re-renders triggered by navigation) immediately reads
// the last-known values — no flash.
const cache = {
  pendingDeliveries: 0,
  assignableDeliveries: 0,
  overdueTrucks: 0,
  scheduledTrucks: 0,
  lastFetch: 0,
};

async function fetchAndStore(includeDeliveries) {
  const promises = [];

  if (includeDeliveries) {
    promises.push(
      supabase
        .from("delivery_requests")
        .select("id", { count: "exact", head: true })
        .in("status", PENDING_DELIVERY_STATUSES),
      supabase
        .from("delivery_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ASSIGNABLE_DELIVERY_STATUSES),
    );
  } else {
    promises.push(
      Promise.resolve({ count: 0, error: null }),
      Promise.resolve({ count: 0, error: null }),
    );
  }

  promises.push(
    supabase.from("trucks").select("*"),
    supabase
      .from("maintenance_records")
      .select("truck_id, status, mileage_at_service, start_date, end_date"),
  );

  const [pendingResult, assignableResult, trucksResult, maintenanceResult] =
    await Promise.all(promises);

  const trucks = trucksResult.data || [];
  const records = maintenanceResult.data || [];
  const baselined = addMaintenanceBaselines(trucks, records);

  let overdue = 0;
  let scheduled = 0;
  for (const t of baselined) {
    const s = getPmsStatus(t);
    if (s === "overdue") overdue++;
    else if (s === "scheduled") scheduled++;
  }

  cache.pendingDeliveries = includeDeliveries
    ? (pendingResult.count ?? 0)
    : cache.pendingDeliveries;
  cache.assignableDeliveries = includeDeliveries
    ? (assignableResult.count ?? 0)
    : cache.assignableDeliveries;
  cache.overdueTrucks = overdue;
  cache.scheduledTrucks = scheduled;
  cache.lastFetch = Date.now();
}

/**
 * Fetch sidebar badge counts:
 *  - pendingDeliveries: count of deliveries awaiting supervisor action
 *  - overdueTrucks / scheduledTrucks: PMS counts for fleet
 *
 * Uses a module-level cache so sidebar navigation never causes a flash.
 * Polls every 60 s in the background.
 *
 * Pass `options.includeDeliveries = false` to skip the delivery query
 * (e.g. for the Admin sidebar which has no deliveries link).
 */
export function useSidebarBadges({ includeDeliveries = true } = {}) {
  const [pendingDeliveries, setPendingDeliveries] = useState(
    cache.pendingDeliveries,
  );
  const [assignableDeliveries, setAssignableDeliveries] = useState(
    cache.assignableDeliveries,
  );
  const [overdueTrucks, setOverdueTrucks] = useState(cache.overdueTrucks);
  const [scheduledTrucks, setScheduledTrucks] = useState(
    cache.scheduledTrucks,
  );

  useEffect(() => {
    let isMounted = true;

    async function run() {
      if (Date.now() - cache.lastFetch < POLL_MS / 2) {
        if (isMounted) {
          setPendingDeliveries(cache.pendingDeliveries);
          setAssignableDeliveries(cache.assignableDeliveries);
          setOverdueTrucks(cache.overdueTrucks);
          setScheduledTrucks(cache.scheduledTrucks);
        }
        return;
      }

      await fetchAndStore(includeDeliveries);
      if (!isMounted) return;

      setPendingDeliveries(cache.pendingDeliveries);
      setAssignableDeliveries(cache.assignableDeliveries);
      setOverdueTrucks(cache.overdueTrucks);
      setScheduledTrucks(cache.scheduledTrucks);
    }

    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      isMounted = false;
      clearInterval(id);
    };
  }, [includeDeliveries]);

  return { pendingDeliveries, assignableDeliveries, overdueTrucks, scheduledTrucks };
}
