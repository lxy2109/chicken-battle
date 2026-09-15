const fs = require("fs");
const path = require("path");
const NAME = "chicken-excel";
module.exports = Editor.Panel.define({
    template: fs.readFileSync(path.join(__dirname, "panel.html"), "utf8"),
    style: fs.readFileSync(path.join(__dirname, "panel.css"), "utf8"),
    $: Object.fromEntries(["source", "destination", "choose", "open", "inspect", "export", "status", "sheets", "count", "head", "rows", "empty"].map(id => [id, "#" + id])),
    async ready() {
        this.closed = false;
        this.data = [];
        this.handlers = [];
        const bind = (id, event, fn) => { this.$[id].addEventListener(event, fn); this.handlers.push([id, event, fn]); };
        bind("choose", "click", () => this.run(async () => {
            const file = await Editor.Message.request(NAME, "choose-source");
            if (!file || this.closed) return;
            this.$.source.value = file;
            this.clearPreview();
            this.status("已选择文件。请点击校验预览。", "");
        }));
        bind("open", "click", () => this.run(async () => {
            const result = await Editor.Message.request(NAME, "open-source", this.$.source.value);
            if (!this.closed) this.status(result.message, result.ok ? "" : "error");
        }));
        bind("inspect", "click", () => this.process(false));
        bind("export", "click", () => this.process(true));
        bind("sheets", "change", () => this.renderTable());
        await this.run(async () => {
            const info = await Editor.Message.request(NAME, "get-source");
            if (this.closed) return;
            this.$.source.value = info.source;
            this.$.destination.textContent = info.destination;
        });
        if (!this.closed) await this.process(false);
    },
    methods: {
        status(message, state) { this.$.status.textContent = message; this.$.status.dataset.state = state; },
        async run(action) {
            if (this.busy || this.closed) return;
            this.busy = true;
            for (const id of ["choose", "open", "inspect", "export"]) this.$[id].disabled = true;
            try { await action(); }
            catch (error) { if (!this.closed) this.status(error.message || String(error), "error"); }
            finally {
                this.busy = false;
                if (!this.closed) for (const id of ["choose", "open", "inspect", "export"]) this.$[id].disabled = false;
            }
        },
        async process(write) {
            await this.run(async () => {
                this.clearPreview();
                this.status(write ? "正在校验并导出，完成后刷新资源…" : "正在校验 Excel…", "");
                const result = await Editor.Message.request(NAME, write ? "export" : "inspect", this.$.source.value);
                if (this.closed) return;
                if (!result.ok) { this.status(result.message, "error"); return; }
                this.status(result.warning || result.message, result.warning ? "warning" : "success");
                this.data = result.sheets;
                for (const sheet of this.data) {
                    const option = this.$.sheets.ownerDocument.createElement("option");
                    option.value = sheet.name;
                    option.textContent = `${sheet.name} · ${sheet.count} 条`;
                    this.$.sheets.appendChild(option);
                }
                this.$.sheets.disabled = false;
                this.$.sheets.value = this.data.some(s => s.name === "Enemy") ? "Enemy" : this.data[0]?.name || "";
                this.renderTable();
            });
        },
        clearPreview() {
            this.data = [];
            for (const id of ["sheets", "head", "rows", "count"]) this.$[id].textContent = "";
            this.$.sheets.disabled = true;
            this.$.empty.hidden = false;
        },
        renderTable() {
            const sheet = this.data.find(s => s.name === this.$.sheets.value);
            if (!sheet) return;
            const doc = this.$.head.ownerDocument;
            this.$.head.textContent = this.$.rows.textContent = "";
            this.$.empty.hidden = true;
            this.$.count.textContent = `共 ${sheet.count} 条${sheet.count > sheet.rows.length ? `，预览前 ${sheet.rows.length} 条` : ""}`;
            const header = doc.createElement("tr");
            for (const column of sheet.columns) {
                const cell = doc.createElement("th"), key = doc.createElement("small");
                cell.textContent = column.label;
                key.textContent = `${column.key} · ${column.type}`;
                cell.appendChild(key); header.appendChild(cell);
            }
            this.$.head.appendChild(header);
            for (const row of sheet.rows) {
                const tr = doc.createElement("tr");
                for (const column of sheet.columns) {
                    const cell = doc.createElement("td"), value = row[column.key];
                    // 文案是数据，不作为 HTML 执行。
                    cell.textContent = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
                    if (column.key === "targetBattleSeconds") cell.className = "duration";
                    tr.appendChild(cell);
                }
                this.$.rows.appendChild(tr);
            }
        }
    },
    close() {
        this.closed = true;
        for (const [id, event, fn] of this.handlers || []) this.$[id].removeEventListener(event, fn);
        this.handlers = [];
    }
});
