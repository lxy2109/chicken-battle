/** 策划导表入口：校验后导出 Excel，不生成或覆盖策划原表。 */
require("./config-export.cjs").main().catch(error => { console.error(error.message); process.exitCode = 1; });
