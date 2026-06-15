@echo off
chcp 65001 >nul
title Corrigir Asaas Produção NavalhaOS

echo.
echo ============================================
echo   CORRIGIR URL ASAAS PARA PRODUCAO
echo ============================================
echo.
echo Sua chave Asaas começa com aact_prod, então o backend deve usar a API de PRODUCAO.
echo.

where supabase >nul 2>nul
if errorlevel 1 (
  echo ERRO: Supabase CLI nao encontrada.
  pause
  exit /b 1
)

set PROJECT_REF=rxyidpmzuvczevprqiqu

echo.
echo Linkando projeto, se necessario...
supabase link --project-ref %PROJECT_REF%

echo.
echo Salvando URL de producao do Asaas...
supabase secrets set ASAAS_BASE_URL="https://api.asaas.com/v3"

echo.
echo Reenviando funcao de cobranca...
supabase functions deploy create-recurring-payment

echo.
echo Pronto. Volte ao NavalhaOS e tente Gerar cobranca novamente.
echo.
pause
