# 插件源码已随本仓库提交，正常 clone 下来即可直接用，不需要执行本脚本。
# 本脚本只在两种情况下需要：插件目录意外丢失，或要重新安装依赖。
# 升级插件版本：先手动删除 extensions/oops-plugin-excel-to-json 目录，再执行本脚本。
set -e
cd "$(dirname "$0")"
mkdir -p extensions
cd extensions

if [ ! -d "oops-plugin-excel-to-json" ]; then
    echo "未找到转表插件，正在克隆..."
    git clone -b master https://gitee.com/dgflash/oops-plugin-excel-to-json.git
    # 去掉嵌套仓库，插件源码跟随主仓库一起做版本管理。
    rm -rf oops-plugin-excel-to-json/.git
fi

cd oops-plugin-excel-to-json
npm install
