import * as vscode from "vscode";
import { OutputHandle } from "./output";
import { DefsDownloader } from "./defsDownloader";
import path from "path";

enum Commands {
    Enable = "sl-external-editor.enable",
    UpdateLSP = "sl-external-editor.updateLSP",
    SetupSelene = "sl-external-editor.setupSelene",
}

export function setupCommands(
    output: OutputHandle,
    context: vscode.ExtensionContext,
) {
    const commandEnable = vscode.commands.registerCommand(
        Commands.Enable,
        async () => {
            output.appendLine("Enable command");
            vscode.window.showInformationMessage(
                "SL External Editor Enabled for workspace",
            );
            await vscode.workspace.getConfiguration("secondLifeExternalEditor")
                .update("enabled", true);
            if (DefsDownloader.enabled()) {
                await DefsDownloader.get().download();
                await DefsDownloader.get().updateLuauLSPConfig(true);
                await DefsDownloader.get().updateSeleneConfig(true);
            }
        },
    );
    context.subscriptions.push(commandEnable);

    const commandUpdateLSP = vscode.commands.registerCommand(
        Commands.UpdateLSP,
        async () => {
            output.appendLine("Update LSP");
            await DefsDownloader.get().downloadLSPData(true);
            await DefsDownloader.get().updateLuauLSPConfig(true);
            vscode.window.showInformationMessage(
                "LUAU LSP Confgi updated",
            );
        },
    );
    context.subscriptions.push(commandUpdateLSP);

    const commandSetupSlene = vscode.commands.registerCommand(
        Commands.SetupSelene,
        async () => {
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
    );
    context.subscriptions.push(commandSetupSlene);
}
