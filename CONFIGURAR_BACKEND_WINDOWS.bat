@echo off
chcp 65001 >nul
title Configurar Backend NavalhaOS

echo.
echo ============================================
echo   CONFIGURADOR DO BACKEND NAVALHAOS
echo ============================================
echo.
echo Este arquivo vai:
echo - linkar seu projeto Supabase
echo - salvar as secrets
echo - fazer deploy das Edge Functions
echo.
echo IMPORTANTE:
echo A service_role key eh sensivel. Cole apenas neste terminal.
echo.

where supabase >nul 2>nul
if errorlevel 1 (
  echo ERRO: Supabase CLI nao encontrada.
  echo Instale a Supabase CLI antes de continuar.
  echo.
  echo No Windows, voce pode instalar com Scoop:
  echo scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
  echo scoop install supabase
  echo.
  pause
  exit /b 1
)

set PROJECT_REF=rxyidpmzuvczevprqiqu
set SUPABASE_URL=https://rxyidpmzuvczevprqiqu.supabase.co
set WEBHOOK_SECRET=Navalha@OS2026

echo.
echo Fazendo login na Supabase...
supabase login

echo.
echo Linkando projeto: %PROJECT_REF%
supabase link --project-ref %PROJECT_REF%

echo.
set /p SERVICE_ROLE_KEY=cole aqui sua SUPABASE_SERVICE_ROLE_KEY e aperte Enter: 

echo.
echo Salvando secrets no Supabase...
supabase secrets set SUPABASE_URL="%SUPABASE_URL%"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="%SERVICE_ROLE_KEY%"
supabase secrets set PAYMENT_WEBHOOK_SECRET="%WEBHOOK_SECRET%"
supabase secrets set ASAAS_BASE_URL="https://sandbox.asaas.com/api/v3"
supabase secrets set NFEIO_BASE_URL="https://api.nfe.io/v1"
supabase secrets set NFEIO_CITY_SERVICE_CODE="0107"

echo.
echo Fazendo deploy das Edge Functions...
supabase functions deploy create-recurring-payment
supabase functions deploy issue-invoice
supabase functions deploy payment-webhook

echo.
echo Listando funcoes instaladas...
supabase functions list

echo.
echo ============================================
echo   CONFIGURACAO FINALIZADA
echo ============================================
echo.
echo URL do webhook Asaas:
echo %SUPABASE_URL%/functions/v1/payment-webhook
echo.
echo Header do webhook:
echo x-navalhaos-secret: %WEBHOOK_SECRET%
echo.
echo Agora entre no NavalhaOS > Assinaturas > Integracoes automaticas
echo e salve a chave Asaas/NFE.io de cada barbearia.
echo.
pause
