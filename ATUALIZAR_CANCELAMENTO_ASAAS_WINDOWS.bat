@echo off
chcp 65001 >nul
title Atualizar Cancelamento Asaas NavalhaOS

echo.
echo ============================================
echo   ATUALIZAR CANCELAMENTO NO ASAAS
echo ============================================
echo.

where supabase >nul 2>nul
if errorlevel 1 (
  echo ERRO: Supabase CLI nao encontrada.
  pause
  exit /b 1
)

supabase link --project-ref rxyidpmzuvczevprqiqu
supabase secrets set ASAAS_BASE_URL="https://api.asaas.com/v3"

echo.
echo Enviando funcoes de cancelamento...
supabase functions deploy cancel-payment
supabase functions deploy cancel-subscription

echo.
echo Reenviando funcoes relacionadas...
supabase functions deploy sync-payment-status
supabase functions deploy payment-webhook

echo.
echo Pronto. Agora suba este ZIP na Vercel e rode o schema.sql no Supabase.
echo.
pause
