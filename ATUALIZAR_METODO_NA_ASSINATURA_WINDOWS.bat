@echo off
chcp 65001 >nul
title Atualizar Metodo na Assinatura NavalhaOS

echo.
echo ============================================
echo   ATUALIZAR METODO NA ASSINATURA
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
supabase functions deploy create-recurring-payment

echo.
echo Pronto. Agora suba este ZIP na Vercel e rode o schema.sql no Supabase se ainda nao rodou a versao anterior.
echo.
pause
