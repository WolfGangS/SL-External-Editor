import * as vscode from "vscode";
import { TempWatcher } from "./tempWatcher";
import { Config, ConfigWatcher, getConfig } from "./config";
import { Output, OutputHandle } from "./output";
import { DefsDownloader, DownloadResult } from "./defsDownloader";
import { setupCommands } from "./commands";
import { WorkspaceFileTester } from "./workspaceFileTester";
import { SaveProcess } from "./saveProcess";
import { ErrorWatcher } from "./errorWatcher";
import { downloadPreProc, shouldRedownloadPreProc } from "./preProcRunner";

let output: Output | null = null;
let mainOutput: OutputHandle | null = null;
let extContext: vscode.ExtensionContext | null = null;

export function activate(context: vscode.ExtensionContext) {
	extContext = context;
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

	context.subscriptions.push(
		SaveProcess.Setup(mainOutput.getHandle("Save")),
	);

	context.subscriptions.push(
		ErrorWatcher.Setup(mainOutput.getHandle("Error")).start(),
	);

	mainOutput.appendLine("Activate");
	ConfigWatcher.Get()
		.hook(Config.Enabled, "enabledSetup", () => setup(context))
		.start();
	setup(context);
}

export function getOutput(name: string): OutputHandle | null {
	return mainOutput?.getHandle(name) || null;
}

export function getContext(): vscode.ExtensionContext | null {
	return extContext;
}

async function setup(context: vscode.ExtensionContext) {
	const enabled = getConfig<boolean>(Config.Enabled) || false;
	mainOutput?.appendLine("Enabled: " + (enabled ? "Yes" : "No"));
	TempWatcher.Get().setRunning(true);
	WorkspaceFileTester.Get().setRunning(true);
	if (!enabled) return;
	SaveProcess.Get().start();
	if (DefsDownloader.enabled()) {
		if (DefsDownloader.get().needsDownload()) {
			await DefsDownloader.get().download();
		}
		await DefsDownloader.get().updateLuauLSPConfig();
		await DefsDownloader.get().updateSeleneConfig();
		await DefsDownloader.get().updateSnippets();
		if (await shouldRedownloadPreProc(context)) {
			await downloadPreProc(context);
		}
	}
}

export function deactivate() {
	extContext = null;
	mainOutput?.appendLine("Deactivate");
}
