import { tableRow } from "./Config";

/** 策划数值与文本在配表加载后按需读取，不能在模块导入时缓存。 */
export function gameNumber(id: string): number {
    return tableRow("GameRule", id).value;
}

export function gameText(id: string, ...args: (string | number)[]): string {
    const text: string = tableRow("Language", id).zh;
    return formatText(text, args);
}

/** 新文案尚未进表时用 fallback，避免导表覆盖前直接抛错。 */
export function gameTextOr(id: string, fallback: string, ...args: (string | number)[]): string {
    try {
        return gameText(id, ...args);
    }
    catch {
        return formatText(fallback, args);
    }
}

function formatText(text: string, args: (string | number)[]) {
    return text.replace(/\{(\d+)\}/g, (token, index) => args[Number(index)] == null ? token : String(args[Number(index)]));
}
