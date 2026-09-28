create table if not exists public.earthquakes (
  usgs_id text primary key,
  occurred_at timestamptz not null,
  magnitude double precision,
  place text,
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  depth_km double precision not null default 0,
  event_url text,
  event_type text,
  updated_at timestamptz not null default now()
);

create index if not exists earthquakes_occurred_at_idx on public.earthquakes (occurred_at);
create index if not exists earthquakes_magnitude_time_idx on public.earthquakes (magnitude, occurred_at);

create table if not exists public.catalog_years (
  year integer primary key check (year between 1900 and 2200),
  minimum_magnitude double precision not null,
  event_count integer not null default 0,
  loaded_at timestamptz not null default now()
);

alter table public.earthquakes enable row level security;
alter table public.catalog_years enable row level security;
revoke all on public.earthquakes from anon, authenticated;
revoke all on public.catalog_years from anon, authenticated;
grant all on public.earthquakes to service_role;
grant all on public.catalog_years to service_role;
