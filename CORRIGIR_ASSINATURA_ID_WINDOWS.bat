@echo off
chcp 65001 >nul
title Corrigir Assinatura ID NavalhaOS

echo.
echo ============================================
echo   CORRIGIR BUSCA DE ASSINATURA
echo ============================================
echo.

where supabase >nul 2>nul
if errorlevel 1 (
  echo ERRO: Supabase CLI nao encontrada.
  pause
  exit /b 1
)

supabase link --project-ref rxyidpmzuvczevprqiqu
supabase functions deploy create-recurring-payment

echo.
echo Pronto. Agora atualize o site na Vercel com este pacote e teste novamente.
echo.
pause
