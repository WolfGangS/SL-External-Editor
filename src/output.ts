import * as vscode from "vscode";

export type OutputHandle = {
    append: (txt: string) => void;
    appendLine: (txt: string) => void;
    getHandle: (prefix: string) => OutputHandle;
};

export class Output implements vscode.Disposable {
    private output: vscode.OutputChannel;
    private disposed: boolean = false;
    constructor(name: string) {
        this.output = vscode.window.createOutputChannel(name);
    }

    getHandle(prefix: string): OutputHandle {
        return {
            append: (txt: string) => this.append(prefix, txt),
            appendLine: (txt: string) => this.appendLine(prefix, txt),
            getHandle: (subPrefix: string) =>
                this.getHandle(`${prefix}>${subPrefix}`),
        };
    }

    append(prefix: string, text: string) {
        if (this.disposed) return;
        this.output.append(`[${prefix}]: ${text}`);
    }

    appendLine(prefix: string, text: string) {
        if (this.disposed) return;
        this.output.appendLine(`[${prefix}]: ${text}`);
    }

    dispose() {
        this.disposed = true;
        this.output.dispose();
    }
}
