'use strict';

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function toMinutes(hhmm) {
  if (typeof hhmm !== 'string') return NaN;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function hasDay(dayOfWeek, day) {
  if (Array.isArray(dayOfWeek)) return dayOfWeek.includes(day);
  if (typeof dayOfWeek === 'string') return dayOfWeek.includes(day);
  return false;
}

// true/false, or null when the station publishes no opening hours.
function isOpenNow(openingHours, timeZone, now = new Date()) {
  if (!Array.isArray(openingHours) || openingHours.length === 0) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  const day = get('weekday').toUpperCase();
  const dayIndex = DAYS.indexOf(day);
  if (dayIndex === -1) return null;
  const prevDay = DAYS[(dayIndex + 6) % 7];
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));

  return openingHours.some(slot => {
    const opens = toMinutes(slot.opens);
    const closes = toMinutes(slot.closes);
    if (Number.isNaN(opens) || Number.isNaN(closes)) return false;
    // 24h slot (e.g. 00:00 - 00:00)
    if (opens === closes) return hasDay(slot.dayOfWeek, day);
    // Normal same-day slot (e.g. 07:00 - 22:00 or 00:00 - 24:00)
    if (closes > opens) return hasDay(slot.dayOfWeek, day) && minutes >= opens && minutes < closes;
    // Overnight slot spanning midnight (e.g. 06:00 - 01:00)
    return (hasDay(slot.dayOfWeek, day) && minutes >= opens)
      || (hasDay(slot.dayOfWeek, prevDay) && minutes < closes);
  });
}

module.exports = { isOpenNow };
