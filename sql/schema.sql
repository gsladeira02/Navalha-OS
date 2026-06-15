create extension if not exists pgcrypto;

create table if not exists public.barbershops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  plan text default 'professional',
  subscription_status text not null default 'inactive',
  active boolean not null default false,
  slug text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint barbershops_owner_id_unique unique (owner_id)
);

create table if not exists public.barbers (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  phone text,
  commission_percent numeric(5,2) not null default 50,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null default 0,
  duration_minutes integer not null default 30,
  commission_percent numeric(5,2),
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  phone text,
  birthday date,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  barber_id uuid references public.barbers(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  customer_name text,
  customer_phone text,
  service_name text,
  barber_name text,
  appointment_date date not null,
  start_time time not null,
  end_time time,
  price numeric(10,2) not null default 0,
  commission_percent numeric(5,2) not null default 0,
  status text not null default 'marcado',
  payment_method text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  type text not null default 'entrada',
  description text not null,
  amount numeric(10,2) not null,
  payment_method text,
  entry_date date not null default current_date,
  created_at timestamptz default now()
);

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.barbershops, public.barbers, public.services to anon;
grant select, insert on public.customers, public.appointments to anon;

alter table public.barbershops enable row level security;
alter table public.barbers enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.cash_entries enable row level security;

drop policy if exists "barbershops_select_own" on public.barbershops;
create policy "barbershops_select_own" on public.barbershops
for select to authenticated
using (owner_id = auth.uid());

drop policy if exists "barbershops_update_own" on public.barbershops;
create policy "barbershops_update_own" on public.barbershops
for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create or replace function public.user_owns_barbershop(target_barbershop_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.barbershops b
    where b.id = target_barbershop_id and b.owner_id = auth.uid()
  );
$$;

drop policy if exists "barbers_manage_own" on public.barbers;
create policy "barbers_manage_own" on public.barbers
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));

drop policy if exists "services_manage_own" on public.services;
create policy "services_manage_own" on public.services
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));

drop policy if exists "customers_manage_own" on public.customers;
create policy "customers_manage_own" on public.customers
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));

drop policy if exists "appointments_manage_own" on public.appointments;
create policy "appointments_manage_own" on public.appointments
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));

drop policy if exists "cash_entries_manage_own" on public.cash_entries;
create policy "cash_entries_manage_own" on public.cash_entries
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));


-- Políticas públicas para link de agendamento
drop policy if exists "public_read_active_barbershops" on public.barbershops;
create policy "public_read_active_barbershops" on public.barbershops
for select to anon
using (active = true and subscription_status = 'active' and slug is not null);

drop policy if exists "public_read_active_barbers" on public.barbers;
create policy "public_read_active_barbers" on public.barbers
for select to anon
using (active = true and exists (select 1 from public.barbershops b where b.id = barbers.barbershop_id and b.active = true and b.subscription_status = 'active'));

drop policy if exists "public_read_active_services" on public.services;
create policy "public_read_active_services" on public.services
for select to anon
using (active = true and exists (select 1 from public.barbershops b where b.id = services.barbershop_id and b.active = true and b.subscription_status = 'active'));

drop policy if exists "public_insert_customers" on public.customers;
create policy "public_insert_customers" on public.customers
for insert to anon
with check (exists (select 1 from public.barbershops b where b.id = customers.barbershop_id and b.active = true and b.subscription_status = 'active'));

drop policy if exists "public_select_customers_by_phone" on public.customers;
create policy "public_select_customers_by_phone" on public.customers
for select to anon
using (exists (select 1 from public.barbershops b where b.id = customers.barbershop_id and b.active = true and b.subscription_status = 'active'));

drop policy if exists "public_insert_appointments" on public.appointments;
create policy "public_insert_appointments" on public.appointments
for insert to anon
with check (status = 'marcado' and exists (select 1 from public.barbershops b where b.id = appointments.barbershop_id and b.active = true and b.subscription_status = 'active'));

drop policy if exists "public_select_appointments_slots" on public.appointments;
create policy "public_select_appointments_slots" on public.appointments
for select to anon
using (exists (select 1 from public.barbershops b where b.id = appointments.barbershop_id and b.active = true and b.subscription_status = 'active'));
