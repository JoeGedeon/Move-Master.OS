-- Enable UUID
create extension if not exists "pgcrypto";

-- Orgs
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Membership
create table if not exists org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Drivers
create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trucks
create table if not exists trucks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  label text not null,
  plate text,
  capacity_class text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Jobs (calendar anchor)
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  job_number text,
  move_date date not null,
  customer_name text,
  customer_phone text,
  pickup_address text,
  dropoff_address text,
  status text not null default 'scheduled', -- scheduled/completed/cancelled
  price_estimated numeric(10,2) not null default 0,
  price_final numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_org_date_idx on jobs (org_id, move_date);
create index if not exists jobs_org_status_idx on jobs (org_id, status);

-- Dispatch assignments
create table if not exists job_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  truck_id uuid references trucks(id) on delete set null,
  role text default 'lead',
  created_at timestamptz not null default now()
);

create index if not exists job_assignments_job_idx on job_assignments (job_id);

-- Receipts
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  driver_id uuid references drivers(id) on delete set null,
  truck_id uuid references trucks(id) on delete set null,
  receipt_date date not null,
  vendor text,
  total numeric(10,2) not null default 0,
  category text not null default 'other',
  category_confidence numeric(4,3) not null default 0,
  notes text,
  needs_review boolean not null default false,
  duplicate_of_receipt_id uuid references receipts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists receipts_org_date_idx on receipts (org_id, receipt_date);
create index if not exists receipts_org_driver_date_idx on receipts (org_id, driver_id, receipt_date);

-- Uploads (files in storage)
create table if not exists uploads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  uploader_user_id uuid references auth.users(id) on delete set null,
  uploader_driver_id uuid references drivers(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  kind text not null default 'unknown', -- unknown/receipt/furniture/video_walkthrough
  storage_bucket text not null default 'uploads',
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  created_at timestamptz not null default now()
);

create index if not exists uploads_org_kind_idx on uploads (org_id, kind);
create index if not exists uploads_org_job_idx on uploads (org_id, job_id);

-- AI runs
create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  upload_id uuid not null references uploads(id) on delete cascade,
  type text not null,   -- classify/receipt_extract/furniture_estimate
  status text not null default 'queued', -- queued/running/succeeded/failed
  model text,
  input_meta jsonb,
  output_json jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- Furniture estimates
create table if not exists furniture_estimates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  upload_id uuid not null references uploads(id) on delete cascade,
  estimate_date date not null default current_date,
  items_json jsonb not null default '[]'::jsonb,
  cubic_feet_estimate int not null default 0,
  truck_recommendation text,
  crew_hours_estimate numeric(6,2) not null default 0,
  confidence numeric(4,3) not null default 0,
  needs_review boolean not null default true,
  created_at timestamptz not null default now()
);
