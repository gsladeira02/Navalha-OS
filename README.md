# NavalhaOS

Sistema de gestão para barbearias com agenda, clientes, barbeiros, serviços, caixa e comissões.

## Importante

Esta versão **não permite criar conta pelo site**. O login só funciona para usuários criados manualmente no Supabase e vinculados a uma barbearia ativa.

## Como configurar

1. Crie um projeto no Supabase.
2. Vá em **SQL Editor** e rode `sql/schema.sql`.
3. Em `js/config.js`, coloque sua `SUPABASE_URL` e sua `SUPABASE_ANON_KEY`.
4. No Supabase, vá em **Authentication > Users** e crie o usuário do cliente manualmente.
5. Copie o UUID do usuário criado.
6. Rode no SQL Editor:

```sql
insert into public.barbershops (owner_id, name, phone, plan, subscription_status, active)
values ('UUID_DO_USUARIO', 'Nome da Barbearia', '27999999999', 'professional', 'active', true);
```

## Como bloquear uma conta

```sql
update public.barbershops
set subscription_status = 'inactive', active = false
where owner_id = 'UUID_DO_USUARIO';
```

## Como subir no GitHub e Vercel

```bash
git init
git add .
git commit -m "primeira versão NavalhaOS"
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

Depois conecte o repositório na Vercel.

## Páginas

- `login.html` — login sem cadastro público
- `dashboard.html` — resumo financeiro e agenda do dia
- `agenda.html` — marcação e conclusão de atendimentos
- `clientes.html` — cadastro de clientes
- `barbeiros.html` — cadastro de barbeiros e comissão
- `servicos.html` — cadastro de serviços
- `caixa.html` — entradas e saídas
- `comissoes.html` — cálculo de comissão por barbeiro
