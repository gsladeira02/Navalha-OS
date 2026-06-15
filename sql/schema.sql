create extension if not exists pgcrypto;

create table if not exists public.barbershops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  plan text default 'complete',
  subscription_status text not null default 'inactive',
  active boolean not null default false,
  slug text unique,
  booking_min_advance_minutes integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint barbershops_owner_id_unique unique (owner_id)
);


create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  name text not null,
  address text,
  phone text,
  active boolean not null default true,
  created_at timestamptz default now(),
  unique (barbershop_id, name)
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
  unit_id uuid references public.units(id) on delete set null,
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


create table if not exists public.barber_availability (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  break_start time,
  break_end time,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  barber_id uuid references public.barbers(id) on delete cascade,
  block_date date not null,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz default now()
);

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.barbershops, public.units, public.barbers, public.services, public.barber_availability, public.schedule_blocks to anon;
grant insert on public.customers, public.appointments to anon;

alter table public.barbershops enable row level security;
alter table public.units enable row level security;
alter table public.barbers enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.cash_entries enable row level security;
alter table public.barber_availability enable row level security;
alter table public.schedule_blocks enable row level security;

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

drop policy if exists "units_manage_own" on public.units;
create policy "units_manage_own" on public.units
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));

drop policy if exists "public_read_active_units" on public.units;
create policy "public_read_active_units" on public.units
for select to anon
using (
  active = true and exists (
    select 1 from public.barbershops b
    where b.id = units.barbershop_id
    and b.active = true
    and b.subscription_status = 'active'
  )
);

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


drop policy if exists "availability_manage_own" on public.barber_availability;
create policy "availability_manage_own" on public.barber_availability
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));

drop policy if exists "blocks_manage_own" on public.schedule_blocks;
create policy "blocks_manage_own" on public.schedule_blocks
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));

drop policy if exists "public_read_availability" on public.barber_availability;
create policy "public_read_availability" on public.barber_availability
for select to anon
using (
  active = true
  and exists (
    select 1 from public.barbershops b
    where b.id = barber_availability.barbershop_id
    and b.active = true
    and b.subscription_status = 'active'
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
    and b.subscription_status = 'active'
  )
);


-- Atualizações para bancos já existentes
alter table public.barbershops add column if not exists slug text unique;
alter table public.barbershops alter column plan set default 'complete';
alter table public.appointments add column if not exists commission_percent numeric(5,2) not null default 0;

create unique index if not exists appointments_no_double_booking_idx
on public.appointments(barbershop_id, barber_id, appointment_date, start_time)
where status in ('marcado','confirmado','concluido');

-- Função pública segura: retorna apenas horários ocupados, sem expor dados de clientes
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
    and b.subscription_status = 'active';
$$;

grant execute on function public.get_public_booked_slots(uuid, uuid, date) to anon, authenticated;

-- Privacidade no link público: visitante não deve listar clientes nem detalhes de agenda
revoke select on public.customers from anon;
revoke select on public.appointments from anon;

drop policy if exists "public_select_customers_by_phone" on public.customers;
drop policy if exists "public_select_appointments_slots" on public.appointments;


-- Antecedência mínima para agendamento público
alter table public.barbershops
add column if not exists booking_min_advance_minutes integer not null default 0;

comment on column public.barbershops.booking_min_advance_minutes is
'Tempo mínimo, em minutos, que o cliente precisa respeitar antes de marcar pelo link público.';


-- Permite que o link público /agenda/nomedabarbearia encontre a barbearia ativa.
drop policy if exists "public_read_active_barbershops" on public.barbershops;
drop policy if exists "public_read_active_barbershops_name_link" on public.barbershops;

create policy "public_read_active_barbershops_name_link" on public.barbershops
for select to anon
using (active = true and subscription_status = 'active');


-- Alterações de agenda para um dia específico
-- Ex.: feriado fechado, abrir só pela manhã, abrir em horário diferente.
create table if not exists public.special_day_hours (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  special_date date not null,
  closed boolean not null default false,
  start_time time,
  end_time time,
  break_start time,
  break_end time,
  reason text,
  created_at timestamptz not null default now(),
  unique (barbershop_id, barber_id, special_date)
);

alter table public.special_day_hours enable row level security;

drop policy if exists "owners_manage_special_day_hours" on public.special_day_hours;
create policy "owners_manage_special_day_hours" on public.special_day_hours
for all to authenticated
using (
  exists (
    select 1 from public.barbershops b
    where b.id = special_day_hours.barbershop_id
    and b.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.barbershops b
    where b.id = special_day_hours.barbershop_id
    and b.owner_id = auth.uid()
  )
);

drop policy if exists "public_read_special_day_hours" on public.special_day_hours;
create policy "public_read_special_day_hours" on public.special_day_hours
for select to anon
using (
  exists (
    select 1 from public.barbershops b
    where b.id = special_day_hours.barbershop_id
    and b.active = true
    and b.subscription_status = 'active'
  )
);

grant select on public.special_day_hours to anon;
grant select, insert, update, delete on public.special_day_hours to authenticated;


-- Unidades e vínculo de barbeiros por unidade
alter table public.barbers
add column if not exists unit_id uuid references public.units(id) on delete set null;

alter table public.appointments
add column if not exists unit_id uuid references public.units(id) on delete set null;

insert into public.units (barbershop_id, name, active)
select b.id, 'Unidade Principal', true
from public.barbershops b
where not exists (
  select 1 from public.units u where u.barbershop_id = b.id
);

update public.barbers br
set unit_id = u.id
from public.units u
where br.barbershop_id = u.barbershop_id
and br.unit_id is null
and u.name = 'Unidade Principal';


-- Planos recorrentes, assinaturas de clientes, pagamentos e notas fiscais
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  billing_day integer not null default 10 check (billing_day between 1 and 28),
  interval text not null default 'monthly',
  active boolean not null default true,
  external_provider text,
  external_plan_id text,
  created_at timestamptz default now()
);

create table if not exists public.customer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  customer_name text,
  plan_name text,
  status text not null default 'active',
  start_date date not null default current_date,
  next_billing_date date,
  checkout_url text,
  external_provider text,
  external_subscription_id text,
  canceled_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  subscription_id uuid references public.customer_subscriptions(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  customer_name text,
  plan_name text,
  amount numeric(10,2) not null default 0,
  due_date date not null,
  status text not null default 'pending',
  checkout_url text,
  payment_method text,
  external_provider text,
  external_payment_id text,
  paid_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.fiscal_invoices (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  payment_id uuid references public.subscription_payments(id) on delete set null,
  subscription_id uuid references public.customer_subscriptions(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  amount numeric(10,2) not null default 0,
  status text not null default 'pending',
  service_description text,
  invoice_number text,
  invoice_url text,
  external_provider text,
  external_invoice_id text,
  error_message text,
  issued_at timestamptz,
  created_at timestamptz default now()
);

alter table public.subscription_plans enable row level security;
alter table public.customer_subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.fiscal_invoices enable row level security;

drop policy if exists "subscription_plans_manage_own" on public.subscription_plans;
create policy "subscription_plans_manage_own" on public.subscription_plans
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));

drop policy if exists "customer_subscriptions_manage_own" on public.customer_subscriptions;
create policy "customer_subscriptions_manage_own" on public.customer_subscriptions
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));

drop policy if exists "subscription_payments_manage_own" on public.subscription_payments;
create policy "subscription_payments_manage_own" on public.subscription_payments
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));

drop policy if exists "fiscal_invoices_manage_own" on public.fiscal_invoices;
create policy "fiscal_invoices_manage_own" on public.fiscal_invoices
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));

grant select, insert, update, delete on public.subscription_plans to authenticated;
grant select, insert, update, delete on public.customer_subscriptions to authenticated;
grant select, insert, update, delete on public.subscription_payments to authenticated;
grant select, insert, update, delete on public.fiscal_invoices to authenticated;


-- Integrações de cobrança e emissão fiscal por barbearia
create table if not exists public.billing_integrations (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade unique,
  payment_provider text not null default 'asaas',
  payment_api_key text,
  fiscal_provider text not null default 'nfeio',
  fiscal_api_key text,
  fiscal_company_id text,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.billing_integrations enable row level security;

drop policy if exists "billing_integrations_manage_own" on public.billing_integrations;
create policy "billing_integrations_manage_own" on public.billing_integrations
for all to authenticated
using (public.user_owns_barbershop(barbershop_id))
with check (public.user_owns_barbershop(barbershop_id));

grant select, insert, update, delete on public.billing_integrations to authenticated;

alter table public.customers
add column if not exists email text,
add column if not exists cpf_cnpj text,
add column if not exists external_payment_customer_id text;

alter table public.customer_subscriptions
add column if not exists external_provider text,
add column if not exists external_subscription_id text;

alter table public.subscription_payments
add column if not exists external_provider text,
add column if not exists external_payment_id text,
add column if not exists external_subscription_id text;

alter table public.fiscal_invoices
add column if not exists external_provider text,
add column if not exists external_invoice_id text,
add column if not exists error_message text;

grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.customers to service_role;


-- Métodos de pagamento e recorrência configurável
alter table public.subscription_plans
add column if not exists payment_method text not null default 'PIX',
add column if not exists is_recurring boolean not null default true,
add column if not exists interval_days integer default 30;

alter table public.customer_subscriptions
add column if not exists payment_method text default 'PIX',
add column if not exists is_recurring boolean not null default true,
add column if not exists interval_days integer default 30;

alter table public.subscription_payments
add column if not exists payment_method text default 'PIX',
add column if not exists is_recurring boolean default true,
add column if not exists interval_days integer;


-- Status detalhado das cobranças Asaas
alter table public.subscription_payments
add column if not exists asaas_status text,
add column if not exists status_checked_at timestamptz;

grant select, insert, update, delete on public.subscription_payments to authenticated;
grant select, insert, update, delete on public.subscription_payments to service_role;


-- Dados obrigatórios do primeiro acesso
alter table public.barbershops
add column if not exists admin_name text,
add column if not exists admin_cpf text,
add column if not exists admin_phone text,
add column if not exists cnpj text,
add column if not exists setup_completed boolean not null default false,
add column if not exists setup_completed_at timestamptz;

grant select, update on public.barbershops to authenticated;
grant select, update on public.barbershops to service_role;


-- Compartilhamento de cobranças por WhatsApp
alter table public.subscription_payments
add column if not exists invoice_url text,
add column if not exists bank_slip_url text,
add column if not exists pix_payload text,
add column if not exists pix_encoded_image text;

grant select, insert, update, delete on public.subscription_payments to authenticated;
grant select, insert, update, delete on public.subscription_payments to service_role;


-- Cancelamento real de cobranças no Asaas
alter table public.subscription_payments
add column if not exists canceled_at timestamptz;

grant select, insert, update, delete on public.subscription_payments to authenticated;
grant select, insert, update, delete on public.subscription_payments to service_role;


-- Assinatura do próprio NavalhaOS pelos clientes
alter table public.barbershops
add column if not exists admin_name text,
add column if not exists admin_cpf text,
add column if not exists admin_phone text,
add column if not exists cnpj text,
add column if not exists setup_completed boolean not null default false,
add column if not exists setup_completed_at timestamptz;

create table if not exists public.system_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  barbershop_id uuid references public.barbershops(id) on delete set null,
  admin_name text not null,
  admin_email text not null,
  admin_phone text,
  admin_cpf text,
  barbershop_name text not null,
  barbershop_cnpj text,
  barbershop_phone text,
  plan_name text not null default 'NavalhaOS Completo',
  amount numeric(10,2) not null default 14.90,
  cycle text not null default 'MONTHLY',
  payment_method text not null default 'PIX',
  status text not null default 'pending',
  external_provider text default 'asaas',
  external_customer_id text,
  external_subscription_id text,
  external_payment_id text,
  checkout_url text,
  invoice_url text,
  bank_slip_url text,
  asaas_status text,
  next_due_date date,
  paid_at timestamptz,
  canceled_at timestamptz,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.system_subscriptions enable row level security;

drop policy if exists "system_subscriptions_owner_read" on public.system_subscriptions;
create policy "system_subscriptions_owner_read" on public.system_subscriptions
for select to authenticated
using (user_id = auth.uid());

grant usage on schema public to authenticated, anon, service_role;
grant select on public.system_subscriptions to authenticated;
grant select, insert, update, delete on public.system_subscriptions to service_role;
grant select, insert, update on public.barbershops to service_role;
grant usage, select on all sequences in schema public to service_role;


-- Assinatura do próprio NavalhaOS via InfinitePay
alter table public.barbershops
add column if not exists admin_name text,
add column if not exists admin_cpf text,
add column if not exists admin_phone text,
add column if not exists cnpj text,
add column if not exists setup_completed boolean not null default false,
add column if not exists setup_completed_at timestamptz;

create table if not exists public.system_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  barbershop_id uuid references public.barbershops(id) on delete set null,
  admin_name text not null,
  admin_email text not null,
  admin_phone text,
  admin_cpf text,
  barbershop_name text not null,
  barbershop_cnpj text,
  barbershop_phone text,
  plan_name text not null default 'NavalhaOS Completo',
  amount numeric(10,2) not null default 14.90,
  cycle text not null default 'MONTHLY',
  payment_method text not null default 'INFINITEPAY_CHECKOUT',
  status text not null default 'pending',
  external_provider text default 'infinitepay',
  external_customer_id text,
  external_subscription_id text,
  external_payment_id text,
  external_invoice_slug text,
  order_nsu text,
  transaction_nsu text,
  receipt_url text,
  capture_method text,
  checkout_url text,
  invoice_url text,
  bank_slip_url text,
  asaas_status text,
  infinitepay_payload jsonb,
  next_due_date date,
  paid_at timestamptz,
  canceled_at timestamptz,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.system_subscriptions
add column if not exists external_invoice_slug text,
add column if not exists order_nsu text,
add column if not exists transaction_nsu text,
add column if not exists receipt_url text,
add column if not exists capture_method text,
add column if not exists infinitepay_payload jsonb;

create unique index if not exists system_subscriptions_order_nsu_idx
on public.system_subscriptions(order_nsu)
where order_nsu is not null;

alter table public.system_subscriptions enable row level security;

drop policy if exists "system_subscriptions_owner_read" on public.system_subscriptions;
create policy "system_subscriptions_owner_read" on public.system_subscriptions
for select to authenticated
using (user_id = auth.uid());

grant usage on schema public to authenticated, anon, service_role;
grant select on public.system_subscriptions to authenticated;
grant select, insert, update, delete on public.system_subscriptions to service_role;
grant select, insert, update on public.barbershops to service_role;
grant usage, select on all sequences in schema public to service_role;


-- Planos e recorrência da assinatura do próprio NavalhaOS
alter table public.barbershops
add column if not exists admin_name text,
add column if not exists admin_cpf text,
add column if not exists admin_phone text,
add column if not exists cnpj text,
add column if not exists setup_completed boolean not null default false,
add column if not exists setup_completed_at timestamptz;

create table if not exists public.system_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  barbershop_id uuid references public.barbershops(id) on delete set null,
  admin_name text not null,
  admin_email text not null,
  admin_phone text,
  admin_cpf text,
  barbershop_name text not null,
  barbershop_cnpj text,
  barbershop_phone text,
  plan_name text not null default 'Mensal',
  amount numeric(10,2) not null default 49.90,
  cycle text not null default '30_DAYS',
  payment_method text not null default 'CHECKOUT',
  status text not null default 'pending',
  external_provider text default 'infinitepay',
  external_customer_id text,
  external_subscription_id text,
  external_payment_id text,
  external_invoice_slug text,
  order_nsu text,
  transaction_nsu text,
  receipt_url text,
  capture_method text,
  checkout_url text,
  invoice_url text,
  bank_slip_url text,
  asaas_status text,
  infinitepay_payload jsonb,
  next_due_date date,
  paid_at timestamptz,
  canceled_at timestamptz,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.system_subscriptions
add column if not exists plan_code text,
add column if not exists plan_label text,
add column if not exists plan_display_price text,
add column if not exists amount_cents integer,
add column if not exists installments integer,
add column if not exists period_months integer,
add column if not exists interval_days integer,
add column if not exists grace_days integer not null default 3,
add column if not exists expected_period_start date,
add column if not exists expected_period_end date,
add column if not exists expected_grace_until date,
add column if not exists current_period_start date,
add column if not exists current_period_end date,
add column if not exists grace_until date,
add column if not exists next_charge_at date,
add column if not exists renewal_created_at timestamptz,
add column if not exists external_invoice_slug text,
add column if not exists order_nsu text,
add column if not exists transaction_nsu text,
add column if not exists receipt_url text,
add column if not exists capture_method text,
add column if not exists infinitepay_payload jsonb;

create unique index if not exists system_subscriptions_order_nsu_idx
on public.system_subscriptions(order_nsu)
where order_nsu is not null;

alter table public.system_subscriptions enable row level security;

drop policy if exists "system_subscriptions_owner_read" on public.system_subscriptions;
create policy "system_subscriptions_owner_read" on public.system_subscriptions
for select to authenticated
using (user_id = auth.uid());

grant usage on schema public to authenticated, anon, service_role;
grant select on public.system_subscriptions to authenticated;
grant select, insert, update, delete on public.system_subscriptions to service_role;
grant select, insert, update on public.barbershops to service_role;
grant usage, select on all sequences in schema public to service_role;


-- Correção: plano interno da barbearia
-- Algumas bases antigas criaram a constraint barbershops_plan_check com valores limitados.
-- A assinatura real agora fica em system_subscriptions, então o campo barbershops.plan não deve bloquear novos cadastros.
alter table public.barbershops
drop constraint if exists barbershops_plan_check;

alter table public.barbershops
alter column plan set default 'complete';

-- Correção: status da assinatura da barbearia
-- Algumas bases antigas criaram a constraint barbershops_subscription_status_check
-- sem aceitar status novos como pending, renewal_pending, overdue e expired.
alter table public.barbershops
drop constraint if exists barbershops_subscription_status_check;

alter table public.barbershops
alter column subscription_status set default 'inactive';


-- Troca de plano antes do pagamento e destaque do plano anual
alter table public.system_subscriptions
add column if not exists replaced_order_nsus jsonb not null default '[]'::jsonb,
add column if not exists link_replaced_at timestamptz,
add column if not exists pending_plan_code text,
add column if not exists pending_plan_label text,
add column if not exists pending_plan_display_price text,
add column if not exists pending_plan_starts_at date,
add column if not exists plan_change_requested_at timestamptz;

create table if not exists public.system_payment_events (
  id uuid primary key default gen_random_uuid(),
  external_provider text,
  order_nsu text,
  transaction_nsu text,
  external_invoice_slug text,
  status text not null default 'received',
  reason text,
  payload jsonb,
  created_at timestamptz default now()
);

alter table public.system_payment_events enable row level security;

grant select, insert, update, delete on public.system_payment_events to service_role;
grant select on public.system_payment_events to authenticated;


-- Endereço da barbearia no cadastro e no link de agenda
alter table public.barbershops
add column if not exists address text;

alter table public.system_subscriptions
add column if not exists barbershop_address text;

grant select, insert, update on public.barbershops to authenticated;
grant select on public.barbershops to anon;
grant select, insert, update, delete on public.system_subscriptions to service_role;
