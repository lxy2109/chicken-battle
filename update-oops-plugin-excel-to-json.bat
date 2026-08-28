@echo off
chcp 65001 >nul
REM 插件源码已随本仓库提交，正常 clone 下来即可直接用，不需要执行本脚本。
REM 本脚本只在两种情况下需要：插件目录意外丢失，或要重新安装依赖。
REM 升级插件版本：先手动删除 extensions\oops-plugin-excel-to-json 目录，再执行本脚本。
cd /d "%~dp0"
if not exist extensions md extensions
cd extensions

if exist oops-plugin-excel-to-json goto install

echo 未找到转表插件，正在克隆...
git clone -b master https://gitee.com/dgflash/oops-plugin-excel-to-json.git
if errorlevel 1 (
    echo [失败] 克隆失败，请检查网络或 gitee 访问权限。
    exit /b 1
)
REM 去掉嵌套仓库，插件源码跟随主仓库一起做版本管理。
rmdir /s /q oops-plugin-excel-to-json\.git

:install
cd oops-plugin-excel-to-json
npm install
