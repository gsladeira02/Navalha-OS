@echo off
chcp 65001 >nul
title Configurar Planos e Recorrencia NavalhaOS

echo.
echo ============================================
echo   CONFIGURAR PLANOS E RECORRENCIA DO NAVALHAOS
echo ============================================
echo.
echo Os planos da tela serao:
echo Mensal: R$ 49,90
echo Trimestral: 3x de R$ 44,90
echo Semestral: 6x de R$ 39,90
echo Anual: 12x de R$ 14,90
echo.

where supabase >nul 2>nul
if errorlevel 1 (
  echo ERRO: Supabase CLI nao encontrada.
  pause
  exit /b 1
)

set /p INF_HANDLE=Digite sua InfiniteTag/handle de pagamento: 
if "%INF_HANDLE%"=="" (
  echo ERRO: InfiniteTag vazia.
  pause
  exit /b 1
)

set /p PUBLIC_URL=URL publica do site. Ex: https://navalha-os.vercel.app : 

supabase link --project-ref rxyidpmzuvczevprqiqu

echo.
echo Salvando secrets...
supabase secrets set INFINITEPAY_HANDLE="%INF_HANDLE%"
supabase secrets set INFINITEPAY_CHECKOUT_URL="https://api.checkout.infinitepay.io/links"

if not "%PUBLIC_URL%"=="" (
  supabase secrets set NAVALHAOS_PUBLIC_URL="%PUBLIC_URL%"
)

echo.
echo Enviando funcoes...
supabase functions deploy create-system-subscription
supabase functions deploy payment-webhook
supabase functions deploy process-system-subscriptions
supabase functions deploy cancel-system-subscription

echo.
echo Pronto.
echo Agora rode o sql/schema.sql no Supabase e suba este ZIP na Vercel.
echo.
echo IMPORTANTE:
echo Para as renovacoes ficarem automaticas, agende uma chamada diaria para:
echo https://rxyidpmzuvczevprqiqu.supabase.co/functions/v1/process-system-subscriptions
echo.
pause
