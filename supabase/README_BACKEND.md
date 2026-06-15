# Backend seguro para assinaturas e notas

Este pacote inclui Supabase Edge Functions para processar ações sensíveis no backend:

- `create-recurring-payment`: cria assinatura/cobrança recorrente no Asaas.
- `issue-invoice`: emite NFS-e via NFE.io ou cria pendência para adaptar outro provedor.
- `payment-webhook`: recebe webhooks do gateway e atualiza status dos pagamentos.

## Variáveis necessárias no Supabase

Configure em **Supabase > Edge Functions > Secrets**:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3
NFEIO_BASE_URL=https://api.nfe.io/v1
NFEIO_CITY_SERVICE_CODE=0107
PAYMENT_WEBHOOK_SECRET=uma_senha_para_webhook
```

Em produção, troque `ASAAS_BASE_URL` para:

```bash
https://www.asaas.com/api/v3
```

## Deploy das funções

Com Supabase CLI:

```bash
supabase functions deploy create-recurring-payment
supabase functions deploy issue-invoice
supabase functions deploy payment-webhook
```

## Observações fiscais

A emissão real de NFS-e depende dos dados fiscais da barbearia, código de serviço municipal, regime tributário e configuração do provedor fiscal. O arquivo `issue-invoice/index.ts` já deixa a estrutura pronta, mas pode precisar de ajustes conforme a cidade/provedor.
