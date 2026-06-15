-- NavalhaOS - Banco Supabase
-- Rode este arquivo no SQL Editor do Supabase.
-- IMPORTANTE: em Authentication > Providers > Email, mantenha o cadastro público desativado se desejar bloquear criação livre de contas.
-- O usuário do cliente deve ser criado manualmente em Authentication > Users.

create extension if not exists pgcrypto;

create table if not exists public.barbershops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  plan text not null default 'professional' check (plan in ('essential','professional','premium')),
  subscription_status text not null default 'inactive' check (subscription_status in ('active','inactive','past_due','canceled')),
  active boolean not null default false,
  created_at timestamp with time zone default now(),
  unique(owner_id)
);

create table if not exists public.barbers (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  phone text,
  commission_percent numeric(5,2) not null default 50 check (commission_percent >= 0 and commission_percent <= 100),
  active boolean not null default true,
  created_at timestamp with time zone default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null default 0 check (price >= 0),
  duration_minutes integer not null default 30 check (duration_minutes > 0),
  commission_percent numeric(5,2) check (commission_percent >= 0 and commission_percent <= 100),
  active boolean not null default true,
  created_at timestamp with time zone default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  phone text,
  birthday date,
  notes text,
  created_at timestamp with time zone default now()
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
  price numeric(10,2) not null default 0 check (price >= 0),
  status text not null default 'marcado' check (status in ('marcado','confirmado','concluido','cancelado','faltou')),
  payment_method text,
  notes text,
  created_at timestamp with time zone default now()
);

create table if not exists public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  type text not null default 'entrada' check (type in ('entrada','saida')),
  description text not null,
  amount numeric(10,2) not null check (amount >= 0),
  payment_method text,
  entry_date date not null default current_date,
  created_at timestamp with time zone default now()
);

alter table public.barbershops enable row level security;
alter table public.barbers enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.cash_entries enable row level security;

create or replace function public.is_my_active_shop(shop_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.barbershops b
    where b.id = shop_id
      and b.owner_id = auth.uid()
      and b.active = true
      and b.subscription_status = 'active'
  );
$$;

create policy "owner can read own barbershop"
on public.barbershops for select
using (owner_id = auth.uid());

create policy "owner can update own barbershop"
on public.barbershops for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- Não há policy de INSERT para barbershops: a barbearia deve ser criada manualmente por você após receber a assinatura.
-- Não há policy de DELETE para barbershops: evite exclusão acidental pelo cliente.

create policy "active owner can manage barbers"
on public.barbers for all
using (public.is_my_active_shop(barbershop_id))
with check (public.is_my_active_shop(barbershop_id));

create policy "active owner can manage services"
on public.services for all
using (public.is_my_active_shop(barbershop_id))
with check (public.is_my_active_shop(barbershop_id));

create policy "active owner can manage customers"
on public.customers for all
using (public.is_my_active_shop(barbershop_id))
with check (public.is_my_active_shop(barbershop_id));

create policy "active owner can manage appointments"
on public.appointments for all
using (public.is_my_active_shop(barbershop_id))
with check (public.is_my_active_shop(barbershop_id));

create policy "active owner can manage cash entries"
on public.cash_entries for all
using (public.is_my_active_shop(barbershop_id))
with check (public.is_my_active_shop(barbershop_id));

create index if not exists idx_barbershops_owner on public.barbershops(owner_id);
create index if not exists idx_appointments_shop_date on public.appointments(barbershop_id, appointment_date);
create index if not exists idx_cash_shop_date on public.cash_entries(barbershop_id, entry_date);

-- COMO LIBERAR UM CLIENTE APÓS PAGAMENTO:
-- 1) Crie o usuário manualmente em Authentication > Users.
-- 2) Copie o UUID do usuário.
-- 3) Rode, trocando os valores:
-- insert into public.barbershops (owner_id, name, phone, plan, subscription_status, active)
-- values ('UUID_DO_USUARIO', 'Nome da Barbearia', '27999999999', 'professional', 'active', true);
--
-- COMO BLOQUEAR UMA CONTA:
-- update public.barbershops set subscription_status = 'inactive', active = false where owner_id = 'UUID_DO_USUARIO';
