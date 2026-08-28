@echo off
chcp 65001 >nul
REM 插件源码已随本仓库提交，正常 clone 下来即可直接用，不需要执行本脚本。
REM 本脚本只在插件目录意外丢失时需要。
REM 升级插件版本：先手动删除 extensions\oops-plugin-hot-update 目录，再执行本脚本。
cd /d "%~dp0"
if not exist extensions md extensions
cd extensions

if exist oops-plugin-hot-update (
    echo 插件已存在，无需处理。
    exit /b 0
)

echo 未找到热更新插件，正在克隆...
git clone -b master https://gitee.com/dgflash/oops-plugin-hot-update.git
if errorlevel 1 (
    echo [失败] 克隆失败，请检查网络或 gitee 访问权限。
    exit /b 1
)
REM 去掉嵌套仓库，插件源码跟随主仓库一起做版本管理。
rmdir /s /q oops-plugin-hot-update\.git
