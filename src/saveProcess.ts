import { OutputHandle } from "./output";
import * as vscode from "vscode";
import { TempWatcher, WatchedFile } from "./tempWatcher";

export function setup(output: OutputHandle) {
    vscode.workspace.onDidSaveTextDocument(async (e) => {
        output.appendLine("SAVE: " + e.fileName);
        const relative = vscode.workspace.asRelativePath(e.fileName);
        const tempFiles = TempWatcher.Get().getMatchingTempFiles(
            e.fileName,
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
                        tempFile.rootFile = e.fileName;
                    case "Yes":
                        doSave(e, tempFile);
                        break;
                    case "No":
                    default:
                        break;
                }
                return;
            } else doSave(e, tempFile);
        } else if (tempFiles.length > 1) {
            vscode.window.showErrorMessage(
                "Found multiple matching temp files, not pushing content to SL",
            );
        }
    });
}

async function doSave(doc: vscode.TextDocument, tempFile: WatchedFile) {
    const root = tempFile.rootFile == doc.fileName.toLowerCase();
    if (root) saveDataToTempFile(doc.fileName, tempFile);
    else saveIncludeFile(tempFile);
}

async function saveIncludeFile(tempFile: WatchedFile) {
    await saveDataToTempFile(tempFile.rootFile, tempFile);
}

async function saveDataToTempFile(fileName: string, tempFile: WatchedFile) {
    const data = await vscode.workspace.fs.readFile(vscode.Uri.file(fileName));
    const text = new TextDecoder().decode(data);
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
