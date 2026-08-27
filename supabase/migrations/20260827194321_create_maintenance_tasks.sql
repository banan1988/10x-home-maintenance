-- Create maintenance_tasks: per-user home maintenance task inputs, isolated by row-level security.

create type maintenance_category as enum (
  'hvac',
  'plumbing',
  'electrical',
  'appliances',
  'safety_security',
  'exterior_structural',
  'interior_fixtures',
  'other'
);

create type maintenance_importance as enum ('low', 'medium', 'high');

create type maintenance_frequency_unit as enum ('day', 'week', 'month', 'year');

-- Note: adding a new value to any of the enums above requires its own migration and cannot be used
-- in the same transaction it is added in (a standing Postgres limitation).

create table maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category maintenance_category not null,
  importance maintenance_importance not null,
  frequency_value integer not null check (frequency_value > 0),
  frequency_unit maintenance_frequency_unit not null,
  last_done_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index maintenance_tasks_user_id_idx on maintenance_tasks (user_id);

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_maintenance_tasks_updated_at
  before update on maintenance_tasks
  for each row
  execute function set_updated_at();

alter table maintenance_tasks enable row level security;

-- RLS policies only restrict rows within privileges a role already has; the base table privilege must be
-- granted separately, and this database's default ACLs do not grant it. Scoped to authenticated only, never
-- anon, so unauthenticated requests keep seeing zero rows.
grant select, insert, update, delete on table maintenance_tasks to authenticated;

create policy "Users can select their own maintenance tasks"
  on maintenance_tasks for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own maintenance tasks"
  on maintenance_tasks for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own maintenance tasks"
  on maintenance_tasks for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own maintenance tasks"
  on maintenance_tasks for delete
  to authenticated
  using (auth.uid() = user_id);
