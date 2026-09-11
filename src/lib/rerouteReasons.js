// Fixed preset reasons for driver-trip's tag-reroute-reason -- deliberately
// no free text (nothing to type), and deliberately never asked mid-drive:
// only offered from a completed trip's own report, optional and skippable.
// Shared by DriverDeliveries.jsx (tap-to-tag) and SupDeliveries.jsx
// (read-only display) so the four value/label pairs can't drift between
// portals -- mirrors src/lib/deliveryOptions.js's own options-array +
// derived-label-lookup convention (e.g. itemTypes/getItemTypeLabel).
export const REROUTE_REASON_OPTIONS = [
  { value: "road_closed", label: "Road closed" },
  { value: "accident", label: "Accident" },
  { value: "wrong_turn", label: "Wrong turn" },
  { value: "other", label: "Other" },
];

export const REROUTE_REASON_LABELS = Object.fromEntries(
  REROUTE_REASON_OPTIONS.map((o) => [o.value, o.label]),
);
