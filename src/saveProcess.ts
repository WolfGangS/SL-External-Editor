import { OutputHandle } from "./output";
import * as vscode from "vscode";
import { TempWatcher, WatchedFile } from "./tempWatcher";
import { isPreProcConfigured, runPreProc } from "./preProcRunner";
import { Config, getConfig } from "./config";

export class SaveProcess implements vscode.Disposable {
    private static instance: SaveProcess | null = null;
    private handle: vscode.Disposable | null = null;
    private output: OutputHandle;

    private constructor(output: OutputHandle) {
        this.output = output;
    }

    static Setup(output: OutputHandle): SaveProcess {
        if (this.instance) this.instance.dispose();
        this.instance = new SaveProcess(output);
        return this.instance;
    }

    static Get(): SaveProcess {
        if (!this.instance) throw new Error("Get before Setup");
        return this.instance;
    }

    start(): this {
        this.stop();
        this.handle = vscode.workspace.onDidSaveTextDocument(async (e) => {
            this.process(e);
        });
        return this;
    }

    async process(doc: vscode.TextDocument) {
        this.output.appendLine("SAVE: " + doc.fileName);
        const relative = vscode.workspace.asRelativePath(doc.fileName);
        const tempFiles = TempWatcher.Get().getMatchingTempFiles(
            doc.uri,
            relative,
        );
        if (tempFiles.length == 1) {
            const tempFile = tempFiles[0];
            if (tempFile.multiMatch) {
                const resp = await vscode.window.showWarningMessage(
                    "There are multiple files that could match to this SL script! are you sure you want to save?",
                    "No",
                    "Yes",
                    "Yes and don't ask again",
                );
                switch (resp) {
                    case "Yes and don't ask again":
                        tempFile.rootFile = doc.uri;
                    case "Yes":
                        this.doSave(doc, tempFile);
                        break;
                    case "No":
                    default:
                        break;
                }
                return;
            } else this.doSave(doc, tempFile);
        } else if (tempFiles.length > 1) {
            vscode.window.showErrorMessage(
                "Found multiple matching temp files, not pushing content to SL",
            );
        }
    }

    private async doSave(doc: vscode.TextDocument, tempFile: WatchedFile) {
        const root =
            tempFile.rootFile?.path.toLowerCase() == doc.fileName.toLowerCase();
        if (root) this.saveDataToTempFile(doc.uri, tempFile);
        else this.saveIncludeFile(tempFile);
    }

    private async saveIncludeFile(tempFile: WatchedFile) {
        if (!getConfig<boolean>(Config.PreProcWatchIncludes)) return;
        if (tempFile.rootFile) {
            await this.saveDataToTempFile(tempFile.rootFile, tempFile);
        } else {
            vscode.window.showErrorMessage(
                "Include file didnt have linked root... How?",
            );
        }
    }

    private async saveDataToTempFile(
        fileUri: vscode.Uri,
        tempFile: WatchedFile,
    ) {
        const text = await getTextToSave(fileUri, tempFile);

        const prefix: string[] = [];
        for (const hint in tempFile.hints) {
            prefix.push(
                `${tempFile.comment} ${tempFile.hintPrefix}${hint} ${
                    tempFile.hints[hint]
                }`,
            );
        }
        if (prefix.length) {
            prefix.push(
                `${tempFile.comment} ============================ ${tempFile.comment}`,
            );
            prefix.unshift(
                `${tempFile.comment} ============================ ${tempFile.comment}`,
            );
            prefix.push(``);
        }
        await vscode.workspace.fs.writeFile(
            tempFile.uri,
            new TextEncoder().encode(prefix.join("\n") + text),
        );
    }

    stop() {
        if (this.handle) this.handle.dispose();
    }

    dispose() {
        this.stop();
    }
}

async function getTextToSave(
    fileUri: vscode.Uri,
    tempFile: WatchedFile,
): Promise<string> {
    if (isPreProcConfigured(fileUri)) {
        const result = await runPreProc(fileUri);
        tempFile.includedFiles = result.files.map((f) => f.toLowerCase());
        return result.text;
    } else {
        const data = await vscode.workspace.fs.readFile(fileUri);
        return new TextDecoder().decode(data);
    }
}
