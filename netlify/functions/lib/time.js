// Return the UTC Date corresponding to a wall-clock instant (YYYY-MM-DD, hour 0-23)
// in the given IANA timezone. Handles DST transitions correctly.
function wallClockToUtc(dateKey, hour, minute = 0, timeZone = 'America/New_York') {
  const [y, m, d] = dateKey.split('-').map(Number);
  // Start from the naive UTC guess, then compute the offset the target zone would
  // have at that instant and correct. Two passes are enough for non-ambiguous times.
  let ts = Date.UTC(y, m - 1, d, hour, minute, 0);
  for (let i = 0; i < 2; i++) {
    const offsetMin = getTimeZoneOffsetMinutes(new Date(ts), timeZone);
    const corrected = Date.UTC(y, m - 1, d, hour, minute, 0) - offsetMin * 60_000;
    if (corrected === ts) break;
    ts = corrected;
  }
  return new Date(ts);
}

// Minutes east of UTC for a given instant in the given IANA timezone.
function getTimeZoneOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

module.exports = { wallClockToUtc, getTimeZoneOffsetMinutes };
