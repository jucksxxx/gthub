insert into courts (name, slug, sport, surface, is_indoor, hourly_rate_cents, opens_at, closes_at) values
  ('Pickle 1', 'pickle-1', 'pickleball', 'Acrylic hard court', false, 40000, '06:00', '22:00'),
  ('Pickle 2', 'pickle-2', 'pickleball', 'Acrylic hard court', false, 40000, '06:00', '22:00'),
  ('Pickle 3', 'pickle-3', 'pickleball', 'Cushioned indoor',   true,  50000, '06:00', '22:00'),
  ('Tennis A', 'tennis-a', 'tennis',     'Hard court',         false, 60000, '06:00', '22:00'),
  ('Tennis B', 'tennis-b', 'tennis',     'Clay',               false, 70000, '06:00', '22:00'),
  ('Padel 1',  'padel-1',  'padel',      'Glass-walled turf',  true,  90000, '06:00', '22:00'),
  ('Padel 2',  'padel-2',  'padel',      'Glass-walled turf',  true,  90000, '06:00', '22:00');

-- Open play for the next 7 days: 18:00-20:00 on Pickle 1, 07:00-09:00 on Pickle 2
insert into open_play_sessions (court_id, sport, title, skill_level, starts_at, ends_at, capacity, price_per_player_cents)
select c.id, 'pickleball', t.title, t.lvl::skill_level,
       ((date_trunc('day', now() at time zone 'Asia/Manila') + make_interval(days => d, hours => t.h)) at time zone 'Asia/Manila'),
       ((date_trunc('day', now() at time zone 'Asia/Manila') + make_interval(days => d, hours => t.h + 2)) at time zone 'Asia/Manila'),
       8, 25000
from generate_series(0, 6) d
cross join (values ('pickle-1', 18, 'Evening rotation', 'intermediate'),
                   ('pickle-2',  7, 'Sunrise social',   'all')) as t(slug, h, title, lvl)
join courts c on c.slug = t.slug;

insert into player_stats (display_name, sport, rating, wins, losses, streak) values
  ('Mika R.', 'pickleball', 4.62, 41, 9, 7), ('Dani L.', 'pickleball', 4.38, 37, 14, 3),
  ('Jo C.', 'pickleball', 4.15, 30, 15, -1), ('Paolo S.', 'pickleball', 3.92, 24, 17, 2),
  ('Aya T.', 'pickleball', 3.71, 19, 16, 1),
  ('Ramon V.', 'tennis', 4.40, 33, 12, 4), ('Bea N.', 'tennis', 4.05, 28, 14, 2),
  ('Gab F.', 'padel', 4.20, 26, 10, 5), ('Lia M.', 'padel', 3.88, 18, 12, -2);
