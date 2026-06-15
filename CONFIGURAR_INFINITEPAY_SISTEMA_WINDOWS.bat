@echo off
chcp 65001 >nul
title Configurar InfinitePay no NavalhaOS

echo.
echo ============================================
echo   CONFIGURAR INFINITEPAY NO NAVALHAOS
echo ============================================
echo.
echo Gateway definido para venda do proprio sistema: INFINITEPAY
echo.
echo Voce vai precisar da sua InfiniteTag/handle da InfinitePay.
echo Use sem o simbolo $.
echo Exemplo: se sua InfiniteTag for $navalhaos, digite navalhaos
echo.

where supabase >nul 2>nul
if errorlevel 1 (
  echo ERRO: Supabase CLI nao encontrada.
  pause
  exit /b 1
)

set /p INF_HANDLE=Digite sua InfiniteTag/handle da InfinitePay: 
if "%INF_HANDLE%"=="" (
  echo ERRO: InfiniteTag vazia.
  pause
  exit /b 1
)

set /p PLAN_PRICE=Valor mensal do plano. Pressione ENTER para usar 14.90: 
if "%PLAN_PRICE%"=="" set PLAN_PRICE=14.90

set /p PLAN_NAME=Nome do plano. Pressione ENTER para usar NavalhaOS Completo: 
if "%PLAN_NAME%"=="" set PLAN_NAME=NavalhaOS Completo

set /p PUBLIC_URL=URL publica do site. Ex: https://navalha-os.vercel.app : 

supabase link --project-ref rxyidpmzuvczevprqiqu

echo.
echo Salvando secrets...
supabase secrets set INFINITEPAY_HANDLE="%INF_HANDLE%"
supabase secrets set INFINITEPAY_CHECKOUT_URL="https://api.checkout.infinitepay.io/links"
supabase secrets set NAVALHAOS_PLAN_PRICE="%PLAN_PRICE%"
supabase secrets set NAVALHAOS_PLAN_NAME="%PLAN_NAME%"

if not "%PUBLIC_URL%"=="" (
  supabase secrets set NAVALHAOS_PUBLIC_URL="%PUBLIC_URL%"
)

echo.
echo Enviando funcoes...
supabase functions deploy create-system-subscription
supabase functions deploy payment-webhook

echo.
echo Pronto.
echo Agora rode o sql/schema.sql no Supabase e suba este ZIP na Vercel.
echo.
echo Webhook InfinitePay:
echo https://rxyidpmzuvczevprqiqu.supabase.co/functions/v1/payment-webhook?secret=SEU_SEGREDO
echo.
pause
