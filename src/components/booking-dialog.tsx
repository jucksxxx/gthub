'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, X } from 'lucide-react';
import { createBooking } from '@/app/actions/booking';
import { fmtDay, fmtTime, peso } from '@/lib/time';
import type { BookingPass, BookingTarget } from '@/lib/types';

interface Props { target: BookingTarget | null; onClose: () => void; onBooked: () => void }

export function BookingDialog({ target, onClose, onBooked }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (target && !d.open) d.showModal();
    if (!target && d.open) d.close();
  }, [target]);

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(32rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-turf p-0 text-chalk backdrop:bg-black/70 backdrop:backdrop-blur-sm">
      {target && <Body key={target.kind === 'full_court' ? target.startsAt + target.court.id : target.session.id}
        target={target} onClose={onClose} onBooked={onBooked} />}
    </dialog>
  );
}

interface BodyProps { target: BookingTarget; onClose: () => void; onBooked: () => void }

function Body({ target, onClose, onBooked }: BodyProps) {
  const [pending, start] = useTransition();
  const [pass, setPass] = useState<BookingPass | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [hours, setHours] = useState(1);
  const [players, setPlayers] = useState(1);

  const rental = target.kind === 'full_court' ? target : null;
  const play = target.kind === 'open_play' ? target : null;
  const isRental = rental !== null;
  const spotsLeft = play ? play.session.capacity - play.session.spotsTaken : 0;
  const total = rental ? rental.court.hourly_rate_cents * hours : (play?.session.pricePerPlayerCents ?? 0) * players;
  const startsAt = rental ? rental.startsAt : play!.session.startsAt;
  const endsAt = rental ? new Date(new Date(startsAt).getTime() + hours * 3_600_000).toISOString() : play!.session.endsAt;
  const heading = rental ? rental.court.name : play!.session.title;

  if (pass) return <PassCard pass={pass} onClose={onClose} />;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const guest = { name: String(f.get('name') ?? ''), email: String(f.get('email') ?? ''), phone: String(f.get('phone') ?? '') };
    setError(null); setFields({});
    start(async () => {
      const res = await createBooking(target.kind === 'full_court'
        ? { kind: 'full_court', courtId: target.court.id, startsAt, hours, guest }
        : { kind: 'open_play', sessionId: target.session.id, players, guest });
      if (res.ok) { setPass(res.data); onBooked(); return; }
      setError(res.message); setFields(res.fieldErrors ?? {});
      if (res.code === 'SLOT_TAKEN' || res.code === 'SESSION_FULL') onBooked(); // refresh matrix behind the dialog
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 p-6" noValidate>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">{heading}</h2>
          <p className="mt-1 text-sm text-moss">
            {fmtDay(startsAt, { weekday: 'long', month: 'short', day: 'numeric' })}, {fmtTime(startsAt)} to {fmtTime(endsAt)}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-moss hover:bg-line focus-visible:outline-2 focus-visible:outline-emerald-400">
          <X className="size-5" />
        </button>
      </header>

      {rental ? (
        <Field label="Duration">
          <select value={hours} onChange={(e) => setHours(+e.target.value)} className="input">
            {Array.from({ length: rental.maxHours }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h} hour{h > 1 && 's'}</option>)}
          </select>
        </Field>
      ) : (
        <Field label={`Players (${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left)`}>
          <select value={players} onChange={(e) => setPlayers(+e.target.value)} className="input">
            {Array.from({ length: Math.min(4, spotsLeft) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
      )}

      <Field label="Full name" error={fields.name}><input name="name" autoComplete="name" required className="input" /></Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email" error={fields.email}><input name="email" type="email" autoComplete="email" required className="input" /></Field>
        <Field label="Mobile (optional)" error={fields.phone}><input name="phone" type="tel" autoComplete="tel" className="input" /></Field>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-400/40 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p>}

      <button disabled={pending || (!isRental && spotsLeft < 1)}
        className="flex items-center justify-between rounded-xl bg-emerald-500 px-5 py-3.5 font-semibold text-pitch transition hover:bg-emerald-400 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
        <span>{pending ? 'Reserving…' : isRental ? 'Reserve court' : `Join ${players > 1 ? `with ${players} players` : 'open play'}`}</span>
        <span className="tabular-nums">{peso(total)}</span>
      </button>
      <p className="text-center text-xs text-moss">Pay at the front desk. Your pass is issued instantly.</p>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}{children}
      {error && <span className="text-xs font-normal text-red-300">{error}</span>}
    </label>
  );
}

function PassCard({ pass, onClose }: { pass: BookingPass; onClose: () => void }) {
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2 text-emerald-400">
        <CheckCircle2 className="size-5" /><span className="font-semibold">You’re booked, {pass.guestName.split(' ')[0]}</span>
      </div>
      <div className="overflow-hidden rounded-2xl bg-chalk text-pitch">
        <div className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="font-display text-xl font-semibold">{pass.title}</p>
            <p className="text-sm">{pass.courtName}</p>
            <p className="mt-3 text-sm">{fmtDay(pass.startsAt, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
            <p className="text-lg font-semibold tabular-nums">{fmtTime(pass.startsAt)} to {fmtTime(pass.endsAt)}</p>
            <p className="mt-2 text-sm">{pass.players} player{pass.players > 1 && 's'} · {peso(pass.totalCents)} due at desk</p>
          </div>
          <QRCodeSVG value={pass.qrPayload} size={104} level="M" aria-label="Check-in QR code" />
        </div>
        <div className="border-t-2 border-dashed border-pitch/25 bg-emerald-100 px-5 py-3 text-center font-mono text-lg font-bold tracking-widest">{pass.code}</div>
      </div>
      <button onClick={onClose} className="mt-5 w-full rounded-xl border border-line py-3 font-medium hover:bg-line focus-visible:outline-2 focus-visible:outline-emerald-400">Done</button>
    </div>
  );
}
