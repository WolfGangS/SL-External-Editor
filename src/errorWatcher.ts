import * as vscode from "vscode";
import { OutputHandle } from "./output";
import { TempWatcher, WatchedFile } from "./tempWatcher";
import {
    getPreparedCMD,
    getWorkingFolder,
    isPreProcConfigured,
    runCmd,
} from "./preProcRunner";

type FileError = [[string, number], string];

export class ErrorWatcher implements vscode.Disposable {
    private static instance: ErrorWatcher | null = null;
    private output: OutputHandle;
    private handle: vscode.Disposable | null = null;

    private constructor(output: OutputHandle) {
        this.output = output;
    }

    static Setup(output: OutputHandle) {
        if (this.instance) this.instance.dispose();
        this.instance = new ErrorWatcher(output);
        return this.instance;
    }

    private async change(log: WatchedFile) {
        if (!log.codeFile) {
            return;
        }
        if (!log.codeFile.rootFile) {
            return;
        }
        const data = await vscode.workspace.fs.readFile(log.uri);
        const text = new TextDecoder().decode(data);
        const lines = text.split("\n");

        const errors: FileError[] = [];
        const errorRegex = new RegExp("^:([0-9]+):\\s(.*)$");
        let lineNum = 0;
        for (const line of lines) {
            lineNum++;
            const trim = line.trim();
            if (trim.length == 0) continue;
            if (trim.startsWith("//")) continue;
            const match = trim.match(errorRegex);
            if (match) {
                errors.push([
                    [log.codeFile.rootFile.path, parseInt(match[1])],
                    match[2],
                ]);
            }
        }
        if (errors.length < 1) return;
        if (isPreProcConfigured(log.codeFile.rootFile)) {
            await this.displayMappedErrors(log.codeFile, errors);
        } else {
            this.displayErrors(log.codeFile, errors);
        }
    }

    private async displayMappedErrors(
        file: WatchedFile,
        errors: FileError[],
    ) {
        this.output.appendLine("TODO: REMAP ERRORS");
        const wf = getWorkingFolder();
        if (!wf) {
            this.errorPopup(errors);
            return;
        }
        const cmd = getPreparedCMD(file.uri, file.language, wf) +
            ` --remapLines "${errors.map((e) => e[0]).join(",")}"`;
        this.output.appendLine(cmd);
        try {
            const response = await runCmd(cmd);
            this.output.appendLine(response.stdout);
            const result = JSON.parse(response.stdout);
            if (result && result.success) {
                const lineMap: { [k: string]: [string, number] } = result.lines;
                for (const error of errors) {
                    const map = lineMap[error[0][1].toString()] ?? null;
                    if (!map) throw "Couldn't remap " + JSON.stringify(error);
                    error[0] = map;
                }
                console.log(errors);
                this.errorPopup(errors);
                return;
            }
        } catch (e) {
            vscode.window.showErrorMessage(`LINE REMAP FAIL: ${e}`);
        }
        this.errorPopup(errors);
    }

    private displayErrors(file: WatchedFile, errors: FileError[]) {
        this.output.appendLine("TODO: REMAP ERRORS");
        this.errorPopup(errors);
    }

    private errorPopup(errors: FileError[]) {
        for (const [file, error] of errors) {
            vscode.window.showErrorMessage(`[${file[0]}: ${file[1]}] ${error}`);
        }
    }

    start(): this {
        this.output.appendLine("Starting");
        this.handle = TempWatcher.Get().onDidChange(
            (file: WatchedFile) => {
                if (!file.isLog) return;
                this.change(file);
            },
        );
        return this;
    }

    stop() {
        if (this.handle) this.handle.dispose();
    }

    dispose() {
        this.stop();
    }
}
