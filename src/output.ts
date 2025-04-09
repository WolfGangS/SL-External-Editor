import * as vscode from "vscode";

export type OutputHandle = {
    append: (txt: string) => void;
    appendLine: (txt: string) => void;
    getHandle: (prefix: string) => OutputHandle;
    show: () => void;
};

export class Output implements vscode.Disposable {
    private output: vscode.OutputChannel;
    private disposed: boolean = false;
    constructor(name: string) {
        this.output = vscode.window.createOutputChannel(name);
        if (process.env.VSCODE_DEBUG_MODE === "true") {
            this.output.show();
        }
    }

    getHandle(prefix: string): OutputHandle {
        let sameLine = false;
        return {
            append: (txt: string) => {
                this.append(sameLine ? "" : prefix, txt);
                sameLine = true;
            },
            appendLine: (txt: string) => {
                this.appendLine(sameLine ? "" : prefix, txt);
                sameLine = false;
            },
            getHandle: (subPrefix: string) =>
                this.getHandle(`${prefix}>${subPrefix}`),
            show: () => {
                this.output.show();
            },
        };
    }

    append(prefix: string, text: string) {
        if (this.disposed) return;
        if (prefix.length) prefix = `[${prefix}]: `;
        this.output.append(`${prefix}${text}`);
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

export function stubOutput(): OutputHandle {
    return {
        append: function (txt: string): void {},
        appendLine: function (txt: string): void {},
        getHandle: function (prefix: string): OutputHandle {
            return stubOutput();
        },
        show: () => {},
    };
}
