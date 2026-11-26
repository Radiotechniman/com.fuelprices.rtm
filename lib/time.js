'use strict';

// "16-11 14:32" in the Homey timezone; shown on the device so a successful refresh is visible even when no price changed.
function formatStamp(date, timeZone) {
  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone,
  }).format(date).replace(',', '');
}

module.exports = { formatStamp };
