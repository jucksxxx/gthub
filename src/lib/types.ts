export type Sport = 'pickleball' | 'tennis' | 'padel';
export type BookingType = 'full_court' | 'open_play';
export type BookingStatus = 'held' | 'confirmed' | 'checked_in' | 'cancelled' | 'expired';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'all';

/* ── Database rows (mirror supabase/migrations; swap for `supabase gen types` output if preferred) ── */
export interface Court {
  id: string; name: string; slug: string; sport: Sport; surface: string | null;
  is_indoor: boolean; hourly_rate_cents: number;
  opens_at: string; closes_at: string; // "HH:MM:SS"
  is_active: boolean; created_at: string;
}
export interface OpenPlaySession {
  id: string; court_id: string; sport: Sport; title: string; skill_level: SkillLevel;
  starts_at: string; ends_at: string; capacity: number; price_per_player_cents: number;
  status: 'scheduled' | 'cancelled'; created_at: string;
}
export interface OpenPlaySessionView extends OpenPlaySession { court_name: string; spots_taken: number }
export interface Booking {
  id: string; confirmation_code: string; booking_type: BookingType; status: BookingStatus;
  court_id: string; session_id: string | null; starts_at: string; ends_at: string; players: number;
  guest_name: string; guest_email: string; guest_phone: string | null; total_cents: number;
  hold_expires_at: string | null; user_id: string | null; created_at: string; updated_at: string;
}
export interface LeaderboardEntry {
  id: string; display_name: string; sport: Sport; rating: number;
  wins: number; losses: number; streak: number; rank: number;
}

/* ── Availability matrix ── */
export type SlotStatus = 'open' | 'booked' | 'open_play' | 'past';
export interface SlotSession {
  id: string; title: string; skillLevel: SkillLevel; capacity: number;
  spotsTaken: number; pricePerPlayerCents: number; startsAt: string; endsAt: string;
}
export interface Slot {
  hour: number; startsAt: string; endsAt: string; status: SlotStatus;
  priceCents: number; session?: SlotSession;
}
export interface CourtRow { court: Court; slots: Slot[] }
export interface AvailabilityMatrix { date: string; sport: Sport; generatedAt: string; courts: CourtRow[] }

/* ── Booking requests / results ── */
export interface GuestDetails { name: string; email: string; phone?: string }
export type BookingRequest =
  | { kind: 'full_court'; courtId: string; startsAt: string; hours: number; guest: GuestDetails }
  | { kind: 'open_play'; sessionId: string; players: number; guest: GuestDetails };

export type BookingTarget =
  | { kind: 'full_court'; court: Court; startsAt: string; maxHours: number }
  | { kind: 'open_play'; session: SlotSession; courtName: string };

export interface BookingPass {
  code: string; kind: BookingType; status: BookingStatus;
  courtName: string; sport: Sport; title: string;
  startsAt: string; endsAt: string; players: number; totalCents: number;
  guestName: string; qrPayload: string; issuedAt: string;
}

export type BookingErrorCode =
  | 'VALIDATION' | 'SLOT_TAKEN' | 'SESSION_FULL' | 'ALREADY_JOINED' | 'SESSION_NOT_FOUND'
  | 'COURT_NOT_FOUND' | 'IN_THE_PAST' | 'OUTSIDE_HOURS' | 'CONFIG' | 'UNKNOWN';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: BookingErrorCode; message: string; fieldErrors?: Record<string, string> };
