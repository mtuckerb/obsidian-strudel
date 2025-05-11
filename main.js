const { Plugin, PluginSettingTab, Setting, MarkdownView } = require("obsidian");

module.exports = class StrudelReplPlugin extends Plugin {
    async onload() {
        await this.loadSettings();
        await this.loadStrudelDependencies();
        this.registerMarkdownCodeBlockProcessor('strudel', await this.processStrudelBlock.bind(this));
        this.addSettingTab(new StrudelSettingTab(this.app, this));
    }

    async loadStrudelDependencies() {
        await loadExternalScript("https://unpkg.com/@strudel/repl@latest");
    }

    processStrudelBlock(source, el, ctx) {
        const repl = document.createElement('strudel-editor');
        const uuid = this.generateUUID();
        const markedSource = `/* ${uuid} */\n${source.trim()}`;
        
        repl.setAttribute('code', source.trim());
        repl.setAttribute('theme', this.settings.editorTheme); 
        repl.dataset.uuid = uuid;
        repl.dataset.sourcePath = ctx.sourcePath;
        
        // Use a debounce handler for efficient updates
        const updateHandler = this.debounce(() => {
            console.log("Update handler triggered");
            this.handleReplUpdate(repl, `\`\`\`strudel\n${source.trim()}\n\`\`\``);
        }, 500);

        // Listen for multiple possible events
        ['change', 'input', 'update', 'code-change'].forEach(eventName => {
            repl.addEventListener(eventName, () => {
                console.log(`Event '${eventName}' triggered`);
                updateHandler();
            });
        });

        // Add a MutationObserver to watch for attribute changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'code') {
                    console.log("Code attribute changed");
                    updateHandler();
                }
            });
        });

        observer.observe(repl, { attributes: true });

        el.appendChild(repl);

        // Log when the element is appended
        console.log("Strudel REPL element appended to the document");
    }

    async handleReplUpdate(editorElement, originalCode) {
        console.log("handleReplUpdate triggered");
        const uuid = editorElement.dataset.uuid;
        const newCode = editorElement.editor.code;
        window.editorElement = editorElement;
        if (!newCode) {
            console.log("No new code found in REPL");
            return;
        }

        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            console.log("No active view found");
            return;
        }

        // Find the original code block position
        const content = activeView.editor.getValue();
        const startPos = content.indexOf(originalCode);
        if (startPos === -1) {
            console.log("Original code not found in the document");
            return;
        }

        const endPos = startPos + originalCode.length;
        
        // Prepare the updated code block
        const updatedCodeBlock = '```strudel\n' + newCode + '\n```';

        // Create transaction for targeted update
        activeView.editor.transaction({
            changes: [{
                from: activeView.editor.offsetToPos(startPos),
                to: activeView.editor.offsetToPos(endPos),
                text: updatedCodeBlock
            }]
        });

        console.log("Document updated with new code from REPL");
    }

    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.floor(Math.random() * 16);
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, {
            editorTheme: 'dark'
        }, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class StrudelSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        let {containerEl} = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Editor Theme')
            .setDesc('Choose the theme for the Strudel editor')
            .addDropdown(dropdown => dropdown
                .addOption('dark', 'Dark')
                .addOption('light', 'Light')
                .setValue(this.plugin.settings.editorTheme)
                .onChange(async (value) => {
                    this.plugin.settings.editorTheme = value;
                    await this.plugin.saveSettings();
                }));
    }
}

async function loadExternalScript(url) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${url}"]`)) return resolve();
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}
