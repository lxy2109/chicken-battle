# 插件源码已随本仓库提交，正常 clone 下来即可直接用，不需要执行本脚本。
# 本脚本只在插件目录意外丢失时需要。
# 升级插件版本：先手动删除 extensions/oops-plugin-hot-update 目录，再执行本脚本。
set -e
cd "$(dirname "$0")"
mkdir -p extensions
cd extensions

if [ -d "oops-plugin-hot-update" ]; then
    echo "插件已存在，无需处理。"
    exit 0
fi

echo "未找到热更新插件，正在克隆..."
git clone -b master https://gitee.com/dgflash/oops-plugin-hot-update.git
# 去掉嵌套仓库，插件源码跟随主仓库一起做版本管理。
rm -rf oops-plugin-hot-update/.git
