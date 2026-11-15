'use strict';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const KEEP = 8 * DAY;

// Appends a sample when the price changed or the last sample is an hour old, and prunes old ones.
function record(history, now, price) {
  const last = history[history.length - 1];
  const next = !last || last.p !== price || now - last.t >= HOUR
    ? [...history, { t: now, p: price }]
    : history;
  return next.filter(e => e.t >= now - KEEP);
}

// The price that applied `ageMs` ago, or null when history does not reach back that far.
function priceAgo(history, now, ageMs) {
  const target = now - ageMs;
  let found = null;
  for (const entry of history) {
    if (entry.t > target) break;
    found = entry;
  }
  return found ? found.p : null;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

module.exports = { DAY, WEEK, record, priceAgo, round3 };
