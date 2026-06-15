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


## Módulo de assinaturas recorrentes e notas fiscais

Foi adicionada a aba **Assinaturas**, onde a barbearia pode:

- cadastrar planos recorrentes para seus próprios clientes;
- criar assinaturas vinculadas aos clientes cadastrados;
- registrar links de cobrança recorrente gerados pelo Asaas/Mercado Pago;
- gerar cobranças recorrentes no painel;
- marcar pagamentos como pagos;
- criar registros de NFS-e pendentes para os pagamentos;
- marcar notas como emitidas e salvar número/link da nota.

Importante: por segurança, as chaves de API do Asaas, Mercado Pago, NFE.io, PlugNotas ou Focus NFe não devem ficar no frontend. A emissão real de cobranças e notas deve ser feita por backend seguro, como Supabase Edge Functions. Este pacote deixa a estrutura do sistema pronta para receber essa automação.


## Backend seguro para cobranças e notas

Esta versão inclui Supabase Edge Functions em `supabase/functions` para:
- criar cobrança/assinatura recorrente via Asaas;
- emitir NFS-e via NFE.io;
- receber webhook de pagamento.

Veja as instruções em:

```txt
supabase/README_BACKEND.md
```

Importante: as chaves de API devem ser configuradas como secrets no Supabase e/ou cadastradas no módulo de integrações da barbearia. Para produção, revise criptografia/armazenamento seguro dos tokens por barbearia.


## Ajuste no fluxo de assinatura

O campo manual de link Asaas foi removido da criação de assinatura. Agora o fluxo correto é:

1. criar cliente;
2. criar plano;
3. criar assinatura;
4. clicar em **Gerar cobrança**.

A Edge Function `create-recurring-payment` cria a assinatura no Asaas e salva o link automaticamente no sistema.


## Correção Asaas produção

Se a chave do Asaas começar com `aact_prod`, use a URL de produção:

```txt
https://api.asaas.com/v3
```

Este pacote inclui o arquivo:

```txt
CORRIGIR_ASAAS_PRODUCAO_WINDOWS.bat
```

Ele ajusta a secret `ASAAS_BASE_URL` e redeploya a função `create-recurring-payment`.


## Clientes com CPF/CNPJ

A tela de clientes agora possui:
- e-mail;
- CPF/CNPJ obrigatório;
- botão de editar cliente.

O Asaas exige CPF/CNPJ para criar cobrança recorrente. Depois de atualizar o site, edite o cliente usado na assinatura e preencha o CPF/CNPJ antes de clicar em **Gerar cobrança**.


## Método de pagamento e recorrência

Na aba **Assinaturas**, o cadastro de plano/cobrança agora permite escolher:

- método de pagamento: Pix, crédito, débito ou boleto;
- se a cobrança é recorrente ou não;
- dias entre cobranças quando for recorrente.

Para recorrência automática via Asaas, use intervalos compatíveis com o Asaas:
7, 14, 30, 90, 180 ou 365 dias.


## Método no cadastro da assinatura

O método de pagamento e a recorrência agora são escolhidos ao criar a **assinatura/cobrança do cliente**, não no cadastro do plano.

Fluxo:
1. cadastre o plano com nome, valor e descrição;
2. crie a assinatura do cliente;
3. escolha Pix, crédito, débito ou boleto;
4. escolha se é recorrente;
5. se for recorrente, informe os dias entre cobranças.


## Status das cobranças

A aba **Assinaturas** agora mostra o status de cada cobrança em **Pagamentos recorrentes**:

- em aberto;
- pago;
- atrasado;
- cancelado/estornado, quando aplicável.

Foi adicionado o botão **Atualizar status**, que consulta o Asaas pela Edge Function `sync-payment-status`.

Também foi atualizada a função `payment-webhook` para atualizar automaticamente o status quando o Asaas enviar eventos de pagamento.


## Primeiro acesso completo

No primeiro login, além de trocar a senha, o usuário precisa preencher:

- nome do administrador;
- CPF do administrador;
- celular do administrador;
- nome da barbearia;
- CNPJ da barbearia;
- celular da barbearia.

Esses dados são salvos na tabela `barbershops`. Rode o `sql/schema.sql` atualizado antes de testar.


## WhatsApp das cobranças

Na aba **Assinaturas > Pagamentos recorrentes**, cada cobrança agora possui o botão **WhatsApp**.

Ao clicar:
- o sistema consulta a cobrança no Asaas;
- busca link de pagamento;
- busca boleto, quando existir;
- busca Pix copia e cola / QR Code Pix quando a cobrança for compatível;
- abre o WhatsApp com a mensagem pronta para o cliente.

O WhatsApp não permite anexar automaticamente imagem de QR Code via link `wa.me`, então o sistema envia o link e o Pix copia e cola no texto da mensagem.


## Mensagem padrão do WhatsApp

Na lista de cobranças, o botão de link foi substituído por **Enviar por WhatsApp**.

Mensagem gerada:
"Olá Cliente, este é o link/qrcode/boleto para pagamento do seu Plano no valor de R$ com vencimento em DD/MM/AAAA."

O sistema completa automaticamente:
- nome do cliente;
- tipo de envio: link, qrcode ou boleto;
- nome do plano;
- valor;
- vencimento;
- link de pagamento;
- Pix copia e cola, quando existir.


## Valores reais no WhatsApp

A mensagem de WhatsApp não usa mais textos genéricos como "Cliente", "Nome do Plano" ou "R$".

Ela só abre o WhatsApp quando consegue preencher:
- nome real do cliente;
- nome real do plano;
- valor real da cobrança;
- vencimento real;
- link, boleto ou Pix real da cobrança.

Caso algum dado esteja faltando, o sistema mostra um erro pedindo correção em vez de enviar uma mensagem incompleta.


## Botão Link substituído por WhatsApp

Na linha de assinatura/cobrança, o botão **Link** foi substituído por **Enviar por WhatsApp**.

Quando a assinatura já tiver uma cobrança gerada, o botão abre direto o WhatsApp do cliente com a mensagem pronta e os valores reais:
- cliente;
- plano;
- valor;
- vencimento;
- link/boleto/Pix.


## Cancelamento real no Asaas

Agora existem duas funções novas:

- `cancel-payment`: cancela uma cobrança específica no Asaas e marca como cancelada no NavalhaOS;
- `cancel-subscription`: cancela uma assinatura no Asaas e marca a assinatura/cobranças pendentes como canceladas no NavalhaOS.

Na tela de pagamentos, o botão **Cancelar cobrança** chama o Asaas antes de atualizar o status local.


## Assinatura do próprio sistema

A página inicial (`index.html`) agora possui uma área para o cliente assinar o NavalhaOS.

Gateway definido: **Asaas**.

Fluxo:
1. Cliente preenche dados do administrador, barbearia e senha.
2. O sistema cria usuário no Supabase.
3. O sistema cria a barbearia como `active = false` e `subscription_status = pending`.
4. A função `create-system-subscription` cria a assinatura no Asaas.
5. O cliente paga pelo link gerado.
6. O webhook `payment-webhook` recebe a confirmação e libera a barbearia:
   - `active = true`
   - `subscription_status = active`

Antes de testar:
- rode o `sql/schema.sql`;
- rode `CONFIGURAR_ASSINATURA_SISTEMA_WINDOWS.bat`;
- configure o webhook do Asaas apontando para `payment-webhook`.


## InfinitePay como gateway do sistema

A venda da assinatura do próprio NavalhaOS agora usa **InfinitePay Checkout**.

Fluxo:
1. Cliente preenche o formulário na página inicial.
2. O sistema cria usuário e barbearia pendente.
3. A função `create-system-subscription` cria um link de pagamento na InfinitePay.
4. O cliente paga no checkout da InfinitePay.
5. O webhook `payment-webhook` recebe o pagamento aprovado e libera a barbearia:
   - `active = true`
   - `subscription_status = active`

Configuração:
1. Rode o `sql/schema.sql`.
2. Rode `CONFIGURAR_INFINITEPAY_SISTEMA_WINDOWS.bat`.
3. Suba o ZIP na Vercel.

Observação:
A integração usa o Checkout da InfinitePay por link. A confirmação automática depende do webhook da InfinitePay.


## Planos e recorrência do próprio sistema

A página inicial agora mostra apenas os planos, sem exibir o nome do gateway:

- Mensal: R$ 49,90 — cobrança a cada 30 dias;
- Trimestral: 3x de R$ 44,90 — cobrança a cada 3 meses;
- Semestral: 6x de R$ 39,90 — cobrança a cada 6 meses;
- Anual: 12x de R$ 14,90 — cobrança a cada 12 meses.

Regras de acesso:
- ao pagar, a conta fica ativa até o fim do período contratado;
- após o fim do período, a conta continua ativa por 3 dias com alerta de renovação;
- se não pagar até o fim da tolerância, a barbearia é inativada;
- ao inativar, os dados não são apagados;
- quando pagar a renovação, o acesso volta automaticamente.

Funções:
- `create-system-subscription`: cria a primeira cobrança do plano escolhido;
- `payment-webhook`: libera o acesso quando o pagamento é confirmado;
- `process-system-subscriptions`: gera cobranças de renovação e bloqueia contas vencidas após a tolerância.

Para automação real de renovação, chame `process-system-subscriptions` diariamente por cron.
