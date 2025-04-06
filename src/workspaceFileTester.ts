import * as vscode from "vscode";
import {
    getFileExtensionsForLanguage,
    Language,
    TempWatcher,
    WatchedFile,
} from "./tempWatcher";
import { OutputHandle } from "./output";
import { Config, getConfig } from "./config";

async function testForFilesMatchingTemp(
    tempFile: WatchedFile,
): Promise<vscode.Uri[]> {
    const files = await getFilesMatchingTempFileLanguage(tempFile.language);
    return files.filter((file) => {
        const relative = vscode.workspace.asRelativePath(file);
        return TempWatcher.Get().fileNameMatchesWatchedFile(
            tempFile,
            file.path,
            file.path,
        );
    });
}

async function getFilesMatchingTempFileLanguage(lang: Language) {
    const exts = getFileExtensionsForLanguage(lang);
    let files: vscode.Uri[] = [];
    for (const ext of exts) {
        files = [
            ...files,
            ...(await vscode.workspace.findFiles(`**/*.${ext}`)),
        ];
    }
    return files;
}

export class WorkspaceFileTester implements vscode.Disposable {
    private static instance: WorkspaceFileTester | null = null;
    private watcher: vscode.Disposable | null = null;
    private output: OutputHandle;
    private constructor(output: OutputHandle) {
        this.output = output;
    }

    dispose() {
        this.stop();
    }

    static Setup(output: OutputHandle) {
        if (this.instance) this.instance.dispose();
        this.instance = new WorkspaceFileTester(output);
        return this.instance;
    }

    static Get(): WorkspaceFileTester {
        if (!this.instance) throw new Error("Get before setup");
        return this.instance;
    }

    setRunning(run: boolean) {
        if (run) this.start();
        else this.stop();
    }

    start() {
        this.stop();
        this.watcher = vscode.workspace.onDidOpenTextDocument(async (e) => {
            await this.newFileOpen(e);
        });
    }

    private async newFileOpen(doc: vscode.TextDocument) {
        this.output.appendLine(`Opened File: ${doc.fileName}`);
        const uri = vscode.Uri.file(doc.fileName);
        const temp = await getTempFileWithPause(uri);
        if (!temp) {
            this.output.appendLine(`No match for opened file ${doc.fileName}`);
        } else {
            const matching = await testForFilesMatchingTemp(temp);
            if (matching.length == 1) {
                const relative = vscode.workspace.asRelativePath(matching[0]);
                vscode.window.showInformationMessage(
                    `Found matching file: ${relative}`,
                );
                if (getConfig<boolean>(Config.AutoCloseTemp)) {
                    await vscode.window.showTextDocument(doc);
                    await vscode.commands.executeCommand(
                        "workbench.action.closeActiveEditor",
                    );
                }
                const matchDoc = await vscode.workspace.openTextDocument(
                    matching[0],
                );
                await vscode.window.showTextDocument(matchDoc);
            } else if (matching.length == 0) {
                vscode.window.showWarningMessage(
                    `Unable to find match for temp script: ${doc.fileName}`,
                );
            } else if (matching.length > 1) {
                temp.multiMatch = true;
                vscode.window.showErrorMessage(
                    `Found multiple matches for temp script: ${doc.fileName}`,
                );
            }
        }
    }

    stop() {
        if (this.watcher) {
            this.watcher.dispose();
            this.watcher = null;
        }
    }
}

async function getTempFileWithPause(
    uri: vscode.Uri,
): Promise<WatchedFile | null> {
    const temp = TempWatcher.Get().getWatchedFileForFileUri(uri);
    if (!temp) {
        await new Promise((res) => setTimeout(res, 1500));
        return TempWatcher.Get().getWatchedFileForFileUri(uri);
    }
    return temp;
}
