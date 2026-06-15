-- Correção: plano interno da barbearia
-- Algumas bases antigas criaram a constraint barbershops_plan_check com valores limitados.
-- A assinatura real agora fica em system_subscriptions, então o campo barbershops.plan não deve bloquear novos cadastros.
alter table public.barbershops
drop constraint if exists barbershops_plan_check;

alter table public.barbershops
alter column plan set default 'complete';
