# NavalhaOS

Versão final do sistema para clientes, com visual em azul e vermelho, logo própria e acesso apenas para contas ativas.

## Estrutura
- Login sem cadastro público
- Dashboard
- Agenda
- Clientes
- Barbeiros
- Serviços
- Caixa
- Comissões

## Configuração rápida
1. Crie um projeto no Supabase.
2. Rode o arquivo `sql/schema.sql`.
3. Confira o arquivo `js/config.js`.
4. Crie os usuários dos clientes manualmente em **Authentication > Users**.
5. Vincule cada cliente em `public.barbershops` com `subscription_status = 'active'`.

## Observação
O site não mostra mensagens administrativas na interface. O acesso ao painel só é liberado para usuários com barbearia ativa no banco.
