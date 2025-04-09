import * as vscode from "vscode";
import { OutputHandle } from "./output";
import { DefsDownloader } from "./defsDownloader";
import path from "path";
import { getOutput } from "./extension";
import {
    downloadPreProc,
    getPreProcUrl,
    runPreProc,
    shouldRedownloadPreProc,
} from "./preProcRunner";
import { getVscodeLangFromLanguage } from "./tempWatcher";

enum Commands {
    Enable = "sl-external-editor.enable",
    UpdateLSP = "sl-external-editor.updateLSP",
    SetupSelene = "sl-external-editor.setupSelene",
    UpdateAll = "sl-external-editor.updateAll",
    UpdateSnippets = "sl-external-editor.updateSnippets",
    RunPreproc = "sl-external-editor.runPreProc",
    InstallPreproc = "sl-external-editor.installPreProc",
}

export function setupCommands(
    output: OutputHandle,
    context: vscode.ExtensionContext,
) {
    const commands: { [key in Commands]: () => void | Promise<void> } = {
        [Commands.Enable]: async function (): Promise<void> {
            output.appendLine("Enable command");
            vscode.window.showInformationMessage(
                "SL External Editor Enabled for workspace",
            );
            await vscode.workspace.getConfiguration("secondLifeExternalEditor")
                .update("enabled", true);
            if (DefsDownloader.enabled()) {
                await DefsDownloader.get().download();
                await DefsDownloader.get().updateLuauLSPConfig();
                await DefsDownloader.get().updateSeleneConfig();
                await DefsDownloader.get().updateSnippets();
            }
        },
        [Commands.UpdateLSP]: async function (): Promise<void> {
            output.appendLine("Update LSP");
            await DefsDownloader.get().downloadLSPData(true);
            await DefsDownloader.get().updateLuauLSPConfig(true);
            vscode.window.showInformationMessage(
                "LUAU LSP Config updated",
            );
        },
        [Commands.SetupSelene]: async function (): Promise<void> {
            output.appendLine("Selene Setup");
            const dl = await DefsDownloader.get().downloadSelene(true);
            const sel = await DefsDownloader.get().getDownloadedSelene();
            if (dl.length && sel.length) {
                const base = path.basename(dl[0]);
                vscode.window.showInformationMessage(
                    "Selene Standard Library downloaded",
                );
                DefsDownloader.get().updateSeleneConfig(true);
            } else {
                vscode.window.showWarningMessage(
                    "No Selene files downloaded",
                );
            }
        },
        [Commands.UpdateAll]: async function (): Promise<void> {
            await DefsDownloader.get().download(true);
            await DefsDownloader.get().updateLuauLSPConfig(true);
            await DefsDownloader.get().updateSeleneConfig(true);
            await DefsDownloader.get().updateSnippets(true);
            if (await shouldRedownloadPreProc(context)) {
                await downloadPreProc(context);
            }
        },
        [Commands.UpdateSnippets]: async function (): Promise<void> {
            await DefsDownloader.get().downloadSnippets(true);
            await DefsDownloader.get().updateSnippets(true);
        },
        [Commands.RunPreproc]: async function (): Promise<void> {
            if (!vscode.workspace.workspaceFolders) {
                vscode.window.showWarningMessage(
                    "VSCode is not open in a directory",
                );
                return;
            }

            const wf = vscode.workspace.workspaceFolders[0].uri;
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage(
                    "No active document",
                );
                return;
            }
            const output = getOutput("Exec");
            if (!output) {
                vscode.window.showErrorMessage("Cannot hook output");
                return;
            }
            const doc = editor.document;
            output.appendLine(doc.uri.path);

            try {
                const result = await runPreProc(doc.uri);
                if (result) {
                    const lang = getVscodeLangFromLanguage(result.language);
                    const newDoc = await vscode.workspace.openTextDocument({
                        language: lang,
                        content: result.text,
                    });
                    vscode.window.showTextDocument(newDoc, {
                        preview: true,
                    });
                } else {
                    vscode.window.showErrorMessage(
                        "Preproc failed to run, check output",
                    );
                }
            } catch (e) {
                vscode.window.showErrorMessage(
                    "Preproc failed to run, check output",
                );
                output.appendLine(`FAILED\n${e}`);
                output.show();
            }
        },
        [Commands.InstallPreproc]: async function (): Promise<void> {
            const url = getPreProcUrl();
            if (!url) {
                vscode.window.showErrorMessage(
                    "Unable to get download url for a preproc",
                );
                return;
            }
            const reply = await vscode.window
                .showInformationMessage(
                    `Sure you want to download: ${url[0]}`,
                    "Yes",
                    "No",
                );

            if (reply != "Yes") return;
            const reply2 = await vscode.window
                .showWarningMessage(
                    `You are downloading an executable are you REALLY REALLY SURE.`,
                    "Yes",
                    "No",
                );
            if (reply2 != "Yes") return;
            downloadPreProc(context);
        },
    };

    for (const [cmd, func] of Object.entries(commands)) {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                cmd,
                func,
            ),
        );
    }
}
