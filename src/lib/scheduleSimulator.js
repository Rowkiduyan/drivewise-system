// Delivery time-planning calculation (2026-08-30, explicit user request).
// Pure logic -- no React, no window.google -- mirrors deliveryOptions.js's
// style. Takes pre-fetched per-leg travel durations (seconds, already
// resolved via DirectionsService by the caller) and simulates the
// sequential schedule: Pickup(load) -> travel -> Dropoff(unload) -> travel
// -> each Stop(unload)..., inserting a rest every REST_INTERVAL_HOURS of
// cumulative travel and a meal break the first time the clock crosses its
// threshold. Single source of truth for the 13-hour cap, replacing
// CustomerRequestDelivery.jsx's old single-leg-only MAX_TRAVEL_HOURS.

export const PICKUP_LOADING_MINUTES = 30;
export const UNLOAD_MINUTES = 30;
export const REST_INTERVAL_HOURS = 2;
export const REST_MINUTES = 15;
// Single crossing instants, not start/end windows -- deliberately not
// inventing a specific "lunch is 12-1pm" range per explicit user
// clarification. The first time the simulated clock passes noon/6pm that
// day (and that meal hasn't already been served), the 30-min block is
// added. If a day's start time is already past a threshold, that meal is
// treated as already eaten before the day began -- never added later that
// same day. When both trigger in one day's schedule, that's 30+30 = 60
// minutes total added to the running total.
export const LUNCH_THRESHOLD_MINUTES = 12 * 60; // 12:00
export const DINNER_THRESHOLD_MINUTES = 18 * 60; // 18:00
export const MEAL_MINUTES = 30;
export const MAX_TOTAL_DELIVERY_HOURS = 13;
export const MAX_TOTAL_DELIVERY_SECONDS = MAX_TOTAL_DELIVERY_HOURS * 3600;

const REST_INTERVAL_SECONDS = REST_INTERVAL_HOURS * 3600;
const LOAD_SECONDS = PICKUP_LOADING_MINUTES * 60;
const UNLOAD_SECONDS = UNLOAD_MINUTES * 60;
const REST_SECONDS = REST_MINUTES * 60;
const MEAL_SECONDS = MEAL_MINUTES * 60;
const LUNCH_THRESHOLD_SECONDS = LUNCH_THRESHOLD_MINUTES * 60;
const DINNER_THRESHOLD_SECONDS = DINNER_THRESHOLD_MINUTES * 60;
const SECONDS_PER_DAY = 24 * 3600;

function parseTimeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Walks a single day's sequence of travel legs, inserting rest/meal breaks
// as they're reached. `includeLoad` is true for Same-Day (loading happens
// at the very start of the one and only day) and false for Two-Day's Day 2
// (loading already happened on Day 1). Returns total elapsed seconds for
// this day -- callers that need the full event trace for debugging can add
// an `events` accumulator later; the public API only needs totals per the
// "3 numbers only" scope this feature was built to.
function walkDaySchedule(startMinutes, legTravelSeconds, includeLoad) {
  let clockSeconds = startMinutes * 60;
  let totalSeconds = 0;
  let secondsSinceBreak = 0;
  const startClockOfDay = clockSeconds % SECONDS_PER_DAY;
  // A meal already behind the day's start time is "already eaten," not
  // something this simulation should retroactively charge for.
  const mealsServed = {
    lunch: startClockOfDay >= LUNCH_THRESHOLD_SECONDS,
    dinner: startClockOfDay >= DINNER_THRESHOLD_SECONDS,
  };

  const advance = (seconds) => {
    clockSeconds += seconds;
    totalSeconds += seconds;
  };

  const checkMeals = () => {
    const clockOfDay = clockSeconds % SECONDS_PER_DAY;
    if (!mealsServed.lunch && clockOfDay >= LUNCH_THRESHOLD_SECONDS) {
      mealsServed.lunch = true;
      advance(MEAL_SECONDS);
      secondsSinceBreak = 0;
    }
    if (!mealsServed.dinner && clockOfDay >= DINNER_THRESHOLD_SECONDS) {
      mealsServed.dinner = true;
      advance(MEAL_SECONDS);
      secondsSinceBreak = 0;
    }
  };

  if (includeLoad) {
    advance(LOAD_SECONDS);
    checkMeals();
  }

  const totalTravelSeconds = legTravelSeconds.reduce((a, b) => a + b, 0);
  let traveledSoFar = 0;

  for (const legSeconds of legTravelSeconds) {
    let remaining = legSeconds;
    while (remaining > 0) {
      const toNextRest = REST_INTERVAL_SECONDS - secondsSinceBreak;
      const travelLeftAfterThisChunk =
        totalTravelSeconds - traveledSoFar - toNextRest;
      if (remaining >= toNextRest && travelLeftAfterThisChunk > 0) {
        advance(toNextRest);
        traveledSoFar += toNextRest;
        remaining -= toNextRest;
        secondsSinceBreak = 0;
        checkMeals();
        advance(REST_SECONDS);
        checkMeals();
      } else {
        advance(remaining);
        traveledSoFar += remaining;
        secondsSinceBreak += remaining;
        remaining = 0;
        checkMeals();
      }
    }
    advance(UNLOAD_SECONDS);
    checkMeals();
  }

  return totalSeconds;
}

// mode: "SAME_DAY" | "TWO_DAY"
// day1StartTime / day2StartTime: "HH:MM"
// legTravelSeconds: ordered [pickup->dropoff, dropoff->stop1, stop1->stop2, ...]
export function simulateSchedule({
  mode,
  day1StartTime,
  day2StartTime,
  legTravelSeconds,
}) {
  if (mode === "TWO_DAY") {
    const day1TotalSeconds = LOAD_SECONDS;
    const day2TotalSeconds = walkDaySchedule(
      parseTimeToMinutes(day2StartTime),
      legTravelSeconds,
      false,
    );
    const totalSeconds = day1TotalSeconds + day2TotalSeconds;
    return {
      day1TotalSeconds,
      day2TotalSeconds,
      totalSeconds,
      exceedsLimit: totalSeconds > MAX_TOTAL_DELIVERY_SECONDS,
    };
  }

  const day1TotalSeconds = walkDaySchedule(
    parseTimeToMinutes(day1StartTime),
    legTravelSeconds,
    true,
  );
  return {
    day1TotalSeconds,
    day2TotalSeconds: null,
    totalSeconds: day1TotalSeconds,
    exceedsLimit: day1TotalSeconds > MAX_TOTAL_DELIVERY_SECONDS,
  };
}
