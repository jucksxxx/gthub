# openplaycourt: project structure

```
openplaycourt/
├─ supabase/migrations/
│  ├─ 0001_booking_engine.sql      enums, courts, open_play_sessions, bookings, RPCs, views, RLS
│  └─ 0002_seed.sql                demo courts, 7 days of open play, ladder
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                fonts (Bricolage Grotesque + DM Sans), metadata
│  │  ├─ globals.css               Tailwind v4 theme tokens, court-line animation
│  │  ├─ page.tsx                  landing page (server component, revalidate 30s)
│  │  ├─ actions/booking.ts        getAvailability() + createBooking() server actions
│  │  ├─ actions/checkin.ts        checkInPass(): verifies QR signature, atomic check-in
│  │  └─ staff/page.tsx            front-desk check-in screen (/staff)
│  ├─ components/
│  │  ├─ slot-finder.tsx           sport/day tabs, availability matrix, "next open" jump
│  │  ├─ open-play-board.tsx       session queue with spot pips + ladder
│  │  └─ booking-dialog.tsx        guest form, error handling, signed QR pass
│  └─ lib/
│     ├─ types.ts                  all shared interfaces and ActionResult<T>
│     ├─ time.ts                   venue-timezone and currency helpers
│     ├─ data.ts                   server-only reads (courts, stats, sessions, ladder)
│     └─ supabase/admin.ts         service-role client (server-only)
├─ .env.example · package.json · postcss.config.mjs
```

## Setup
1. `npm i` then copy `.env.example` to `.env.local`.
2. Run both migrations in the Supabase SQL editor (or `supabase db push`).
3. `npm run dev`. Add `@import "tailwindcss"` is already in globals.css; tsconfig needs `"paths": {"@/*": ["./src/*"]}` (create-next-app default with src dir).

## How double-booking is prevented
- Full rentals: `EXCLUDE USING gist (court_id =, tstzrange(starts_at, ends_at) &&)` on live bookings. Two simultaneous inserts: one wins, the other gets `SLOT_TAKEN`.
- Rentals vs open play (different tables): a per-court advisory lock plus a cross-check trigger, so a rental and a session can never overlap.
- Open-play capacity: `book_open_play` locks the session row `FOR UPDATE`, sums taken spots, then inserts. No overselling.
- RPCs are revoked from anon/authenticated and run only through the service role in Server Actions.
