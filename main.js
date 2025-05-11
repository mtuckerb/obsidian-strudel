const { Plugin, PluginSettingTab, Setting, MarkdownView, Notice } = require("obsidian");

module.exports = class StrudelReplPlugin extends Plugin {
    async onload() {
        await this.loadSettings();
        await this.loadStrudelDependencies();
        this.registerMarkdownCodeBlockProcessor('strudel', this.processStrudelBlock.bind(this));
        this.addSettingTab(new StrudelSettingTab(this.app, this));

        // Add a command to save REPL content
        this.addCommand({
            id: 'save-strudel-repl',
            name: 'Save Strudel REPL Content',
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "s" }],
            callback: () => this.saveActiveReplContent()
        });
        
        // Add a property to track the last update
        this.lastUpdate = {
            uuid: null,
            timestamp: 0,
            content: null
        };
    }

    async loadStrudelDependencies() {
        await loadExternalScript("https://unpkg.com/@strudel/repl@latest");
    }

    processStrudelBlock(source, el, ctx) {
        setTimeout(() => {
            const repl = document.createElement('strudel-editor');

            let uuid;
            let markedSource = source.trim();
            const existingUUID = source.match(/\/\* ([a-f0-9-]+) \*\//);
            if (existingUUID) {
                uuid = existingUUID[1];
            } else {
                uuid = this.generateUUID();
                markedSource = `/* ${uuid} */\n${source.trim()}`;
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView) {
                    const content = activeView.editor.getValue();
                    const codeBlockRegex = /```strudel\n([\s\S]*?)\n```/;
                    const updatedContent = content.replace(codeBlockRegex, (match, codeContent) => {
                        return `\`\`\`strudel\n/* ${uuid} */\n${codeContent.trim()}\n\`\`\``;
                    });
                    activeView.editor.setValue(updatedContent);
                }
            }
        
            repl.setAttribute('code', markedSource);
            repl.dataset.uuid = uuid;
            repl.dataset.sourcePath = ctx.sourcePath;

            // Create a save button
            const saveButton = document.createElement('button');
            saveButton.textContent = 'Save REPL Content';
            saveButton.addEventListener('click', () => this.saveReplContent(repl, uuid));

            // Append REPL and save button
            el.appendChild(repl);
            el.appendChild(saveButton);
        })
    }

    async saveReplContent(repl, uuid) {
        const newCode = repl.editor.code;
        if (!newCode) return;

        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;

        const content = activeView.editor.getValue();
        const codeBlocks = content.match(/```strudel\n[\s\S]*?\n```/g);
        
        let startPos = -1;
        let endPos = -1;
        let existingBlock = '';

        if (codeBlocks) {
            for (let i = 0; i < codeBlocks.length; i++) {
                if (codeBlocks[i].includes(`/* ${uuid} */`)) {
                    startPos = content.indexOf(codeBlocks[i]);
                    endPos = startPos + codeBlocks[i].length;
                    existingBlock = codeBlocks[i];
                    break;
                }
            }
        }

        if (startPos === -1 || endPos === -1) return;

        // Extract the existing UUID comment
        const uuidComment = existingBlock.match(/\/\* [a-f0-9-]+ \*\//)[0];

        // Remove any existing UUID comment from the new code
        const cleanNewCode = newCode.replace(/\/\* [a-f0-9-]+ \*\/\n?/, '');

        // Construct the updated code block
        const updatedCodeBlock = '```strudel\n' + uuidComment + '\n' + cleanNewCode.trim() + '\n```';

        // Create transaction for targeted update
        activeView.editor.transaction({
            changes: [{
                from: activeView.editor.offsetToPos(startPos),
                to: activeView.editor.offsetToPos(endPos),
                text: updatedCodeBlock
            }]
        });

        // Show a notification using the Notice class
        new Notice("Strudel REPL content saved");
    }

    saveActiveReplContent() {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!activeLeaf) return;

        const view = activeLeaf.view;
        if (!(view instanceof MarkdownView)) return;

        const replElements = view.contentEl.querySelectorAll('strudel-editor');
        if (replElements.length === 0) return;

        // If there's only one REPL, save it. If there are multiple, save the last one (assuming it's the active one)
        const activeRepl = replElements[replElements.length - 1];
        this.saveReplContent(activeRepl, activeRepl.dataset.uuid);
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