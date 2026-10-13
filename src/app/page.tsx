import { Zap } from 'lucide-react';
import { getAvailability } from '@/app/actions/booking';
import { OpenPlayBoard } from '@/components/open-play-board';
import { SlotFinder } from '@/components/slot-finder';
import { getCourts, getLeaderboard, getUpcomingSessions, getVenueStats } from '@/lib/data';
import { fmtDay, fmtTime, peso, todayInVenue } from '@/lib/time';
import type { Sport } from '@/lib/types';

export const revalidate = 30;

const SPORT_COPY: Record<Sport, string> = {
  pickleball: 'Fast hands, short court, easy to learn. Our most social game.',
  padel: 'Glass-walled doubles with rebounds. Four players, endless rallies.',
  tennis: 'Hard and clay courts for singles drills and doubles ladders.',
};

export default async function Home() {
  const [courts, stats, sessions, leaders, initial] = await Promise.all([
    getCourts(), getVenueStats(), getUpcomingSessions(10), getLeaderboard(),
    getAvailability({ date: todayInVenue(), sport: 'pickleball' }),
  ]);
  const nextSession = sessions[0];
  const sports = (['pickleball', 'padel', 'tennis'] as Sport[]).map((s) => {
    const list = courts.filter((c) => c.sport === s);
    return { sport: s, count: list.length, from: Math.min(...list.map((c) => c.hourly_rate_cents)) };
  }).filter((s) => s.count > 0);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-pitch/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5" aria-label="Main">
          <a href="#top" className="font-display text-xl font-bold tracking-tight">Open Play Court</a>
          <ul className="flex items-center gap-1 text-sm sm:gap-2">
            <li className="hidden sm:block"><a className="rounded-lg px-3 py-2 text-moss hover:text-chalk" href="#sports">Courts</a></li>
            <li className="hidden sm:block"><a className="rounded-lg px-3 py-2 text-moss hover:text-chalk" href="#open-play">Open play</a></li>
            <li><a href="#book" className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-pitch hover:bg-emerald-400">Book a court</a></li>
          </ul>
        </nav>
      </header>

      <main id="top">
        {/* Hero: the court itself is the graphic */}
        <section className="relative overflow-hidden border-b border-line">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
            <div>
              <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
                Book the court.<br />Or just show up and play.
              </h1>
              <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-moss">
                Pickleball, padel and tennis. Reserve a full court by the hour, or pay per player and get into a rotation tonight.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#book" className="rounded-xl bg-emerald-500 px-6 py-3.5 font-semibold text-pitch hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">Find a slot</a>
                <a href="#open-play" className="rounded-xl border border-ball/60 px-6 py-3.5 font-semibold text-ball hover:bg-ball/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ball">Join open play</a>
              </div>
              {nextSession && (
                <p className="mt-8 flex items-center gap-2 text-sm text-moss">
                  <Zap className="size-4 text-ball" />
                  Next up: {nextSession.title}, {fmtDay(nextSession.starts_at, { weekday: 'short' })} {fmtTime(nextSession.starts_at)}.{' '}
                  {nextSession.capacity - nextSession.spots_taken} spots left.
                </p>
              )}
            </div>

            <svg viewBox="0 0 300 440" className="mx-auto w-full max-w-sm" role="img" aria-label="Pickleball court diagram">
              <g fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <rect className="court-line" pathLength={1} x="20" y="20" width="260" height="400" rx="4" />
                <path className="court-line" pathLength={1} d="M20 220 H280" stroke="#eaf3ee" strokeWidth="5" />
                <path className="court-line" pathLength={1} d="M20 142 H280 M20 298 H280" />
                <path className="court-line" pathLength={1} d="M150 20 V142 M150 298 V420" />
              </g>
              <circle cx="206" cy="86" r="11" fill="#d8ef4b" />
              <g fill="#07130f">{[[200, 82], [212, 82], [206, 90], [200, 90], [212, 90]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" />)}</g>
            </svg>
          </div>

          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
            {[
              [String(stats.courts), 'courts across 3 sports'],
              [String(stats.sessionsToday), 'open-play sessions left today'],
              [String(stats.openSpotsToday), 'spots open today'],
              [String(stats.playersThisWeek), 'players booked this week'],
            ].map(([n, l]) => (
              <div key={l} className="bg-pitch px-5 py-5">
                <dt className="sr-only">{l}</dt>
                <dd><span className="font-display text-3xl font-bold tabular-nums">{n}</span><span className="block text-sm text-moss">{l}</span></dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="book" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-16">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">See what’s free right now</h2>
          <p className="mb-8 mt-2 max-w-[36rem] text-moss">Pick a sport and a day. Tap an outlined hour to rent the court, or a yellow one to join open play. The grid refreshes as others book.</p>
          {initial.ok ? <SlotFinder initial={initial.data} /> : <p role="alert" className="rounded-xl border border-red-400/40 p-6 text-red-200">{initial.message}</p>}
        </section>

        <section id="open-play" className="border-y border-line bg-turf/40 py-16">
          <div className="mx-auto max-w-6xl scroll-mt-16 px-5">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">No group? Join a rotation</h2>
            <p className="mb-8 mt-2 max-w-[36rem] text-moss">Pay per player, show your pass, and rotate in with people at your level. Ratings update after every session.</p>
            <OpenPlayBoard sessions={sessions} leaders={leaders} />
          </div>
        </section>

        <section id="sports" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-16">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Three games, one venue</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {sports.map((s) => (
              <article key={s.sport} className="flex flex-col justify-between rounded-2xl border border-line bg-turf p-6">
                <div>
                  <h3 className="font-display text-2xl font-semibold capitalize">{s.sport}</h3>
                  <p className="mt-2 text-moss">{SPORT_COPY[s.sport]}</p>
                </div>
                <p className="mt-8 text-sm text-moss">{s.count} court{s.count > 1 && 's'} · from <span className="font-semibold text-chalk">{peso(s.from)}</span> per hour</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-5 py-8 text-center text-sm text-moss">
        Open Play Court · Courts open 6 AM to 10 PM daily · Pay at the front desk
      </footer>
    </>
  );
}
