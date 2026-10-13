import 'server-only';
import { getAdminClient, rows } from '@/lib/supabase/admin';
import { addDays, toIso, todayInVenue } from '@/lib/time';
import type { Court, LeaderboardEntry, OpenPlaySessionView } from '@/lib/types';

export async function getCourts(): Promise<Court[]> {
  const { data } = await getAdminClient().from('courts').select('*').eq('is_active', true).order('name');
  return rows<Court>(data);
}

export async function getUpcomingSessions(limit = 8): Promise<OpenPlaySessionView[]> {
  const { data } = await getAdminClient().from('session_availability').select('*')
    .eq('status', 'scheduled').gt('starts_at', new Date().toISOString())
    .order('starts_at').limit(limit);
  return rows<OpenPlaySessionView>(data);
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data } = await getAdminClient().from('leaderboard').select('*').order('rank').limit(30);
  return rows<LeaderboardEntry>(data);
}

export interface VenueStats { courts: number; sessionsToday: number; openSpotsToday: number; playersThisWeek: number }
export async function getVenueStats(): Promise<VenueStats> {
  const db = getAdminClient();
  const today = todayInVenue();
  const [courts, sessions, week] = await Promise.all([
    db.from('courts').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('session_availability').select('capacity, spots_taken, starts_at')
      .eq('status', 'scheduled').gte('ends_at', new Date().toISOString())
      .lt('starts_at', toIso(addDays(today, 1), 0)),
    db.from('bookings').select('players').in('status', ['confirmed', 'checked_in'])
      .gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()),
  ]);
  const s = rows<{ capacity: number; spots_taken: number }>(sessions.data);
  return {
    courts: courts.count ?? 0,
    sessionsToday: s.length,
    openSpotsToday: s.reduce((n, x) => n + Math.max(0, x.capacity - x.spots_taken), 0),
    playersThisWeek: rows<{ players: number }>(week.data).reduce((n, b) => n + b.players, 0),
  };
}
