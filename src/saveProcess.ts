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
                "Include file didn't have linked root... How?",
            );
        }
    }

    private async saveDataToTempFile(
        fileUri: vscode.Uri,
        tempFile: WatchedFile,
    ) {
        try {
            const text = await getTextToSave(fileUri, tempFile);

            const prefix: string[] = [];
            prefix.push(
                `${tempFile.comment} Saved: ${new Date().toUTCString()} UTC`,
            );
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
                prefix.push(`${tempFile.comment} SCRIPT_START`);
                prefix.push(``);
            }
            await vscode.workspace.fs.writeFile(
                tempFile.uri,
                new TextEncoder().encode(prefix.join("\n") + text),
            );
        } catch (e) {
            if (e instanceof PreProcError) {
                vscode.window.showErrorMessage(e.message);
            }
        }
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
        try {
            const result = await runPreProc(fileUri);
            if (result.success) {
                tempFile.includedFiles = result.files.map((f) =>
                    f.toLowerCase()
                );
                if (result.sourceMap) {
                    await vscode.workspace.fs.writeFile(
                        vscode.Uri.file(tempFile.uri.path + ".map"),
                        new TextEncoder().encode(
                            JSON.stringify(result.sourceMap),
                        ),
                    );
                }
                return result.text;
            }
            throw new PreProcError(result.errorMessage ?? "Pre Proc Failed");
        } catch (e) {
            if (e instanceof Error) {
                throw new PreProcError("Preproc failed", e);
            }
            throw new PreProcError(`Preproc failed\n${e}`);
        }
    } else {
        const data = await vscode.workspace.fs.readFile(fileUri);
        return new TextDecoder().decode(data);
    }
}

class PreProcError extends Error {
    private wrapped: Error | null = null;
    constructor(message: string | Error, error?: Error) {
        if (message instanceof Error) {
            error = message;
            message = error.message;
        } else if (error) {
            message += "\n" + error.message;
        }
        super(message);
        this.wrapped = error ?? null;
    }

    get stack(): string | undefined {
        return this.wrapped?.stack ?? super.stack;
    }
}
