@echo off
chcp 65001 >nul
title Atualizar Status de Cobrancas NavalhaOS

echo.
echo ============================================
echo   ATUALIZAR STATUS DE COBRANCAS
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
echo Enviando funcoes atualizadas...
supabase functions deploy create-recurring-payment
supabase functions deploy sync-payment-status
supabase functions deploy payment-webhook

echo.
echo Pronto. Agora suba este ZIP na Vercel e rode o schema.sql no Supabase.
echo.
pause
