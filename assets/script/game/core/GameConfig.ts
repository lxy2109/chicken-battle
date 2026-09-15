import { tableRow } from "./Config";

/** 策划数值与文本在配表加载后按需读取，不能在模块导入时缓存。 */
export function gameNumber(id: string): number {
    return tableRow("GameRule", id).value;
}

export function gameText(id: string, ...args: (string | number)[]): string {
    const text: string = tableRow("Language", id).zh;
    return text.replace(/\{(\d+)\}/g, (token, index) => args[Number(index)] == null ? token : String(args[Number(index)]));
}
