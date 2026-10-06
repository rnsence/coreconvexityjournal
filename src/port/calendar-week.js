/**
 * Red-folder events for the week of Oct 4–10, 2026, copied from the Forex Factory calendar (times in Eastern).
 * The live feed only publishes a week once it starts, so this covers the upcoming week until the feed rolls over;
 * whenever the feed's own week is current, the feed wins. Same shape as the feed's entries.
 */
export const BUNDLED_WEEK = [
  { title: 'BOJ Gov Ueda Speaks', country: 'JPY', date: '2026-10-06T02:35:00-04:00', impact: 'High', forecast: '', previous: '' },
  { title: 'FOMC Meeting Minutes', country: 'USD', date: '2026-10-07T14:00:00-04:00', impact: 'High', forecast: '', previous: '' },
  { title: 'Employment Change', country: 'CAD', date: '2026-10-09T08:30:00-04:00', impact: 'High', forecast: '9.0K', previous: '-41.7K' },
  { title: 'Unemployment Rate', country: 'CAD', date: '2026-10-09T08:30:00-04:00', impact: 'High', forecast: '6.5%', previous: '6.4%' },
]
// the week this list covers (Sunday to Saturday, Eastern), so a week with no red folders still has its days
export const BUNDLED_RANGE = { from: '2026-10-04', to: '2026-10-10' }
