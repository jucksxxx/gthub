'use server';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getAdminClient } from '@/lib/supabase/admin';
import type { ActionResult, Booking, BookingType } from '@/lib/types';

export interface CheckInResult {
  code: string; guestName: string; kind: BookingType; courtName: string;
  startsAt: string; endsAt: string; players: number; totalCents: number;
}

const schema = z.object({ passcode: z.string().min(1).max(100), input: z.string().trim().min(4).max(100) });
const sha = (s: string) => createHash('sha256').update(s).digest();
const safeEq = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));
const fail = (message: string): ActionResult<never> => ({ ok: false, code: 'VALIDATION', message });

/** Accepts a scanned QR payload ("opc1:CODE:SIG") or a typed code ("OPC-XXXXXXXX"). */
export async function checkInPass(raw: { passcode: string; input: string }): Promise<ActionResult<CheckInResult>> {
  const parsed = schema.safeParse(raw);
  const staff = process.env.STAFF_PASSCODE;
  const secret = process.env.PASS_SIGNING_SECRET;
  if (!staff || !secret) return { ok: false, code: 'CONFIG', message: 'Staff check-in is not configured.' };
  if (!parsed.success || !safeEq(parsed.data.passcode, staff)) return fail('Wrong staff passcode.');

  const scanned = parsed.data.input.startsWith('opc1:');
  const [, codePart, sig] = scanned ? parsed.data.input.split(':') : [null, parsed.data.input, null];
  const code = (codePart ?? '').toUpperCase();

  const db = getAdminClient();
  const { data } = await db.from('bookings').select('*').eq('confirmation_code', code).maybeSingle();
  const b = data as Booking | null;
  if (!b) return fail('No booking with that code.');

  if (scanned) { // forged or tampered QR codes fail here
    const expected = createHmac('sha256', secret).update(`${b.confirmation_code}.${b.starts_at}`).digest('hex').slice(0, 16);
    if (!sig || !safeEq(sig, expected)) return fail('This QR code is not valid.');
  }

  if (b.status === 'checked_in') return fail(`${b.guest_name} is already checked in.`);
  if (b.status !== 'confirmed') return fail(`This booking is ${b.status}.`);
  const now = Date.now();
  if (now < new Date(b.starts_at).getTime() - 30 * 60_000) return fail('Too early. Check-in opens 30 minutes before start.');
  if (now > new Date(b.ends_at).getTime()) return fail('This booking has already ended.');

  // Conditional update = atomic: two scans at once can't both succeed.
  const { data: updated } = await db.from('bookings').update({ status: 'checked_in' })
    .eq('id', b.id).eq('status', 'confirmed').select('id');
  if (!updated?.length) return fail(`${b.guest_name} is already checked in.`);

  const { data: court } = await db.from('courts').select('name').eq('id', b.court_id).single();
  return {
    ok: true,
    data: {
      code: b.confirmation_code, guestName: b.guest_name, kind: b.booking_type,
      courtName: (court as { name: string }).name, startsAt: b.starts_at, endsAt: b.ends_at,
      players: b.players, totalCents: b.total_cents,
    },
  };
}
