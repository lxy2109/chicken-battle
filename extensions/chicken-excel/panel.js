const fs = require("fs");
const path = require("path");
const NAME = "chicken-excel";
module.exports = Editor.Panel.define({
    template: fs.readFileSync(path.join(__dirname, "panel.html"), "utf8"),
    style: fs.readFileSync(path.join(__dirname, "panel.css"), "utf8"),
    $: Object.fromEntries(["source", "destination", "choose", "open", "inspect", "save", "export", "dirty", "status", "sheets", "search", "add", "prev", "next", "count", "head", "rows", "empty", "confirm", "confirmText", "yes", "no"].map(id => [id, "#" + id])),
    async ready() {
        this.closed = false; this.data = []; this.handlers = []; this.page = 0; this.dirty = false;
        const bind = (id, event, fn) => { this.$[id].addEventListener(event, fn); this.handlers.push([id, event, fn]); };
        bind("yes", "click", () => this.resolveConfirm(true));
        bind("no", "click", () => this.resolveConfirm(false));
        bind("choose", "click", () => this.run(async () => {
            if (!await this.canDiscard()) return;
            const file = await Editor.Message.request(NAME, "choose-source");
            if (file && !this.closed) await this.load(file);
        }));
        bind("open", "click", () => this.run(async () => {
            if (this.dirty) { this.status("请先保存面板修改，再打开外部 Excel。", "warning"); return; }
            const result = await Editor.Message.request(NAME, "open-source", this.$.source.value);
            if (!this.closed) this.status(result.message, result.ok ? "" : "error");
        }));
        bind("inspect", "click", () => this.run(async () => {
            if (await this.canDiscard()) await this.load(this.$.source.value);
        }));
        bind("save", "click", () => this.run(async () => {
            this.status("正在校验并保存 Excel…", "");
            const result = await Editor.Message.request(NAME, "save-workbook", this.$.source.value, this.revision, this.data);
            if (!this.closed) this.accept(result);
        }));
        bind("export", "click", () => this.run(async () => {
            if (this.dirty) { this.status("有未保存修改，请先保存 Excel 再导出。", "warning"); return; }
            this.status("正在校验并导出…", "");
            const result = await Editor.Message.request(NAME, "export", this.$.source.value);
            if (!this.closed) this.status(result.warning || result.message, !result.ok ? "error" : result.warning ? "warning" : "success");
        }));
        bind("sheets", "change", () => { this.page = 0; this.$.search.value = ""; this.renderTable(); });
        bind("search", "input", () => { this.page = 0; this.renderTable(); });
        bind("prev", "click", () => { this.page--; this.renderTable(); });
        bind("next", "click", () => { this.page++; this.renderTable(); });
        bind("add", "click", () => {
            const sheet = this.currentSheet(); if (!sheet || this.busy) return;
            sheet.rows.push({ origin: null, values: Object.fromEntries(sheet.columns.map(c => [c.key, ""])), formulas: [] });
            this.$.search.value = ""; this.page = Math.floor((sheet.rows.length - 1) / 50);
            this.markDirty(); this.renderTable();
            this.$.rows.lastElementChild?.querySelector("textarea")?.focus();
        });
        await this.run(async () => {
            const info = await Editor.Message.request(NAME, "get-source");
            if (this.closed) return;
            this.$.destination.textContent = info.destination;
            this.$.source.value = info.source;
            await this.load(info.source);
        });
    },
    methods: {
        status(message, state) { this.$.status.textContent = message; this.$.status.dataset.state = state; },
        currentSheet() { return this.data.find(s => s.name === this.$.sheets.value); },
        markDirty() { this.dirty = true; this.$.dirty.textContent = "● 有未保存修改"; this.$.dirty.dataset.state = "dirty"; },
        async confirmAction(message) {
            if (this.confirmResolve) return false;
            this.$.confirmText.textContent = message; this.$.confirm.hidden = false;
            return new Promise(resolve => { this.confirmResolve = resolve; });
        },
        resolveConfirm(value) {
            const resolve = this.confirmResolve; this.confirmResolve = null;
            this.$.confirm.hidden = true; if (resolve) resolve(value);
        },
        canDiscard() { return !this.dirty || this.confirmAction("有未保存修改，是否放弃这些修改？"); },
        async run(action) {
            if (this.busy || this.closed || this.confirmResolve) return;
            this.busy = true; this.controls();
            try { await action(); }
            catch (error) { if (!this.closed) this.status(error.message || String(error), "error"); }
            finally { this.busy = false; if (!this.closed) this.controls(); }
        },
        controls() {
            for (const id of ["choose", "open", "inspect", "save", "export", "sheets", "search", "add", "prev", "next"])
                this.$[id].disabled = this.busy || (!["choose", "inspect"].includes(id) && !this.data.length);
            this.$.rows.querySelectorAll("textarea,button").forEach(el => { el.disabled = this.busy; });
            if (!this.busy) { this.$.prev.disabled = this.page <= 0; this.$.next.disabled = (this.page + 1) * 50 >= (this.filteredCount || 0); }
        },
        async load(file) {
            this.status("正在读取全部记录…", "");
            const result = await Editor.Message.request(NAME, "load-workbook", file);
            if (!this.closed) this.accept(result);
        },
        accept(result) {
            if (!result.ok) { this.status(result.message, "error"); return; }
            const selected = this.$.sheets.value || "Enemy";
            this.data = result.sheets; this.revision = result.revision; this.$.source.value = result.source;
            this.dirty = false; this.$.dirty.textContent = "已保存"; this.$.dirty.dataset.state = "";
            this.$.sheets.textContent = "";
            for (const sheet of this.data) {
                const option = this.$.sheets.ownerDocument.createElement("option");
                option.value = sheet.name; option.textContent = sheet.name; this.$.sheets.appendChild(option);
            }
            this.$.sheets.value = this.data.some(s => s.name === selected) ? selected : this.data[0].name;
            this.status(result.warning ? `数据已加载，请修正后保存：${result.warning}` : result.message, result.warning ? "warning" : "success");
            this.renderTable();
        },
        renderTable() {
            const sheet = this.currentSheet(); if (!sheet) return;
            const doc = this.$.head.ownerDocument;
            this.$.head.textContent = this.$.rows.textContent = "";
            const query = this.$.search.value.toLowerCase().trim();
            const filtered = sheet.rows.filter(r => Object.values(r.values).some(v => v.toLowerCase().includes(query)));
            this.filteredCount = filtered.length;
            this.page = Math.max(0, Math.min(this.page, Math.ceil(filtered.length / 50) - 1));
            this.$.empty.hidden = filtered.length > 0;
            this.$.count.textContent = `共 ${sheet.rows.length} 条 · 匹配 ${filtered.length} 条 · 第 ${this.page + 1}/${Math.max(1, Math.ceil(filtered.length / 50))} 页`;
            const header = doc.createElement("tr");
            for (const column of [...sheet.columns, { label: "操作", key: "", type: "" }]) {
                const cell = doc.createElement("th"), key = doc.createElement("small");
                cell.textContent = column.label + (column.required ? " *" : "");
                key.textContent = column.key ? `${column.key} · ${column.type}` : "";
                cell.appendChild(key); header.appendChild(cell);
            }
            this.$.head.appendChild(header);
            for (const row of filtered.slice(this.page * 50, (this.page + 1) * 50)) {
                const tr = doc.createElement("tr");
                for (const column of sheet.columns) {
                    const cell = doc.createElement("td"), input = doc.createElement("textarea");
                    input.value = row.values[column.key]; input.rows = 2;
                    input.setAttribute("aria-label", `${column.key} ${row.origin ?? "新增"}`);
                    input.readOnly = row.formulas.includes(column.key);
                    input.title = input.readOnly ? "公式结果（只读，请在 Excel 中修改公式）" : column.label;
                    input.addEventListener("input", () => { row.values[column.key] = input.value; this.markDirty(); });
                    if (column.key === "targetBattleSeconds") cell.className = "duration";
                    cell.appendChild(input); tr.appendChild(cell);
                }
                const cell = doc.createElement("td"), remove = doc.createElement("button");
                remove.textContent = "删除";
                remove.addEventListener("click", () => this.run(async () => {
                    if (!await this.confirmAction(`删除 ${sheet.name} 记录 ${row.values.id || "（未填 ID）"}？保存后才写入 Excel。`)) return;
                    sheet.rows.splice(sheet.rows.indexOf(row), 1); this.markDirty(); this.renderTable();
                }));
                cell.appendChild(remove); tr.appendChild(cell); this.$.rows.appendChild(tr);
            }
            this.controls();
        }
    },
    async beforeClose() {
        if (this.busy) { this.status("请等待当前操作完成或取消确认，再关闭面板。", "warning"); return false; }
        return await this.canDiscard();
    },
    close() {
        this.closed = true; this.resolveConfirm(false);
        for (const [id, event, fn] of this.handlers || []) this.$[id].removeEventListener(event, fn);
        this.handlers = [];
    }
});
