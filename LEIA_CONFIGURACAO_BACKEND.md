# Configuração rápida do backend no Windows

## Como usar

1. Extraia este ZIP.
2. Entre na pasta `navalhaos_layout_refinado_src`.
3. Dê dois cliques no arquivo:

```txt
CONFIGURAR_BACKEND_WINDOWS.bat
```

4. Quando pedir, cole sua `SUPABASE_SERVICE_ROLE_KEY`.
5. Aguarde o script finalizar.

## O que ele faz

- faz login na Supabase CLI;
- linka o projeto `rxyidpmzuvczevprqiqu`;
- salva as secrets necessárias;
- faz deploy das funções:
  - `create-recurring-payment`
  - `issue-invoice`
  - `payment-webhook`

## Depois disso

Configure o webhook no Asaas com:

```txt
https://rxyidpmzuvczevprqiqu.supabase.co/functions/v1/payment-webhook
```

Header:

```txt
x-navalhaos-secret: Navalha@OS2026
```

Depois entre no NavalhaOS:

```txt
Assinaturas > Integrações automáticas
```

E salve a chave Asaas/NFE.io de cada barbearia.
