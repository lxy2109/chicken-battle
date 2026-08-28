/** 配表缓存。游戏里由 JsonUtil 灌入，node 验证直接读 json 文件。不含 cc。 */

const tables: Record<string, Record<string, any>> = {};

export function bindTables(all: Record<string, Record<string, any>>) {
    for (const name of Object.keys(all)) {
        tables[name] = all[name] || {};
    }
}

export function tableOf(name: string): Record<string, any> {
    const t = tables[name];
    if (!t) throw new Error(`缺少配置表 ${name}，请先导出 excel 并在加载时 bindTables`);
    return t;
}

export function tableRows(name: string): any[] {
    const t = tableOf(name);
    return Object.keys(t)
        .sort((a, b) => {
            const na = Number(a);
            const nb = Number(b);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.localeCompare(b);
        })
        .map(key => {
            const row = t[key];
            return row && row.id != null ? row : Object.assign({ id: isNaN(Number(key)) ? key : Number(key) }, row);
        });
}

export function tableRow(name: string, id: string | number): any {
    const t = tableOf(name);
    const row = t[String(id)];
    if (!row) throw new Error(`表 ${name} 没有 id=${id}`);
    return row;
}

export function hasTables(): boolean {
    return Object.keys(tables).length > 0;
}
