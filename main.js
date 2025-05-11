const { Plugin, PluginSettingTab, Setting, MarkdownView, Notice } = require("obsidian");

module.exports = class StrudelReplPlugin extends Plugin {
    constructor() {
        super(...arguments);
        this.activeRepls = new Map();
    }
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

        this.registerEvent(
            this.app.workspace.on('layout-change', async () => {
                const activeLeaf = this.app.workspace.activeLeaf;
                if (!activeLeaf || !(activeLeaf.view instanceof MarkdownView)) {
                    await this.stopAllMusic();
                }
            })
        );
    }

    async onunload() {
        await this.stopAllMusic();
        // Additional cleanup
        for (const [id, repl] of this.activeRepls) {
            if (repl.dispose) {
                try {
                    await repl.dispose();
                } catch (error) {
                    console.error('Error disposing REPL:', error);
                }
            }
        }
        this.activeRepls.clear();
    }

    async loadStrudelDependencies() {
        await loadExternalScript("https://unpkg.com/@strudel/repl@latest");
    }

    processStrudelBlock(source, el, ctx) {
        setTimeout(async () => {
            // Stop any existing REPL in this element
            const existingReplId = el.querySelector('.strudel-repl-container')?.id;
            if (existingReplId) {
                await this.stopRepl(existingReplId);
            }

            el.innerHTML = '';

            const replContainer = document.createElement('div');
            replContainer.className = 'strudel-repl-container';
            
            let uuid;
            let markedSource = source.trim();
            const existingUUID = source.match(/\/\* ([a-f0-9-]+) \*\//);
            if (existingUUID) {
                uuid = existingUUID[1];
            } else {
                uuid = this.generateUUID();
                markedSource = `/* ${uuid} */\n${source.trim()}`;
                this.updateSourceWithUUID(ctx, uuid);
            }

            // Create a unique ID for this REPL instance
            const replId = `strudel-repl-${uuid}`;
            replContainer.id = replId;

            // Use the Strudel REPL library's method to create the REPL (if available)
            if (window.StrudelRepl && typeof window.StrudelRepl.create === 'function') {
                try {
                    const repl = await window.StrudelRepl.create(replContainer, {
                        code: markedSource,
                    });
                    replContainer.replInstance = repl;
                    this.activeRepls.set(replId, repl);
                } catch (error) {
                    console.error('Error creating Strudel REPL:', error);
                }
            } else {
                const repl = document.createElement('strudel-editor');
                repl.setAttribute('code', markedSource);
                replContainer.appendChild(repl);
                this.activeRepls.set(replId, repl);
            }

            replContainer.dataset.uuid = uuid;
            replContainer.dataset.sourcePath = ctx.sourcePath;

            // Create a save button
            const saveButton = document.createElement('button');
            saveButton.textContent = 'Save REPL Content';
            saveButton.addEventListener('click', () => this.saveReplContent(replContainer, uuid));

            // Append REPL container and save button
            el.appendChild(replContainer);
            el.appendChild(saveButton);
        }, 0);
    }

    async saveReplContent(replContainer, uuid) {
        let newCode;
        if (replContainer.replInstance) {
            newCode = replContainer.replInstance.getCode();
        } else {
            const repl = replContainer.querySelector('strudel-editor');
            newCode = repl.editor.code;
        }
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

        const replContainers = view.contentEl.querySelectorAll('.strudel-repl-container');
        if (replContainers.length === 0) return;

        // If there's only one REPL, save it. If there are multiple, save the last one (assuming it's the active one)
        const activeReplContainer = replContainers[replContainers.length - 1];
        this.saveReplContent(activeReplContainer, activeReplContainer.dataset.uuid);
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

    updateSourceWithUUID(ctx, uuid) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;

        const editor = activeView.editor;
        const content = editor.getValue();
        const lines = content.split('\n');
        
        // Find the specific code block
        let startLine = parseInt(ctx.sourcePath.split(':')[1]) - 1;
        let endLine = startLine;
        
        // Find the start of the code block
        while (startLine > 0 && !lines[startLine].trim().startsWith('```strudel')) {
            startLine--;
        }
        
        // Find the end of the code block
        while (endLine < lines.length && !lines[endLine].trim().startsWith('```')) {
            endLine++;
        }
        
        // Insert the UUID comment right after the ```strudel line
        lines.splice(startLine + 1, 0, `/* ${uuid} */`);
        
        const updatedContent = lines.join('\n');
        editor.setValue(updatedContent);
    }

    async stopRepl(replId) {
        const repl = this.activeRepls.get(replId);
        if (repl) {
            try {
                if (repl.stop) {
                    await repl.stop();
                } else if (repl.editor && repl.editor.stop) {
                    await repl.editor.stop();
                }
                // Additional cleanup
                if (repl.dispose) {
                    await repl.dispose();
                }
            } catch (error) {
                console.error('Error stopping REPL:', error);
            } finally {
                this.activeRepls.delete(replId);
            }
        }
    }

    async stopAllMusic() {
        for (const [id, repl] of this.activeRepls) {
            await this.stopRepl(id);
        }
        this.activeRepls.clear();
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