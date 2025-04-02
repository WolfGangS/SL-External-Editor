import * as vscode from "vscode";
import path from "path";
import { TempWatcher } from "./tempWatcher";
import { Config, ConfigWatcher, getConfig } from "./config";
import { Output, OutputHandle } from "./output";

let output: Output | null = null;
let mainOutput: OutputHandle | null = null;

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		"sl-external-editor.enable",
		() => {
			mainOutput?.appendLine("Enable command");
		},
	);

	output = new Output("SL External Editor");
	mainOutput = output.getHandle("SL Ext");

	context.subscriptions.push(
		TempWatcher.Setup(mainOutput.getHandle("Temp Watcher")),
	);
	context.subscriptions.push(output);
	context.subscriptions.push(disposable);
	context.subscriptions.push(
		ConfigWatcher.Setup(mainOutput.getHandle("Config Watcher")),
	);

	vscode.workspace.onDidSaveTextDocument((e) => {
		mainOutput?.appendLine("SAVE: " + e.fileName);
		const relative = vscode.workspace.asRelativePath(e.fileName);
		const tempFile = TempWatcher.Get().getMatchingTempFile(
			e.fileName,
			relative.split(path.sep).length < 2,
		);
		if (tempFile) {
			const root = tempFile.rootFile == e.fileName.toLowerCase();
			if (root) {
				vscode.workspace.fs.readFile(vscode.Uri.file(e.fileName))
					.then((data) => {
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
						vscode.workspace.fs.writeFile(
							tempFile.uri,
							new TextEncoder().encode(prefix.join("\n") + text),
						);
					});
			}
		}
	});
	setup();
}

function setup() {
	mainOutput?.appendLine("Activate");
	ConfigWatcher.Get()
		.hook(Config.Enabled, "enabeldSetup", () => setup())
		.start();
	const enabled = getConfig<boolean>(Config.Enabled) || false;
	mainOutput?.appendLine("Enabled: " + (enabled ? "Yes" : "No"));
	TempWatcher.Get().setRunning(enabled);
}

export function deactivate() {
	mainOutput?.appendLine("Deactivate");
}
