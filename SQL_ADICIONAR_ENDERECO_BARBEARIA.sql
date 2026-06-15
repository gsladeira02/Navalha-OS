-- Endereço da barbearia no cadastro e no link de agenda
alter table public.barbershops
add column if not exists address text;

alter table public.system_subscriptions
add column if not exists barbershop_address text;

grant select, insert, update on public.barbershops to authenticated;
grant select on public.barbershops to anon;
grant select, insert, update, delete on public.system_subscriptions to service_role;
