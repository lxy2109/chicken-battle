# 插件源码已随本仓库提交，正常 clone 下来即可直接用，不需要执行本脚本。
# 本脚本只在两种情况下需要：插件目录意外丢失，或要重新安装依赖。
# 升级框架版本：先手动删除 extensions/oops-plugin-framework 目录，再执行本脚本。
set -e
cd "$(dirname "$0")"
mkdir -p extensions
cd extensions

if [ ! -d "oops-plugin-framework" ]; then
    echo "未找到框架插件，正在克隆..."
    git clone -b master https://gitee.com/dgflash/oops-plugin-framework.git
    # 去掉嵌套仓库，插件源码跟随主仓库一起做版本管理。
    rm -rf oops-plugin-framework/.git
fi

cd oops-plugin-framework
npm install
