// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { TempWatcher } from "./tempWatcher";
import { Config, ConfigWatcher, getConfig } from "./config";
import { Output, OutputHandle } from "./output";

let output: Output | null = null;
let mainOutput: OutputHandle | null = null;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log(
		'Congratulations, your extension "sl-external-editor" is now active!',
	);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
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
			relative.split("/").length < 2,
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
	TempWatcher.Get().setRunning(enabled);
}

// This method is called when your extension is deactivated
export function deactivate() {
	mainOutput?.appendLine("Deactivate");
}
