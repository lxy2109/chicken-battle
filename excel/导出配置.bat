@echo off
chcp 65001 >nul
cd /d "%~dp0.."
node tools/excel-kit.cjs
if errorlevel 1 (
  echo.
  echo 导出失败，请根据上方工作表和单元格提示修正。
) else (
  echo.
  echo 导出成功。请回 Creator 刷新资源并重新预览。
)
pause
