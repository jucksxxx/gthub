export const VENUE_TZ = 'Asia/Manila';
const OFFSET = '+08:00'; // Manila has no DST

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: VENUE_TZ });
export const todayInVenue = () => ymd.format(new Date());
export const toIso = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00:00${OFFSET}`;
export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00${OFFSET}`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd.format(d);
};
export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: VENUE_TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const fmtHour = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
export const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric' }) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: VENUE_TZ, ...opts }).format(new Date(iso));
export const peso = (cents: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(cents / 100);
