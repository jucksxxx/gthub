'use server';

import { createHmac } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminClient, rows } from '@/lib/supabase/admin';
import { addDays, toIso } from '@/lib/time';
import type {
  ActionResult, AvailabilityMatrix, Booking, BookingErrorCode, BookingPass, BookingRequest,
  Court, CourtRow, OpenPlaySessionView, Slot, Sport,
} from '@/lib/types';

/* ───────────── validation ───────────── */
const guest = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(120),
  phone: z.string().trim().max(20).regex(/^[+0-9 ()-]*$/, 'Use digits only').optional().transform((v) => v || undefined),
});
const requestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('full_court'), courtId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }), hours: z.number().int().min(1).max(3), guest,
  }),
  z.object({ kind: z.literal('open_play'), sessionId: z.string().uuid(), players: z.number().int().min(1).max(4), guest }),
]);
const availabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sport: z.enum(['pickleball', 'tennis', 'padel']),
});

const MESSAGES: Record<string, { code: BookingErrorCode; message: string }> = {
  SLOT_TAKEN: { code: 'SLOT_TAKEN', message: 'Someone just booked that time. Pick another slot.' },
  SESSION_FULL: { code: 'SESSION_FULL', message: 'This session is full. Try another session or book a court.' },
  ALREADY_JOINED: { code: 'ALREADY_JOINED', message: 'That email already has a spot in this session.' },
  SESSION_NOT_FOUND: { code: 'SESSION_NOT_FOUND', message: 'That session is no longer available.' },
  COURT_NOT_FOUND: { code: 'COURT_NOT_FOUND', message: 'That court is unavailable.' },
  IN_THE_PAST: { code: 'IN_THE_PAST', message: 'That time has already started. Choose a later slot.' },
  OUTSIDE_HOURS: { code: 'OUTSIDE_HOURS', message: 'That time falls outside the court’s opening hours.' },
};
const fail = (code: BookingErrorCode, message: string, fieldErrors?: Record<string, string>): ActionResult<never> =>
  ({ ok: false, code, message, fieldErrors });

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && aE > bS;

/* ───────────── availability matrix ───────────── */
export async function getAvailability(input: { date: string; sport: Sport }): Promise<ActionResult<AvailabilityMatrix>> {
  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) return fail('VALIDATION', 'Invalid date or sport.');
  const { date, sport } = parsed.data;
  const db = getAdminClient();
  const dayStart = toIso(date, 0);
  const dayEnd = toIso(addDays(date, 1), 0);
  const now = Date.now();

  const { data: courtData, error } = await db.from('courts').select('*')
    .eq('sport', sport).eq('is_active', true).order('name');
  if (error) return fail('UNKNOWN', 'Could not load courts.');
  const courts = rows<Court>(courtData);
  const ids = courts.map((c) => c.id);

  const [bk, ss] = await Promise.all([
    db.from('bookings').select('court_id, starts_at, ends_at, status, hold_expires_at')
      .eq('booking_type', 'full_court').in('status', ['held', 'confirmed', 'checked_in'])
      .in('court_id', ids).lt('starts_at', dayEnd).gt('ends_at', dayStart),
    db.from('session_availability').select('*').eq('status', 'scheduled')
      .in('court_id', ids).lt('starts_at', dayEnd).gt('ends_at', dayStart),
  ]);
  const live = rows<{ court_id: string; starts_at: string; ends_at: string; status: string; hold_expires_at: string | null }>(bk.data)
    .filter((b) => b.status !== 'held' || (b.hold_expires_at && new Date(b.hold_expires_at).getTime() > now));
  const sessions = rows<OpenPlaySessionView>(ss.data);

  const matrix: CourtRow[] = courts.map((court) => {
    const slots: Slot[] = [];
    for (let h = parseInt(court.opens_at); h < parseInt(court.closes_at); h++) {
      const startsAt = toIso(date, h);
      const endsAt = toIso(date, h + 1);
      const [s, e] = [new Date(startsAt).getTime(), new Date(endsAt).getTime()];
      const base = { hour: h, startsAt, endsAt, priceCents: court.hourly_rate_cents };
      const session = sessions.find((x) => x.court_id === court.id &&
        overlaps(s, e, new Date(x.starts_at).getTime(), new Date(x.ends_at).getTime()));

      if (s <= now) slots.push({ ...base, status: 'past' });
      else if (live.some((b) => b.court_id === court.id &&
        overlaps(s, e, new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()))) slots.push({ ...base, status: 'booked' });
      else if (session) slots.push({
        ...base, status: 'open_play',
        session: {
          id: session.id, title: session.title, skillLevel: session.skill_level, capacity: session.capacity,
          spotsTaken: session.spots_taken, pricePerPlayerCents: session.price_per_player_cents,
          startsAt: session.starts_at, endsAt: session.ends_at,
        },
      });
      else slots.push({ ...base, status: 'open' });
    }
    return { court, slots };
  });
  return { ok: true, data: { date, sport, generatedAt: new Date().toISOString(), courts: matrix } };
}

/* ───────────── booking engine ───────────── */
function signPass(code: string, startsAt: string): string | null {
  const secret = process.env.PASS_SIGNING_SECRET;
  if (!secret) return null;
  const sig = createHmac('sha256', secret).update(`${code}.${startsAt}`).digest('hex').slice(0, 16);
  return `opc1:${code}:${sig}`;
}

export async function createBooking(input: BookingRequest): Promise<ActionResult<BookingPass>> {
  // 1. Validate. Never trust client-side checks.
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.filter((p) => p !== 'guest').join('.')] ??= i.message;
    return fail('VALIDATION', 'Check the highlighted fields.', fieldErrors);
  }
  const req = parsed.data;
  const db = getAdminClient();

  // 2. Reserve atomically. The DB (exclusion constraint / row lock) is the source of truth,
  //    so two simultaneous requests can never both win.
  let booking: Booking;
  if (req.kind === 'full_court') {
    const endsAt = new Date(new Date(req.startsAt).getTime() + req.hours * 3_600_000).toISOString();
    const { data, error } = await db.rpc('create_full_court_booking', {
      p_court_id: req.courtId, p_starts_at: req.startsAt, p_ends_at: endsAt,
      p_guest_name: req.guest.name, p_guest_email: req.guest.email, p_guest_phone: req.guest.phone ?? null,
    });
    if (error) return mapError(error.message);
    booking = data as Booking;
  } else {
    const { data, error } = await db.rpc('book_open_play', {
      p_session_id: req.sessionId, p_players: req.players,
      p_guest_name: req.guest.name, p_guest_email: req.guest.email, p_guest_phone: req.guest.phone ?? null,
    });
    if (error) return mapError(error.message);
    booking = data as Booking;
  }

  // 3. Build the confirmation pass.
  const [{ data: court }, { data: session }] = await Promise.all([
    db.from('courts').select('name, sport').eq('id', booking.court_id).single(),
    booking.session_id
      ? db.from('open_play_sessions').select('title').eq('id', booking.session_id).single()
      : Promise.resolve({ data: null }),
  ]);
  const qrPayload = signPass(booking.confirmation_code, booking.starts_at);
  if (!qrPayload) return fail('CONFIG', 'Booking saved, but pass signing is not configured. Contact the venue.');

  revalidatePath('/');
  const c = court as { name: string; sport: Sport };
  return {
    ok: true,
    data: {
      code: booking.confirmation_code, kind: booking.booking_type, status: booking.status,
      courtName: c.name, sport: c.sport,
      title: (session as { title: string } | null)?.title ?? 'Full court rental',
      startsAt: booking.starts_at, endsAt: booking.ends_at, players: booking.players,
      totalCents: booking.total_cents, guestName: booking.guest_name,
      qrPayload, issuedAt: new Date().toISOString(),
    },
  };
}

function mapError(raw: string): ActionResult<never> {
  const key = Object.keys(MESSAGES).find((k) => raw.includes(k));
  return key ? fail(MESSAGES[key].code, MESSAGES[key].message) : fail('UNKNOWN', 'Something went wrong. Please try again.');
}
