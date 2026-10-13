'use client';

import { useMemo, useState } from 'react';
import { Flame, Trophy, Users } from 'lucide-react';
import { BookingDialog } from '@/components/booking-dialog';
import { fmtDay, fmtTime, peso } from '@/lib/time';
import type { BookingTarget, LeaderboardEntry, OpenPlaySessionView, Sport } from '@/lib/types';

const toTarget = (s: OpenPlaySessionView): BookingTarget => ({
  kind: 'open_play', courtName: s.court_name,
  session: { id: s.id, title: s.title, skillLevel: s.skill_level, capacity: s.capacity, spotsTaken: s.spots_taken,
    pricePerPlayerCents: s.price_per_player_cents, startsAt: s.starts_at, endsAt: s.ends_at },
});

const FILTERS: (Sport | 'all')[] = ['all', 'pickleball', 'padel', 'tennis'];

export function OpenPlayBoard({ sessions, leaders }: { sessions: OpenPlaySessionView[]; leaders: LeaderboardEntry[] }) {
  const [sport, setSport] = useState<Sport | 'all'>('all');
  const [target, setTarget] = useState<BookingTarget | null>(null);
  const [boardSport, setBoardSport] = useState<Sport>('pickleball');

  const queue = useMemo(() => sessions.filter((s) => sport === 'all' || s.sport === sport), [sessions, sport]);
  const board = useMemo(() => leaders.filter((l) => l.sport === (sport === 'all' ? boardSport : sport)), [leaders, sport, boardSport]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      <div className="lg:col-span-2 flex gap-2" role="group" aria-label="Filter by sport">
        {FILTERS.map((f) => (
          <button key={f} aria-pressed={sport === f} onClick={() => setSport(f)}
            className={`rounded-full border px-4 py-1.5 text-sm capitalize transition focus-visible:outline-2 focus-visible:outline-emerald-400 ${sport === f ? 'border-ball bg-ball text-pitch' : 'border-line text-moss hover:border-moss'}`}>
            {f === 'all' ? 'All sports' : f}
          </button>
        ))}
      </div>

      <section aria-labelledby="queue-h">
        <h3 id="queue-h" className="mb-3 flex items-center gap-2 font-display text-xl font-semibold"><Users className="size-5 text-emerald-400" />Tonight and this week</h3>
        <ul className="flex flex-col gap-3">
          {queue.map((s) => {
            const left = s.capacity - s.spots_taken;
            return (
              <li key={s.id} className="rounded-2xl border border-line bg-turf p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{s.title}</p>
                    <p className="text-sm text-moss">{fmtDay(s.starts_at, { weekday: 'short', month: 'short', day: 'numeric' })}, {fmtTime(s.starts_at)} to {fmtTime(s.ends_at)} · {s.court_name}</p>
                    <p className="mt-0.5 text-xs capitalize text-moss">{s.skill_level === 'all' ? 'All levels' : s.skill_level} · {peso(s.price_per_player_cents)} per player</p>
                  </div>
                  <button disabled={left < 1} onClick={() => setTarget(toTarget(s))}
                    className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-pitch hover:bg-emerald-400 disabled:bg-line disabled:text-moss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
                    {left < 1 ? 'Full' : 'Join'}
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-1.5" role="img" aria-label={`${s.spots_taken} of ${s.capacity} spots taken`}>
                  {Array.from({ length: s.capacity }, (_, i) => (
                    <span key={i} className={`size-3.5 rounded-full ${i < s.spots_taken ? 'bg-ball' : 'border border-moss/50'}`} />
                  ))}
                  <span className="ml-2 text-xs text-moss">{left > 0 ? `${left} spot${left > 1 ? 's' : ''} open` : 'Waitlist at the desk'}</span>
                </div>
              </li>
            );
          })}
          {queue.length === 0 && <li className="rounded-2xl border border-dashed border-line p-8 text-center text-moss">No open play scheduled for this sport yet. Rent a court and bring your group.</li>}
        </ul>
      </section>

      <section aria-labelledby="lb-h">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 id="lb-h" className="flex items-center gap-2 font-display text-xl font-semibold"><Trophy className="size-5 text-ball" />Ladder</h3>
          {sport === 'all' && (
            <select aria-label="Ladder sport" value={boardSport} onChange={(e) => setBoardSport(e.target.value as Sport)} className="rounded-lg border border-line bg-pitch px-2 py-1 text-sm capitalize">
              {FILTERS.filter((f): f is Sport => f !== 'all').map((f) => <option key={f}>{f}</option>)}
            </select>
          )}
        </div>
        <ol className="overflow-hidden rounded-2xl border border-line bg-turf">
          {board.slice(0, 8).map((p) => (
            <li key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <span className={`w-6 text-center font-display text-lg font-bold tabular-nums ${p.rank === 1 ? 'text-ball' : 'text-moss'}`}>{p.rank}</span>
              <span className="flex-1 font-medium">{p.display_name}</span>
              {p.streak >= 3 && <span className="flex items-center gap-1 text-xs text-ball"><Flame className="size-3.5" />{p.streak}</span>}
              <span className="text-xs tabular-nums text-moss">{p.wins}W {p.losses}L</span>
              <span className="w-10 text-right font-semibold tabular-nums">{Number(p.rating).toFixed(2)}</span>
            </li>
          ))}
          {board.length === 0 && <li className="p-6 text-center text-moss">Ladder opens after the first rated games.</li>}
        </ol>
      </section>
      <BookingDialog target={target} onClose={() => setTarget(null)} onBooked={() => {}} />
    </div>
  );
}
