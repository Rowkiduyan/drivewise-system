// Shared delivery-request constants and pure helpers used by both the
// deliveries list (for display) and the request delivery form (for input options).
import { manilaTodayISO } from "./manilaTime.js";

// Philippine truck models — payloadKg is a placeholder spec for frontend mock purposes only
export const truckTypes = [
  {
    value: "AUV",
    label: "AUV",
    description:
      "Utility vehicle for light cargo, suitable for small loads and flexible operations",
    payloadKg: 500,
    category: "dry",
  },
  {
    value: "LUV",
    label: "LUV",
    description:
      "Light commercial vehicle for small cargo, ideal for urban deliveries",
    payloadKg: 1000,
    category: "dry",
  },
  {
    value: "1T_DRY",
    label: "1T Dry Van",
    description: "One-ton dry van for transporting general cargo securely",
    payloadKg: 1000,
    category: "dry",
  },
  {
    value: "1T_REF",
    label: "1T Reefer",
    description:
      "One-ton reefer truck for perishable cargo with temperature control",
    payloadKg: 1000,
    category: "reefer",
  },
  {
    value: "2T_DRY",
    label: "2T Dry Van",
    description: "Two-ton dry van for transporting bulk cargo",
    payloadKg: 2000,
    category: "dry",
  },
  {
    value: "2T_REF",
    label: "2T Reefer",
    description: "Two-ton reefer for temperature-sensitive cargo",
    payloadKg: 2000,
    category: "reefer",
  },
  {
    value: "4T_DRY",
    label: "4T Dry Van",
    description: "Four-ton dry van for large cargo transport",
    payloadKg: 4000,
    category: "dry",
  },
  {
    value: "4T_REF",
    label: "4T Reefer",
    description: "Four-ton reefer for large volume cold-chain operations",
    payloadKg: 4000,
    category: "reefer",
  },
];

// Item categories (dry or refrigerated only)
export const itemTypes = [
  { value: "fresh_produce", label: "Fresh Produce (Fruits & Vegetables)" },
  { value: "meat_seafood", label: "Meat, Poultry & Seafood" },
  {
    value: "pantry_staples",
    label: "Pantry Staples (Rice, Noodles, Canned, and other Dry Goods)",
  },
  { value: "beverages_snacks", label: "Beverages & Snacks" },
  { value: "frozen_dairy", label: "Frozen Food & Dairy" },
  { value: "appliances", label: "Appliances & Electronics" },
  { value: "furniture", label: "Furniture" },
  { value: "clothing", label: "Clothing & Textiles" },
];

// Labels for categories that existed before the list was trimmed down --
// older delivery_requests rows still store these codes and must render
// readably instead of showing the raw DB value.
const LEGACY_ITEM_TYPE_LABELS = {
  dry_food: "Dry Food (Canned, Packaged, etc.)",
  fresh_food: "Fresh Food (Fruits, Vegetables)",
  frozen: "Frozen Goods",
  dairy: "Dairy Products",
  beverages: "Beverages",
  pharmaceuticals: "Pharmaceuticals",
  construction: "Construction Materials",
};

export function getItemTypeLabel(value) {
  return (
    itemTypes.find((item) => item.value === value)?.label ||
    LEGACY_ITEM_TYPE_LABELS[value] ||
    value
  );
}

// Which trucks can carry each item type, regardless of weight
export const ITEM_TRUCK_COMPATIBILITY = {
  fresh_produce: ["1T_REF", "2T_REF", "4T_REF"],
  meat_seafood: ["1T_REF", "2T_REF", "4T_REF"],
  pantry_staples: ["AUV", "LUV", "1T_DRY", "2T_DRY", "4T_DRY"],
  beverages_snacks: ["LUV", "1T_DRY", "2T_DRY", "4T_DRY"],
  frozen_dairy: ["1T_REF", "2T_REF", "4T_REF"],
  appliances: ["LUV", "1T_DRY", "2T_DRY", "4T_DRY"],
  furniture: ["2T_DRY", "4T_DRY"],
  clothing: ["AUV", "LUV", "1T_DRY", "2T_DRY", "4T_DRY"],
};

// A truck is available only if it fits both the item type's compatibility list and the entered weight
export function getTruckAvailability(truck, itemType, cargoWeight) {
  if (!itemType)
    return { available: false, reason: "Select an item type first" };

  const compatibleValues = ITEM_TRUCK_COMPATIBILITY[itemType] || [];
  if (!compatibleValues.includes(truck.value)) {
    return { available: false, reason: "Not suitable for this item type" };
  }

  const weight = Number(cargoWeight);
  if (
    cargoWeight &&
    !Number.isNaN(weight) &&
    weight > 0 &&
    weight > truck.payloadKg
  ) {
    return {
      available: false,
      reason: "Exceeds this truck's payload capacity",
    };
  }

  return { available: true, reason: "" };
}

// Smallest compatible truck that can carry the entered weight
export function getRecommendedTruckValue(itemType, cargoWeight) {
  const weight = Number(cargoWeight);
  if (!itemType || !cargoWeight || Number.isNaN(weight) || weight <= 0)
    return "";

  const compatibleValues = ITEM_TRUCK_COMPATIBILITY[itemType] || [];
  const candidates = truckTypes
    .filter(
      (truck) =>
        compatibleValues.includes(truck.value) && truck.payloadKg >= weight,
    )
    .sort((a, b) => a.payloadKg - b.payloadKg);

  return candidates[0]?.value || "";
}

// Minimum number of days customers must schedule a delivery in advance
// TEMPORARY: set to 0 to allow same-day scheduling for testing Start Trip end-to-end. Revert to 3 before production.
export const MIN_SCHEDULING_DAYS = 0;

// Returns the earliest selectable delivery date (today + MIN_SCHEDULING_DAYS) as YYYY-MM-DD
// Manila time. The old implementation used `new Date().toISOString()`, which is
// the *UTC* date -- before 8:00 AM PHT that is still yesterday (e.g. 4:11 AM
// Sep 26 → min "2026-09-25"), so the form happily offered an already-past day.
// manilaTodayISO() is the repo's canonical "today" for calendar-date columns.
export function getMinDeliveryDate() {
  const [year, month, day] = manilaTodayISO().split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + MIN_SCHEDULING_DAYS));
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${mm}-${dd}`;
}

// Pickup/dropoff windows (and each stop's own window) are informational
// only -- "Open from -- to --" labels describing when someone will be there,
// not a scheduling constraint this form enforces (explicit user decision,
// 2026-09-15: a customer can enter any times/order here; the window never
// blocks submission). Two exceptions, both checked below rather than here:
// the drop-off DATE can't be before the pick-up date, and on a same-day
// delivery the drop-off window can't start before the pick-up window ends
// (getDropoffTimeError) -- delivering before the goods are collected isn't
// just an unusual window, it's physically impossible.
//
// deliveryMode is no longer a param here (2026-08-30 follow-up) -- it used
// to be an explicit customer toggle needing its own date-relationship
// checks, but is now derived automatically from pickupDate/dropoffDate
// (CustomerRequestDelivery.jsx), so it can never disagree with them by
// construction; a separate mode/date validation would be dead code.
export function getDropoffDateError({ pickupDate, dropoffDate }) {
  if (pickupDate && dropoffDate && dropoffDate < pickupDate) {
    return "Drop-off date cannot be before the pick up date.";
  }
  return "";
}

// "16:30" -> "4:30 PM" -- only used to put a human-readable clock time in an
// error message (the pickers themselves store 24-hour "HH:MM").
function formatClockLabel(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

// A delivery can't drop the goods off before it picked them up. On a
// two-day delivery (dropoff date after pickup date) the clock times say
// nothing about each other, so this only applies when both dates are the
// same (the SAME_DAY mode). The drop-off window must start at or after the
// pick-up window ENDS -- i.e. the crew has finished collecting the goods.
//
// Deliberately narrower than the check this replaces: window ORDER inside
// each window (end before start) is still not enforced anywhere (explicit
// user decision 2026-09-15 -- the windows are informational), only this
// cross-window "drop-off before pick-up" ordering, which is physically
// impossible rather than merely unusual.
export function getDropoffTimeError({
  pickupDate,
  dropoffDate,
  pickupTime,
  pickupTimeEnd,
  dropoffTime,
}) {
  if (!pickupDate || !dropoffDate || pickupDate !== dropoffDate) return "";
  if (!pickupTime || !dropoffTime) return "";
  // Pick-up isn't finished until the later of its two window ends, so a
  // mis-ordered window (end before start -- allowed elsewhere) can't let an
  // obviously-too-early drop-off slip through.
  const pickupDone =
    pickupTimeEnd && pickupTimeEnd > pickupTime ? pickupTimeEnd : pickupTime;
  if (dropoffTime >= pickupDone) return "";
  return `Drop-off cannot start before pick up finishes — pick up ends at ${formatClockLabel(pickupDone)}.`;
}

// A budget range only makes sense as a floor-to-ceiling span the supervisor can negotiate within.
// Flat sanity floor (2026-09-17, customer reported entering as little as
// ₱20) -- this is deliberately NOT derived from the Supervisor's quotation
// cost formula (buildQuotationDefaults in SupDeliveries.jsx): that formula is
// an editable internal cost breakdown (diesel rate, tolls, wages, admin fee%,
// etc.), not a public quote, and coupling customer-side validation to it
// would leak Marvel's cost structure and shift under a Supervisor's own
// pricing-rule tweaks. This is only a low bar to catch obviously-fake/typo
// amounts, not an estimate of any real trip's cost.
export const MIN_BUDGET_AMOUNT = 500;

export function getBudgetError({ budgetMin, budgetMax }) {
  if (budgetMin !== "" && Number(budgetMin) < MIN_BUDGET_AMOUNT) {
    return `Minimum budget must be at least ₱${MIN_BUDGET_AMOUNT.toLocaleString()}.`;
  }
  if (budgetMax !== "" && Number(budgetMax) < MIN_BUDGET_AMOUNT) {
    return `Maximum budget must be at least ₱${MIN_BUDGET_AMOUNT.toLocaleString()}.`;
  }
  if (budgetMin === "" || budgetMax === "") return "";
  return Number(budgetMax) < Number(budgetMin)
    ? "Maximum budget must be greater than or equal to the minimum budget."
    : "";
}
