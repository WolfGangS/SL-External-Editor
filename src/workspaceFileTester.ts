import * as vscode from "vscode";
import {
    getFileExtensionsForLanguage,
    getLanguageForFileExtension,
    Language,
    TempWatcher,
    WatchedFile,
} from "./tempWatcher";
import { OutputHandle } from "./output";
import { Config, getConfig } from "./config";
import path from "path";
import { cleanPathString } from "./util";
import { getContext } from "./extension";

async function testForFilesMatchingTemp(
    tempFile: WatchedFile,
): Promise<vscode.Uri[]> {
    const files = await getFilesMatchingTempFileLanguage(tempFile.language);
    return files.filter((file) => {
        const relative = vscode.workspace.asRelativePath(file);
        return TempWatcher.Get().silentFileNameMatchesWatchedFile(
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

    async start() {
        const boot = getContext()?.globalState.get<string>(state_open_on_boot);
        if (boot) {
            getContext()?.globalState.update(state_open_on_boot, undefined);
            try {
                const matchDoc = await vscode.workspace.openTextDocument(
                    boot,
                );
                await vscode.window.showTextDocument(matchDoc);
            } catch (_e) {
                vscode.window.showErrorMessage(
                    "Failed to open startup file from temp match",
                );
            }
        }
        this.stop();
        this.watcher = vscode.workspace.onDidOpenTextDocument(async (e) => {
            await this.newFileOpen(e);
        });
    }

    private async newFileOpen(doc: vscode.TextDocument) {
        // this.output.appendLine(`Opened File: ${doc.fileName}`);
        const uri = vscode.Uri.file(doc.fileName);
        const temp = await getTempFileWithPause(uri);
        if (!temp) {
            // this.output.appendLine(`No match for opened file ${doc.fileName}`);
            return;
        }
        if (!getConfig<boolean>(Config.Enabled)) {
            this.output.appendLine(
                "Not enabled in workspace, going straight to search",
            );
            await tryFindDocInProjectAndOpen(this.output, doc, temp);
            return;
        }
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
            await tryFindDocInProjectAndOpen(this.output, doc, temp);
        } else if (matching.length > 1) {
            temp.multiMatch = true;
            vscode.window.showErrorMessage(
                `Found multiple matches for temp script: ${doc.fileName}`,
            );
        }
    }

    stop() {
        if (this.watcher) {
            this.watcher.dispose();
            this.watcher = null;
        }
    }
}

const state_open_on_boot = "sl-ext-editor.open.on.boot";

async function tryFindDocInProjectAndOpen(
    output: OutputHandle,
    doc: vscode.TextDocument,
    tempFile: WatchedFile,
) {
    const projectDir = getConfig<string>(Config.DirProjects);
    if (!projectDir) return;
    const project = cleanPathString(tempFile.hints["project"] || "").split(
        path.sep,
    ).filter((p) => p.length);
    const name = cleanPathString(tempFile.scriptName).split(path.sep).filter(
        (p) => p.length,
    );

    const projectUri = vscode.Uri.file(projectDir);
    const paths = [...project, ...name];
    output.appendLine(
        `Searching for project file\n${projectDir}\n${paths.join(path.sep)}`,
    );
    let dir: vscode.Uri | null = vscode.Uri.file(projectDir);
    let openUri: vscode.Uri | null = null;
    try {
        while (paths.length > 1 && dir) {
            if (project.length == 0) {
                if (!openUri) openUri = dir;
            } else project.shift();
            const dirContent = await vscode.workspace.fs.readDirectory(dir);
            const match = (paths.shift() as string).toLowerCase();
            let newDir: vscode.Uri | null = null;
            for (const fd of dirContent) {
                if (fd[1] != vscode.FileType.Directory) continue;
                if (fd[0].toLowerCase() == match) {
                    newDir = vscode.Uri.joinPath(dir, fd[0]);
                    output.appendLine(newDir.path);
                    break;
                }
            }
            dir = newDir;
        }
        if (!dir) {
            output.appendLine("Matching external file failed to find dir");
            return;
        }
        if (!openUri) {
            openUri = dir;
        }
        const dirContent = await vscode.workspace.fs.readDirectory(dir);
        const match = (paths.shift() as string).toLowerCase();
        let file: vscode.Uri | null = null;
        for (const fd of dirContent) {
            if (fd[1] != vscode.FileType.File) continue;
            const name = fd[0].toLowerCase();
            const parts = name.split(".");
            parts.pop();
            const nameSansExt = parts.join(".");
            if (name == match || nameSansExt == match) {
                file = vscode.Uri.joinPath(dir, fd[0]);
                break;
            }
        }

        if (!file) {
            output.appendLine("Matching external file failed to find file");
            return;
        }
        output.appendLine("Matched with external file: " + file.path);
        const ext = file.path.split(".").pop() || "";
        const lang = getLanguageForFileExtension(ext);
        if (lang == tempFile.language) {
            output.appendLine(
                "Matched file OK",
            );
            output.appendLine(
                "Opening " + openUri.path,
            );
            getContext()?.globalState.update(state_open_on_boot, file.path);
            vscode.commands.executeCommand("vscode.openFolder", openUri, {
                forceNewWindow: true,
            });
            vscode.window.showInformationMessage(
                "Matched file OK",
            );
        } else {
            output.appendLine(
                "Matched external file didn't have same language",
            );
        }
    } catch (_e) {
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
