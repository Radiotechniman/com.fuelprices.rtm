'use strict';

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// true/false, or null when the station publishes no opening hours.
function isOpenNow(openingHours, timeZone, now = new Date()) {
  if (!openingHours || openingHours.length === 0) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  const day = get('weekday').toUpperCase();
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  if (!DAYS.includes(day)) return null;
  return openingHours.some(slot => slot.dayOfWeek.includes(day)
    && minutes >= toMinutes(slot.opens) && minutes < toMinutes(slot.closes));
}

module.exports = { isOpenNow };
