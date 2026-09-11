// 'Today' in the pharmacy's own timezone, not the server's -- Render runs
// UTC, and day-based logic computed against UTC midnight fires at the wrong
// local moment for a Beirut patient/pharmacy. Shared by scheduledNotifier.js
// and everywhere expiration/promotion dates need a consistent "today".
function todayInBeirut() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

module.exports = { todayInBeirut };
