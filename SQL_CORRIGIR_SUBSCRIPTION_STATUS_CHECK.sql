-- Correção: status da assinatura da barbearia
-- Algumas bases antigas criaram a constraint barbershops_subscription_status_check
-- sem aceitar status novos como pending, renewal_pending, overdue e expired.
alter table public.barbershops
drop constraint if exists barbershops_subscription_status_check;

alter table public.barbershops
alter column subscription_status set default 'inactive';
