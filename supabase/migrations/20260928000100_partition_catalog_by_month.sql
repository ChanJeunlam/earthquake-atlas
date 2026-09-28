alter table public.catalog_years
  add column if not exists catalog_version integer not null default 1,
  add column if not exists is_capped boolean not null default false;

comment on column public.catalog_years.catalog_version is
  'Version of the ingestion strategy used for this yearly catalog; version 2 fetches each month separately.';
comment on column public.catalog_years.is_capped is
  'True when at least one monthly USGS query reached the per-request event limit, so the yearly catalog may be incomplete.';

