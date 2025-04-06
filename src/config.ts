import * as vscode from "vscode";
import { OutputHandle } from "./output";

export enum Config {
    Enabled = "secondlifeExternalEditor.enabled",
    DirProjects = "secondlifeExternalEditor.dir.projects",
    HintsPrefix = "secondlifeExternalEditor.hints.prefix",
    WatcherFilesRequireDirectoryPrefix =
        "secondlifeExternalEditor.watcher.tempFilesRequireDirectoryPrefix",
    WatcherFileExtensions = "secondlifeExternalEditor.watcher.fileExtensions",
    PreProcWatchIncludes =
        "secondlifeExternalEditor.preprocessor.watchIncludes",
    PreProcCommand = "secondlifeExternalEditor.preprocessor.command",
    Download = "secondlifeExternalEditor.download",
    DownloadLocation = "secondlifeExternalEditor.download.location",
    LuauLSPDefs = "secondlifeExternalEditor.luau-lsp.downloadTypeDefs",
    LuauLSPDocs = "secondlifeExternalEditor.luau-lsp.downloadApiDocs",
    SeleneDocs = "secondlifeExternalEditor.selene.download",
}

export enum DownloadLocation {
    Global = "global",
    Root = "root",
    VSCode = "vscode",
    Types = "types",
}

export function getConfig<T>(config: Config): T | null {
    const parts = config.split(".");
    parts.shift();
    const str = parts.join(".");
    return vscode.workspace.getConfiguration("secondlifeExternalEditor").get<T>(
        str,
    ) ?? null;
}

export class ConfigWatcher implements vscode.Disposable {
    private static instance: ConfigWatcher | null = null;
    private watcher: vscode.Disposable | null = null;
    private hooks: { [key in Config]: { [k: string]: () => void } } = {
        [Config.Enabled]: {},
        [Config.DirProjects]: {},
        [Config.WatcherFilesRequireDirectoryPrefix]: {},
        [Config.WatcherFileExtensions]: {},
        [Config.PreProcCommand]: {},
        [Config.HintsPrefix]: {},
        [Config.PreProcWatchIncludes]: {},
        [Config.Download]: {},
        [Config.LuauLSPDefs]: {},
        [Config.LuauLSPDocs]: {},
        [Config.SeleneDocs]: {},
        [Config.DownloadLocation]: {},
    };
    private output: OutputHandle;

    private constructor(output: OutputHandle) {
        this.output = output;
    }

    static Setup(output: OutputHandle) {
        if (this.instance) this.instance.dispose();
        this.instance = new ConfigWatcher(output);
        return this.instance;
    }

    static Get() {
        if (!this.instance) throw Error("Calling get before Setup");
        return this.instance;
    }

    dispose() {
        this.stop();
    }

    hook(config: Config, name: string, cb: () => void) {
        this.hooks[config][name] = cb;
        return this;
    }

    unhook(config: Config, name: string) {
        if (this.hooks[config][name]) {
            delete this.hooks[config][name];
        }
        return this;
    }

    start() {
        this.output.appendLine("Started");
        this.watcher = vscode.workspace.onDidChangeConfiguration((e) => {
            this.onChange(e);
        });
        return this;
    }

    private onChange(event: vscode.ConfigurationChangeEvent) {
        for (const entry of Object.entries(this.hooks)) {
            const key = entry[0];
            const hooks = entry[1];
            if (event.affectsConfiguration(key)) {
                this.output.appendLine(`Config change '${key}'`);
                for (const hook in hooks) {
                    hooks[hook]();
                }
            }
        }
    }

    stop() {
        if (this.watcher) {
            this.watcher.dispose();
        }
        return this;
    }
}
