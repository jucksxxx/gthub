'use client';

import { useRef, useState, useTransition } from 'react';
import { CheckCircle2, ScanLine, XCircle } from 'lucide-react';
import { checkInPass, type CheckInResult } from '@/app/actions/checkin';
import { fmtTime, peso } from '@/lib/time';

type Outcome = { ok: true; data: CheckInResult } | { ok: false; message: string } | null;

export function CheckInForm() {
  const [pending, start] = useTransition();
  const [passcode, setPasscode] = useState('');
  const [outcome, setOutcome] = useState<Outcome>(null);
  const input = useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = input.current?.value ?? '';
    start(async () => {
      const res = await checkInPass({ passcode, input: value });
      setOutcome(res.ok ? res : { ok: false, message: res.message });
      if (input.current) { input.current.value = ''; input.current.focus(); } // ready for the next scan
    });
  }

  return (
    <div className="mx-auto max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-turf p-6">
        <label className="flex flex-col gap-1.5 text-sm font-medium">Staff passcode
          <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="off" className="input" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Scan QR or type pass code
          <input ref={input} autoFocus required placeholder="OPC-XXXXXXXX" className="input font-mono" />
        </label>
        <button disabled={pending || !passcode} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 font-semibold text-pitch hover:bg-emerald-400 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
          <ScanLine className="size-5" />{pending ? 'Checking…' : 'Check in'}
        </button>
        <p className="text-xs text-moss">A USB or phone barcode scanner that types into the field works as is. Press Enter to submit.</p>
      </form>

      <div aria-live="polite" className="mt-5">
        {outcome?.ok && (
          <div className="rounded-2xl border border-emerald-500/50 bg-emerald-500/10 p-5">
            <p className="flex items-center gap-2 font-semibold text-emerald-300"><CheckCircle2 className="size-5" />Checked in: {outcome.data.guestName}</p>
            <p className="mt-2 text-sm">{outcome.data.courtName} · {fmtTime(outcome.data.startsAt)} to {fmtTime(outcome.data.endsAt)}</p>
            <p className="text-sm text-moss">{outcome.data.players} player{outcome.data.players > 1 && 's'} · collect {peso(outcome.data.totalCents)} at the desk</p>
          </div>
        )}
        {outcome && !outcome.ok && (
          <p role="alert" className="flex items-center gap-2 rounded-2xl border border-red-400/40 bg-red-950/50 p-5 text-red-200"><XCircle className="size-5 shrink-0" />{outcome.message}</p>
        )}
      </div>
    </div>
  );
}
