-- Teste grátis de 3 dias e cancelamento da assinatura do sistema
alter table public.system_subscriptions
add column if not exists trial_started_at timestamptz,
add column if not exists trial_ends_at date,
add column if not exists cancel_requested_at timestamptz,
add column if not exists cancel_at_period_end boolean not null default false,
add column if not exists barbershop_address text;

grant select on public.system_subscriptions to authenticated;
grant select, insert, update, delete on public.system_subscriptions to service_role;

-- Permite que a agenda pública funcione durante teste grátis e renovação pendente
drop policy if exists "public_read_active_barbershops" on public.barbershops;
create policy "public_read_active_barbershops" on public.barbershops
for select to anon
using (
  active = true
  and subscription_status in ('trial','active','renewal_pending')
  and slug is not null
);

drop policy if exists "public_read_active_units" on public.units;
create policy "public_read_active_units" on public.units
for select to anon
using (
  active = true and exists (
    select 1 from public.barbershops b
    where b.id = units.barbershop_id
    and b.active = true
    and b.subscription_status in ('trial','active','renewal_pending')
  )
);

drop policy if exists "public_read_active_barbers" on public.barbers;
create policy "public_read_active_barbers" on public.barbers
for select to anon
using (
  active = true and exists (
    select 1 from public.barbershops b
    where b.id = barbers.barbershop_id
    and b.active = true
    and b.subscription_status in ('trial','active','renewal_pending')
  )
);

drop policy if exists "public_read_active_services" on public.services;
create policy "public_read_active_services" on public.services
for select to anon
using (
  active = true and exists (
    select 1 from public.barbershops b
    where b.id = services.barbershop_id
    and b.active = true
    and b.subscription_status in ('trial','active','renewal_pending')
  )
);

drop policy if exists "public_read_availability" on public.barber_availability;
create policy "public_read_availability" on public.barber_availability
for select to anon
using (
  active = true
  and exists (
    select 1 from public.barbershops b
    where b.id = barber_availability.barbershop_id
    and b.active = true
    and b.subscription_status in ('trial','active','renewal_pending')
  )
);

drop policy if exists "public_read_schedule_blocks" on public.schedule_blocks;
create policy "public_read_schedule_blocks" on public.schedule_blocks
for select to anon
using (
  exists (
    select 1 from public.barbershops b
    where b.id = schedule_blocks.barbershop_id
    and b.active = true
    and b.subscription_status in ('trial','active','renewal_pending')
  )
);

drop policy if exists "public_insert_customers" on public.customers;
create policy "public_insert_customers" on public.customers
for insert to anon
with check (
  exists (
    select 1 from public.barbershops b
    where b.id = customers.barbershop_id
    and b.active = true
    and b.subscription_status in ('trial','active','renewal_pending')
  )
);

drop policy if exists "public_insert_appointments" on public.appointments;
create policy "public_insert_appointments" on public.appointments
for insert to anon
with check (
  status = 'marcado'
  and exists (
    select 1 from public.barbershops b
    where b.id = appointments.barbershop_id
    and b.active = true
    and b.subscription_status in ('trial','active','renewal_pending')
  )
);

-- Atualiza a função pública de horários ocupados para também aceitar teste grátis
create or replace function public.get_public_booked_slots(
  target_barbershop_id uuid,
  target_barber_id uuid,
  target_date date
)
returns table(start_time time, end_time time)
language sql
security definer
set search_path = public
as $$
  select a.start_time, a.end_time
  from public.appointments a
  join public.barbershops b on b.id = a.barbershop_id
  where a.barbershop_id = target_barbershop_id
    and a.barber_id = target_barber_id
    and a.appointment_date = target_date
    and a.status in ('marcado','confirmado','concluido')
    and b.active = true
    and b.subscription_status in ('trial','active','renewal_pending');
$$;

grant execute on function public.get_public_booked_slots(uuid, uuid, date) to anon, authenticated;
