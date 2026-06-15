@echo off
chcp 65001 >nul
title Configurar Assinatura do NavalhaOS

echo.
echo ============================================
echo   CONFIGURAR ASSINATURA DO PROPRIO SISTEMA
echo ============================================
echo.
echo Gateway definido: ASAAS
echo.
echo Este script configura a chave Asaas que o NavalhaOS usa para vender
echo a assinatura do proprio sistema na pagina inicial.
echo.

where supabase >nul 2>nul
if errorlevel 1 (
  echo ERRO: Supabase CLI nao encontrada.
  pause
  exit /b 1
)

set /p ASAAS_KEY=Cole a chave Asaas que recebera as assinaturas do NavalhaOS: 
if "%ASAAS_KEY%"=="" (
  echo ERRO: chave Asaas vazia.
  pause
  exit /b 1
)

set /p PLAN_PRICE=Valor mensal do plano. Pressione ENTER para usar 14.90: 
if "%PLAN_PRICE%"=="" set PLAN_PRICE=14.90

set /p PLAN_NAME=Nome do plano. Pressione ENTER para usar NavalhaOS Completo: 
if "%PLAN_NAME%"=="" set PLAN_NAME=NavalhaOS Completo

supabase link --project-ref rxyidpmzuvczevprqiqu

echo.
echo Salvando secrets...
supabase secrets set ASAAS_BASE_URL="https://api.asaas.com/v3"
supabase secrets set NAVALHAOS_ASAAS_API_KEY="%ASAAS_KEY%"
supabase secrets set NAVALHAOS_PLAN_PRICE="%PLAN_PRICE%"
supabase secrets set NAVALHAOS_PLAN_NAME="%PLAN_NAME%"

echo.
echo Enviando funcoes...
supabase functions deploy create-system-subscription
supabase functions deploy payment-webhook

echo.
echo Pronto.
echo Agora rode o sql/schema.sql no Supabase e suba este ZIP na Vercel.
echo.
pause
