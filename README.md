# NavalhaOS — Versão final para venda

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


## Aba Horários

A versão inclui a tela `horarios.html`.

Nela, a barbearia cadastra:
- disponibilidade semanal por barbeiro;
- intervalo de almoço/pausa;
- bloqueios pontuais por data;
- bloqueio para barbeiro específico ou barbearia inteira.

O link público de agendamento usa esses horários e mostra ao cliente apenas os horários realmente disponíveis.


## Plano único

O sistema foi preparado para trabalhar com apenas um plano, com todas as funcionalidades liberadas para contas ativas.

Sugestão comercial:

```txt
NavalhaOS — plano único com tudo incluso por R$ 149/mês.
```

No banco, use:

```sql
plan = 'complete'
subscription_status = 'active'
active = true
```


## Páginas legais

A versão inclui:

- `privacidade.html`
- `termos.html`


## Antecedência mínima para agendamento

Na aba **Horários**, a barbearia pode definir quanto tempo de antecedência o cliente precisa respeitar para marcar pelo link público.

Opções disponíveis:
- sem antecedência mínima;
- 30 minutos;
- 1 hora;
- 2 horas;
- 3 horas;
- 4 horas;
- 12 horas;
- 1 dia.

O link público remove automaticamente os horários que estiverem antes do limite configurado.


## Link público de agendamento corrigido

O link exibido no Dashboard e na Agenda segue este formato:

```txt
https://navalha-os.vercel.app/agenda/nomedabarbearia
```

A Vercel usa `vercel.json` para redirecionar internamente esse caminho para `agendar.html`.

Se a barbearia tiver slug definido, ele será usado. Se não tiver, o sistema gera o link com base no nome da barbearia.


## Agenda em dia específico

Na aba **Horários**, existe a seção **Agenda em dia específico**.

Ela permite configurar exceções para um barbeiro em uma data específica, por exemplo:
- não abrir em um feriado;
- abrir apenas pela manhã;
- abrir em horário diferente do horário semanal;
- cadastrar um intervalo específico para aquele dia.

A regra do dia específico substitui a disponibilidade semanal somente naquela data.


## Correção da página pública de agendamento

A página `agendar.html` foi ajustada para usar caminhos absolutos (`/css`, `/js`, `/assets`) e `base href="/"`, garantindo que o layout carregue corretamente quando o cliente acessa URLs no formato `/agenda/nomedabarbearia`.


## Ajustes visuais e de link

- As listas suspensas agora mantêm o mesmo fundo escuro do restante do sistema.
- O agendamento público foi ajustado para evitar erro ao abrir links amigáveis como `/agenda/barbearia-teste`, inclusive quando o valor não é um UUID.


## Unidades e barbeiros por unidade

Na aba **Equipe**, agora é possível:
- cadastrar unidades;
- cadastrar endereço e telefone da unidade;
- ativar/inativar unidades;
- vincular cada barbeiro a uma unidade;
- filtrar barbeiros por unidade.

No agendamento público, o cliente escolhe primeiro a **unidade**, depois o serviço, barbeiro, data e horário.
