'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { getAvailability } from '@/app/actions/booking';
import { BookingDialog } from '@/components/booking-dialog';
import { addDays, fmtDay, fmtHour, fmtTime, peso } from '@/lib/time';
import type { AvailabilityMatrix, BookingTarget, CourtRow, Slot, Sport } from '@/lib/types';

const SPORTS: { id: Sport; label: string }[] = [
  { id: 'pickleball', label: 'Pickleball' }, { id: 'padel', label: 'Padel' }, { id: 'tennis', label: 'Tennis' },
];

export function SlotFinder({ initial }: { initial: AvailabilityMatrix }) {
  const [matrix, setMatrix] = useState(initial);
  const [date, setDate] = useState(initial.date);
  const [sport, setSport] = useState<Sport>(initial.sport);
  const [target, setTarget] = useState<BookingTarget | null>(null);
  const [pending, start] = useTransition();
  const current = useRef({ date, sport });
  current.current = { date, sport };

  const refresh = useCallback((d: string, s: Sport) => {
    start(async () => {
      const res = await getAvailability({ date: d, sport: s });
      if (res.ok && current.current.date === d && current.current.sport === s) setMatrix(res.data);
    });
  }, []);

  // Live-ish matrix: re-poll every 12s while the tab is visible, and when it regains focus.
  useEffect(() => {
    const tick = () => { if (!document.hidden) refresh(current.current.date, current.current.sport); };
    const id = setInterval(tick, 12_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);

  const choose = (d: string, s: Sport) => { setDate(d); setSport(s); refresh(d, s); };
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(initial.date, i)), [initial.date]);
  const hours = useMemo(
    () => [...new Set(matrix.courts.flatMap((r) => r.slots.map((s) => s.hour)))].sort((a, b) => a - b), [matrix]);

  const next = useMemo(() => matrix.courts
    .flatMap((r) => r.slots.filter((s) => s.status === 'open').map((slot) => ({ row: r, slot })))
    .sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt))[0], [matrix]);

  function pick(row: CourtRow, slot: Slot) {
    if (slot.status === 'open') {
      let maxHours = 0; // contiguous open hours from here, capped at 3
      for (const s of row.slots.filter((x) => x.hour >= slot.hour)) { if (s.status !== 'open' || maxHours === 3) break; maxHours++; }
      setTarget({ kind: 'full_court', court: row.court, startsAt: slot.startsAt, maxHours });
    } else if (slot.status === 'open_play' && slot.session) {
      setTarget({ kind: 'open_play', session: slot.session, courtName: row.court.name });
    }
  }

  return (
    <div className="rounded-3xl border border-line bg-turf/80 p-4 shadow-2xl shadow-black/40 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Sport" className="flex rounded-xl bg-pitch p-1">
          {SPORTS.map((s) => (
            <button key={s.id} role="tab" aria-selected={sport === s.id} onClick={() => choose(date, s.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-emerald-400 ${sport === s.id ? 'bg-emerald-500 text-pitch' : 'text-moss hover:text-chalk'}`}>
              {s.label}
            </button>
          ))}
        </div>
        {next && (
          <button onClick={() => pick(next.row, next.slot)}
            className="flex items-center gap-2 rounded-xl border border-emerald-500/50 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/10 focus-visible:outline-2 focus-visible:outline-emerald-400">
            <Zap className="size-4" />Next open: {next.row.court.name}, {fmtDay(next.slot.startsAt, { weekday: 'short' })} {fmtTime(next.slot.startsAt)}
          </button>
        )}
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Date">
        {days.map((d) => (
          <button key={d} role="tab" aria-selected={d === date} onClick={() => choose(d, sport)}
            className={`min-w-16 shrink-0 rounded-xl border px-3 py-2 text-center transition focus-visible:outline-2 focus-visible:outline-emerald-400 ${d === date ? 'border-emerald-400 bg-emerald-500/15 text-chalk' : 'border-line text-moss hover:border-moss'}`}>
            <span className="block text-xs">{fmtDay(`${d}T12:00:00+08:00`, { weekday: 'short' })}</span>
            <span className="block text-lg font-semibold tabular-nums">{fmtDay(`${d}T12:00:00+08:00`, { day: 'numeric' })}</span>
          </button>
        ))}
      </div>

      <div className="relative mt-4 overflow-x-auto rounded-2xl border border-line" aria-busy={pending}>
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <caption className="sr-only">Court availability by hour</caption>
          <thead>
            <tr className="bg-pitch/60">
              <th scope="col" className="sticky left-0 z-10 bg-pitch px-4 py-3 text-left font-medium text-moss">Court</th>
              {hours.map((h) => <th key={h} scope="col" className="px-1 py-3 font-medium tabular-nums text-moss">{fmtHour(h)}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.courts.map((row) => (
              <tr key={row.court.id} className="border-t border-line">
                <th scope="row" className="sticky left-0 z-10 bg-turf px-4 py-2 text-left font-medium">
                  {row.court.name}
                  <span className="block text-xs font-normal text-moss">{peso(row.court.hourly_rate_cents)}/hr{row.court.is_indoor ? ' · indoor' : ''}</span>
                </th>
                {hours.map((h) => {
                  const slot = row.slots.find((s) => s.hour === h);
                  return <td key={h} className="p-1">{slot && <Cell slot={slot} court={row.court.name} onPick={() => pick(row, slot)} />}</td>;
                })}
              </tr>
            ))}
            {matrix.courts.length === 0 && <tr><td className="p-8 text-center text-moss" colSpan={99}>No courts listed for this sport yet.</td></tr>}
          </tbody>
        </table>
        {pending && <Loader2 className="absolute right-3 top-3 size-4 animate-spin text-emerald-400" aria-label="Updating" />}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-moss">
        <li className="flex items-center gap-2"><span className="size-3 rounded border border-emerald-400" />Open to rent</li>
        <li className="flex items-center gap-2"><span className="size-3 rounded bg-ball" />Open play, per player</li>
        <li className="flex items-center gap-2"><span className="size-3 rounded hatch" />Booked</li>
      </ul>
      <BookingDialog target={target} onClose={() => setTarget(null)} onBooked={() => refresh(date, sport)} />
    </div>
  );
}

function Cell({ slot, court, onPick }: { slot: Slot; court: string; onPick: () => void }) {
  const time = `${court}, ${fmtTime(slot.startsAt)}`;
  const base = 'h-11 w-full rounded-md text-xs font-semibold tabular-nums transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-300';
  switch (slot.status) {
    case 'open':
      return <button onClick={onPick} aria-label={`Rent ${time}`} className={`${base} border border-emerald-500/60 text-emerald-300 hover:bg-emerald-500 hover:text-pitch`}>{peso(slot.priceCents).replace('₱', '')}</button>;
    case 'open_play': {
      const left = slot.session!.capacity - slot.session!.spotsTaken;
      return left > 0
        ? <button onClick={onPick} aria-label={`Join open play, ${left} spots left, ${time}`} className={`${base} bg-ball text-pitch hover:brightness-110`}>{left} left</button>
        : <div aria-label={`Open play full, ${time}`} className={`${base} grid place-items-center bg-ball/20 text-ball/70`}>Full</div>;
    }
    case 'booked': return <div aria-label={`Booked, ${time}`} className={`${base} hatch`} />;
    default: return <div aria-label={`Past, ${time}`} className={`${base} bg-pitch/50`} />;
  }
}
