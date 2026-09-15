// Shared delivery-request constants and pure helpers used by both the
// deliveries list (for display) and the request delivery form (for input options).

// Philippine truck models — payloadKg/dimensions are placeholder specs for frontend mock purposes only
export const truckTypes = [
  {
    value: "AUV",
    label: "AUV",
    description:
      "Utility vehicle for light cargo, suitable for small loads and flexible operations",
    payloadKg: 500,
    dimensions: "2.1m x 1.5m x 1.5m",
    category: "dry",
  },
  {
    value: "LUV",
    label: "LUV",
    description:
      "Light commercial vehicle for small cargo, ideal for urban deliveries",
    payloadKg: 1000,
    dimensions: "2.8m x 1.6m x 1.6m",
    category: "dry",
  },
  {
    value: "1T_DRY",
    label: "1T Dry Van",
    description: "One-ton dry van for transporting general cargo securely",
    payloadKg: 1000,
    dimensions: "3.0m x 1.7m x 1.7m",
    category: "dry",
  },
  {
    value: "1T_REF",
    label: "1T Reefer",
    description:
      "One-ton reefer truck for perishable cargo with temperature control",
    payloadKg: 1000,
    dimensions: "3.0m x 1.7m x 1.7m",
    category: "reefer",
  },
  {
    value: "2T_DRY",
    label: "2T Dry Van",
    description: "Two-ton dry van for transporting bulk cargo",
    payloadKg: 2000,
    dimensions: "4.3m x 1.9m x 1.9m",
    category: "dry",
  },
  {
    value: "2T_REF",
    label: "2T Reefer",
    description: "Two-ton reefer for temperature-sensitive cargo",
    payloadKg: 2000,
    dimensions: "4.3m x 1.9m x 1.9m",
    category: "reefer",
  },
  {
    value: "4T_DRY",
    label: "4T Dry Van",
    description: "Four-ton dry van for large cargo transport",
    payloadKg: 4000,
    dimensions: "5.5m x 2.1m x 2.1m",
    category: "dry",
  },
  {
    value: "4T_REF",
    label: "4T Reefer",
    description: "Four-ton reefer for large volume cold-chain operations",
    payloadKg: 4000,
    dimensions: "5.5m x 2.1m x 2.1m",
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
export function getMinDeliveryDate() {
  const date = new Date();
  date.setDate(date.getDate() + MIN_SCHEDULING_DAYS);
  return date.toISOString().split("T")[0];
}

// Pickup Time is a customer-selected window (start + end), not a single
// instant -- returns an error if the end isn't strictly after the start.
// Pickup/dropoff windows (and each stop's own window) are informational
// only -- "Open from -- to --" labels describing when someone will be there,
// not a scheduling constraint this form enforces (explicit user decision,
// 2026-09-15: a customer can enter any times/order here; the window never
// blocks submission). Drop-off date is the one exception below: delivering
// before the pickup that collects the goods isn't just an unusual window,
// it's physically impossible, so that ordering is still checked.
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

// A budget range only makes sense as a floor-to-ceiling span the supervisor can negotiate within
export function getBudgetError({ budgetMin, budgetMax }) {
  if (budgetMin === "" || budgetMax === "") return "";
  return Number(budgetMax) < Number(budgetMin)
    ? "Maximum budget must be greater than or equal to the minimum budget."
    : "";
}
