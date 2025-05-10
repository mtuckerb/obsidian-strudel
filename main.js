import { MarkdownView, Plugin } from "obsidian";
import * as strudelPlugin from "./strudel-plugin";

export default class StrudelReplPlugin extends Plugin {
    onload() {
        this.registerMarkdownCodeBlockProcessor("strudel", (source: string) => {
            // Remove leading/trailing whitespace
            const cleanedSource = source.trim();
            
            // Generate the REPL element with the code inside
            return `<script src="https://unpkg.com/@strudel/repl@latest"></script>
            <strudel-editor>
            ${cleanedSource}
            </strudel-editor>`;
        });
    }

    onunload() {
        // Cleanup if needed
    }
}

export function activate(plugin: StrudelReplPlugin) {}
