-- CRM schema for Supabase (Postgres).
-- The API server runs this automatically on start, but you can also paste it into
-- Supabase Dashboard -> SQL Editor -> New query -> Run.

create table if not exists crm_users (
  id            bigserial primary key,
  name          text not null,
  email         text not null,
  password_hash text not null,
  role          text not null default 'employee' check (role in ('admin', 'employee')),
  phone         text,
  designation   text,
  department    text,
  joining_date  date,
  address       text,
  photo         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index if not exists crm_users_email_key on crm_users (lower(email));

-- Registration page fields (safe to re-run on an existing database)
alter table crm_users add column if not exists salary      numeric;
alter table crm_users add column if not exists ending_date date;
alter table crm_users add column if not exists remarks     text;
alter table crm_users add column if not exists document    text;
-- company resources handed to the employee: [{ "name": "Laptop", "details": "Dell 5410, SN 123" }, ...]
alter table crm_users add column if not exists resources   jsonb not null default '[]'::jsonb;

-- One table holds every module (leads, quotations, sales orders, inventory ...).
-- Module-specific fields live in the jsonb "data" column; see server/src/modules.js.
create table if not exists crm_records (
  id                bigserial primary key,
  module            text not null,
  data              jsonb not null default '{}'::jsonb,
  status            text,
  created_by        bigint references crm_users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  status_changed_at timestamptz
);
create index if not exists crm_records_module_idx on crm_records (module, created_at desc);
create index if not exists crm_records_owner_idx  on crm_records (created_by);
create index if not exists crm_records_status_idx on crm_records (module, status, status_changed_at);

-- Auto-numbering for QT-2026-0001, PI-2026-0001, ...
create table if not exists crm_counters (
  name  text primary key,
  value integer not null
);

-- Only the API server (direct Postgres connection) touches these tables.
-- Turning RLS on with no policies blocks the public anon/authenticated API keys from reading them.
alter table crm_users    enable row level security;
alter table crm_records  enable row level security;
alter table crm_counters enable row level security;

-- Employee code shown as "ID: LOY-325332" (filled in for older rows on start-up)
alter table crm_users add column if not exists emp_code text;
create unique index if not exists crm_users_emp_code_key on crm_users (emp_code);
update crm_users
   set emp_code = 'LOY-' || (100000 + id * 7919 % 900000)::text
 where emp_code is null;

-- Email Lead Intelligence (Lead Filler): one Gmail connection per CRM user.
-- Tokens are encrypted by the API server (AES-256-GCM, key derived from JWT_SECRET).
create table if not exists crm_gmail (
  user_id       bigint primary key references crm_users(id) on delete cascade,
  email         text,
  refresh_token text,
  access_token  text,
  expires_at    timestamptz,
  last_scan_at  timestamptz,
  updated_at    timestamptz not null default now()
);

-- Possible leads found in the inbox. status: new | converted | ignored
create table if not exists crm_email_leads (
  id          bigserial primary key,
  user_id     bigint not null references crm_users(id) on delete cascade,
  message_id  text not null,
  thread_id   text,
  from_name   text,
  from_email  text,
  subject     text,
  snippet     text,
  body        text,
  phone       text,
  company     text,
  city        text,
  category    text,
  priority    text,
  score       integer not null default 0,
  reasons     jsonb not null default '[]'::jsonb,
  status      text not null default 'new' check (status in ('new', 'converted', 'ignored')),
  lead_id     bigint references crm_records(id) on delete set null,
  received_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, message_id)
);
create index if not exists crm_email_leads_user_idx on crm_email_leads (user_id, status, received_at desc);

alter table crm_gmail       enable row level security;
alter table crm_email_leads enable row level security;
