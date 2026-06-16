-- Serviços atendidos por cada profissional
create table if not exists public.barber_services (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamptz default now(),
  unique (barber_id, service_id)
);

alter table public.barber_services enable row level security;

grant select, insert, update, delete on public.barber_services to authenticated;
grant select on public.barber_services to anon;
grant select, insert, update, delete on public.barber_services to service_role;

drop policy if exists "barber_services_manage_own" on public.barber_services;
create policy "barber_services_manage_own" on public.barber_services
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));

drop policy if exists "public_read_barber_services" on public.barber_services;
create policy "public_read_barber_services" on public.barber_services
for select to anon
using (
  exists (
    select 1 from public.barbershops b
    where b.id = barber_services.barbershop_id
    and b.active = true
    and b.subscription_status = 'active'
  )
);
