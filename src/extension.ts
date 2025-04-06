import * as vscode from "vscode";
import path from "path";
import { TempWatcher } from "./tempWatcher";
import { Config, ConfigWatcher, getConfig } from "./config";
import { Output, OutputHandle } from "./output";
import { DefsDownloader, DownloadResult } from "./defsDownloader";
import { setupCommands } from "./commands";
import { WorkspaceFileTester } from "./workspaceFileTester";

let output: Output | null = null;
let mainOutput: OutputHandle | null = null;
let downloader: DefsDownloader | null = null;

export function activate(context: vscode.ExtensionContext) {
	output = new Output("SL External Editor");
	mainOutput = output.getHandle("SL Ext");

	DefsDownloader.setup(
		mainOutput.getHandle("Downloader"),
		context,
	);

	context.subscriptions.push(
		TempWatcher.Setup(mainOutput.getHandle("Temp Watcher")),
	);
	context.subscriptions.push(output);
	setupCommands(mainOutput.getHandle("Commands"), context);
	context.subscriptions.push(
		ConfigWatcher.Setup(mainOutput.getHandle("Config Watcher")),
	);
	context.subscriptions.push(
		WorkspaceFileTester.Setup(mainOutput.getHandle("Workspace")),
	);

	mainOutput.appendLine("Activate");
	ConfigWatcher.Get()
		.hook(Config.Enabled, "enabledSetup", () => setup(context))
		.start();
	setup(context);
}

async function setup(context: vscode.ExtensionContext) {
	const enabled = getConfig<boolean>(Config.Enabled) || false;
	mainOutput?.appendLine("Enabled: " + (enabled ? "Yes" : "No"));
	TempWatcher.Get().setRunning(enabled);
	WorkspaceFileTester.Get().setRunning(enabled);
	if (enabled && vscode.extensions.getExtension("johnnymorganz.luau-lsp")) {
		const result = await DefsDownloader.get().download();
		if (result.lsp) {
			await DefsDownloader.get().updateLuauLSPConfig(result.lsp);
		}
		if (result.selene) {
			await DefsDownloader.get().updateSeleneConfig(result.selene);
		}
	}
}

export function deactivate() {
	mainOutput?.appendLine("Deactivate");
}
