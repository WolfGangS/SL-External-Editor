import { OutputHandle } from "./output";
import * as vscode from "vscode";
import { TempWatcher, WatchedFile } from "./tempWatcher";

export function setup(output: OutputHandle) {
    vscode.workspace.onDidSaveTextDocument((e) => {
        output.appendLine("SAVE: " + e.fileName);
        const relative = vscode.workspace.asRelativePath(e.fileName);
        const tempFile = TempWatcher.Get().getMatchingTempFile(
            e.fileName,
            relative,
        );
        if (tempFile) {
            const root = tempFile.rootFile == e.fileName.toLowerCase();
            if (root) saveDataToTempFile(e.fileName, tempFile);
            else saveIncludeFile(tempFile);
        }
    });
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
