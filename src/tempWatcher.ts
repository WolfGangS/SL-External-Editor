import * as vscode from "vscode";
import os from "os";
import path from "path";
import { OutputHandle, stubOutput } from "./output";
import { Config, getConfig } from "./config";
import { cleanPathString } from "./util";
import { getOutput } from "./extension";

type WatchedFileHints = { [k: string]: string | undefined };

export enum Language {
    None = "None",
    LSL = "LSL",
    SLua = "SLua",
}

export function getVscodeLangFromLanguage(lang: Language) {
    switch (lang) {
        case Language.LSL:
            return "lsl";
        case Language.SLua:
            return "luau";
        default:
            return;
    }
}

type HookSet<T> = { [k: string]: Hook<T> };
class Hook<T> implements vscode.Disposable {
    dispose: () => void;
    cb: (e: T) => void;
    constructor(cb: (e: T) => void, dispose: () => void) {
        this.cb = cb;
        this.dispose = dispose;
    }

    trigger(e: T) {
        this.cb(e);
    }
}

export interface WatchedFile {
    ext: string;
    fileName: string;
    nameWithoutExt: string;
    scriptName: string;
    hints: WatchedFileHints;
    language: Language;
    uri: vscode.Uri;
    comment: string;
    hintPrefix: string;
    includedFiles: string[];
    rootFile: vscode.Uri | null;
    multiMatch: boolean;
    logFile: WatchedFile | null;
    codeFile: WatchedFile | null;
    isLog: boolean;
    meta: { [k: string]: string | number | boolean | undefined };
}

function getCommentFormatForLanguage(lang: Language): string {
    switch (lang) {
        case Language.SLua:
            return "--";
        case Language.LSL:
        default:
            return "//";
    }
}

export function getLanguageForFileExtension(fileExt: string): Language {
    switch ((fileExt.split(".").pop() || "").toLowerCase()) {
        case "lua":
        case "luau":
        case "slua":
            return Language.SLua;
        case "lsl":
            return Language.LSL;
        default:
            return Language.None;
    }
}

export function getFileExtensionsForLanguage(lang: Language): string[] {
    switch (lang) {
        case Language.SLua:
            return ["luau", "slua", "lua"];
        case Language.LSL:
            return ["lsl"];
        default:
            return [];
    }
}

let temp_dir: string | null = null;

export function setTempDirFromFile(file: string) {
    temp_dir = path.dirname(file);
}

function getFileExtensions(): string[] {
    return (getConfig<string[]>(Config.WatcherFileExtensions) || [])
        .map((s) => s.toLowerCase());
}

export function getTempDir(): vscode.Uri {
    if (temp_dir) return vscode.Uri.file(temp_dir);
    switch (os.platform()) {
        case "win32":
            return vscode.Uri.joinPath(
                vscode.Uri.file(process.env.LOCALAPPDATA || ""),
                "Temp",
            );
        case "darwin":
            return vscode.Uri.file(
                process.env.TMPDIR || "",
            );
        default:
            return vscode.Uri.file("/tmp");
    }
}

type TempWatcherHandles = {
    delete: HookSet<WatchedFile>;
    create: HookSet<WatchedFile>;
    change: HookSet<WatchedFile>;
};

export class TempWatcher implements vscode.Disposable {
    private static instance: TempWatcher | null = null;
    private dir: vscode.Uri;
    private interval: NodeJS.Timeout | null = null;
    private watched: { [k: string]: WatchedFile } = {};
    private output: OutputHandle;

    private handles: TempWatcherHandles = {
        delete: {},
        create: {},
        change: {},
    };

    private watcher: vscode.FileSystemWatcher | null = null;
    private constructor(dir: vscode.Uri, output: OutputHandle) {
        this.dir = dir;
        this.output = output;
    }
    static Setup(output: OutputHandle): TempWatcher {
        if (this.instance) this.instance.dispose();
        const tempDir = getTempDir();
        output.appendLine(`Setup '${tempDir}'`);
        this.instance = new TempWatcher(tempDir, output);
        return this.instance;
    }
    static Get(): TempWatcher {
        if (!this.instance) throw Error("Trying to Get before Setup");
        return this.instance;
    }
    setRunning(run: boolean) {
        if (run) this.start();
        else this.stop();
    }
    start(): this {
        this.stop();
        this.output.appendLine(`Watching '${this.dir}'`);
        // this.interval = setInterval(() => this.watch(), 1000);
        const glob = new vscode.RelativePattern(this.dir, "sl_script_*");
        this.watcher = vscode.workspace.createFileSystemWatcher(
            glob,
            false,
            false,
            false,
        );
        this.watcher.onDidCreate((e) => this.didCreate(e));
        this.watcher.onDidChange((e) => this.didChange(e));
        this.watcher.onDidDelete((e) => this.didDelete(e));
        this.init();
        return this;
    }

    private async didCreate(uri: vscode.Uri) {
        const exts = getFileExtensions();
        const rgx = new RegExp(
            `^sl_script_(.+)_([a-f0-9]{32}|[a-f0-9-]{36})\.(${
                exts.join("|")
            })(.log)?$`,
            "gi",
        );
        const name = path.basename(uri.path);
        this.output.appendLine("NEW FILE: " + name);
        if (!name.match(rgx)) return;

        const file = new TempFile(uri);
        if (file.ext == "log") {
            file.codeFile = this.getWatchedFileByName(file.nameWithoutExt);
            if (file.codeFile) file.codeFile.logFile = file;
            else {this.output.appendLine(
                    `No code file for - ${file.nameWithoutExt}\n${
                        Object.keys(this.watched).join("\n")
                    }`,
                );}
        } else {
            file.logFile = this.getWatchedFileByName(
                `${file.fileName}.log`,
            );
            if (file.logFile) file.logFile.codeFile = file;
            else {this.output.appendLine(
                    `No log file for - ${file.fileName}\n${
                        Object.keys(this.watched).join("\n")
                    }`,
                );}
            await file.readHints();
        }
        this.watched[file.fileName] = file;
        this.callHooks("create", file);
    }

    private async didChange(uri: vscode.Uri) {
        const file = this.getWatchedFileForFileUri(uri);
        if (!file) return;
        this.callHooks("change", file);
    }

    private async didDelete(uri: vscode.Uri) {
        const file = this.getWatchedFileForFileUri(uri);
        if (!file) return;
        this.callHooks("delete", file);
        if (file.logFile) {
            delete this.watched[file.logFile.fileName];
        } else if (file.codeFile) {
            file.codeFile.logFile = null;
        }
        delete this.watched[file.fileName];
    }

    stop(): this {
        if (this.interval) {
            this.output.appendLine("Stopped");
            clearInterval(this.interval);
            this.interval = null;
        }
        if (this.watcher) {
            this.watcher.dispose();
            this.watcher = null;
        }
        this.watched = {};
        return this;
    }

    private async init() {
        const dirs = await vscode.workspace.fs.readDirectory(this.dir);
        for (const [name, type] of dirs) {
            if (type != vscode.FileType.File) continue;
            if (!name.startsWith("sl_script_")) continue;
            await this.didCreate(vscode.Uri.joinPath(this.dir, name));
        }
    }

    getMatchingTempFiles(
        fileUri: vscode.Uri,
        relativePath: string,
    ): WatchedFile[] {
        const filePath = fileUri.path.toLowerCase();
        this.output.appendLine(
            " ========================= TEST ========================= ",
        );
        this.output.appendLine("FP: " + filePath);
        this.output.appendLine(
            "RP: " + relativePath +
                ` ${JSON.stringify(relativePath.split(path.sep))}`,
        );
        const matches: WatchedFile[] = [];
        for (const watchedName in this.watched) {
            this.output.appendLine("TEST: " + watchedName);
            const watchedFile = this.watched[watchedName];
            if (watchedFile.includedFiles.includes(filePath)) {
                return [watchedFile];
            }
            if (watchedFile.rootFile) {
                if (watchedFile.rootFile.path.toLowerCase() == filePath) {
                    return [watchedFile];
                }
            }
            if (
                this.fileNameMatchesWatchedFile(
                    watchedFile,
                    filePath,
                    relativePath,
                )
            ) {
                this.output.appendLine(`MATCH: ${filePath}`);
                // this.output.appendLine(`MATCH: ${JSON.stringify(watchedFile)}`);
                matches.push(watchedFile);
            }
        }
        if (matches.length == 1) {
            matches[0].rootFile = fileUri;
        }
        return matches;
    }

    getWatchedFileForFileUri(fileUri: vscode.Uri): WatchedFile | null {
        return this.getWatchedFileByName(path.basename(fileUri.path));
    }

    private getWatchedFileByName(name: string) {
        return this.watched[name] || null;
    }

    silentFileNameMatchesWatchedFile(
        file: WatchedFile,
        filePath: string,
        relativePath: string,
    ): boolean {
        const output = this.output;
        this.output = stubOutput();
        const result = this.runFileNameMatchesWatchedFile(
            file,
            filePath,
            relativePath,
        );
        this.output = output;
        return result;
    }

    fileNameMatchesWatchedFile(
        file: WatchedFile,
        filePath: string,
        relativePath: string,
    ): boolean {
        return this.runFileNameMatchesWatchedFile(file, filePath, relativePath);
    }

    private runFileNameMatchesWatchedFile(
        file: WatchedFile,
        filePath: string,
        relativePath: string,
    ): boolean {
        const fileExt = filePath.split(".").pop() || "";
        const exts = getFileExtensions();

        if (!exts.includes(fileExt)) {
            this.output.appendLine(
                `CHECK: File extension ... ${fileExt} ... FAIL`,
            );
            return false;
        }

        if (!this.filePathTests(file, filePath, relativePath)) {
            return false;
        }

        const lang = getLanguageForFileExtension(fileExt);
        if (lang != file.language) {
            this.output.appendLine(
                `CHECK: Language ... ${file.language} == ${lang} ... FAIL`,
            );
            vscode.window.showWarningMessage(
                `Saved file matches '${file.scriptName}' but is unexpected language. Matched file is '${file.language}' but saved file is '${lang}'`,
            );
            return false;
        }

        return true;
    }

    private filePathTests(
        file: WatchedFile,
        filePath: string,
        relativePath: string,
    ) {
        const pathHint = file.hints["path"] || "";
        if (pathHint) {
            this.output.append(`CHECK: Path hint '${pathHint}' ...`);
            if (!filePath.startsWith(pathHint)) {
                this.output.appendLine("FAIL, not path");
                return false;
            }
            relativePath = filePath.split(pathHint).pop() || "";
            return this.testRelativePath(relativePath, file);
        }

        const projectHint = file.hints["project"];
        if (projectHint) {
            this.output.append(`CHECK: Project hint '${projectHint}' ...`);
            if (!filePath.includes(projectHint)) {
                this.output.appendLine("FAIL, not project");
                return false;
            }
            relativePath = filePath.split(projectHint).pop() || "";
            return this.testRelativePath(relativePath, file);
        }

        if (
            getConfig<boolean>(Config.WatcherFilesRequireDirectoryPrefix)
        ) {
            this.output.append("CHECK: Dir prefix ... ");
            const parts = filePath.split(relativePath);
            let dirPath = parts[0] || "";
            while (dirPath.endsWith(path.sep)) {
                dirPath = dirPath.substring(0, dirPath.length - 1);
            }
            const dir = dirPath.split(path.sep).pop() || "";
            if (dir.length < 1) {
                this.output.appendLine("FAIL empty");
                return false;
            }
            relativePath = dir + path.sep + relativePath;
            return this.testRelativePath(relativePath, file);
        }

        this.output.append("CHECK: Default ... ");

        return this.testRelativePath(relativePath, file);
    }

    private testRelativePath(
        relativePath: string,
        file: WatchedFile,
    ): boolean {
        this.output.append(relativePath + " > " + file.scriptName + " ... ");
        const exts = getFileExtensions().map((e) => `.${e}`);
        exts.push("");

        const scriptNames = exts.map((e) => `${file.scriptName}${e}`);

        const test = this.testAlternativeRelativePaths(
            relativePath,
            scriptNames,
        );

        if (test) {
            this.output.appendLine("OK!");
            return true;
        } else {
            this.output.appendLine("FAIL, not relative");
            return false;
        }
    }

    private testAlternativeRelativePaths(
        relativePath: string,
        scriptNames: string[],
    ) {
        const alternatives = this.createAlternateNameArray(relativePath);
        this.output.appendLine(" TESTING");
        this.output.appendLine(
            JSON.stringify(
                alternatives.map((s) => {
                    const parts = s.split(".");
                    parts.pop();
                    return parts.join(".");
                }),
            ),
        );
        for (const scriptName of scriptNames) {
            if (alternatives.includes(scriptName)) {
                return true;
            }
        }
        return false;
    }

    private createAlternateNameArray(
        relative: string,
    ): string[] {
        return [
            relative,
            relative.replaceAll(path.sep, ""),
            relative.replaceAll(path.sep, " "),
            relative.replaceAll(path.sep, "_"),
            relative.replaceAll(path.sep, "-"),
            relative.replaceAll(path.sep, "."),
        ];
    }

    dispose() {
        this.stop();
        this.handles = {
            delete: {},
            change: {},
            create: {},
        };
    }

    onDidCreate(cb: (file: WatchedFile) => void): Hook<WatchedFile> {
        return this.setupHook("create", cb);
    }

    onDidChange(cb: (file: WatchedFile) => void): Hook<WatchedFile> {
        return this.setupHook("change", cb);
    }

    onDidDelete(cb: (file: WatchedFile) => void): Hook<WatchedFile> {
        return this.setupHook("delete", cb);
    }

    private setupHook(
        type: keyof TempWatcherHandles,
        cb: (file: WatchedFile) => void,
    ): Hook<WatchedFile> {
        let k = `${Date.now()}-${Math.random()}`;
        while (this.handles[type][k]) k = `${Date.now()}-${Math.random()}`;
        this.handles[type][k] = new Hook(cb, () => {
            delete this.handles[type][k];
        });
        return this.handles[type][k];
    }

    private callHooks(type: keyof TempWatcherHandles, file: WatchedFile) {
        this.output.appendLine(`${type}: '${file.fileName}'`);
        for (const k in this.handles[type]) {
            this.handles[type][k].trigger(file);
        }
    }
}

export class TempFile implements WatchedFile {
    ext: string;
    fileName: string;
    nameWithoutExt: string;
    scriptName: string;
    hints: WatchedFileHints = {};
    language: Language;
    uri: vscode.Uri;
    comment: string;
    hintPrefix: string;
    includedFiles: string[] = [];
    rootFile: vscode.Uri | null = null;
    multiMatch: boolean = false;
    _logFile: WatchedFile | null = null;
    _codeFile: WatchedFile | null = null;
    meta = {};

    constructor(uri: vscode.Uri) {
        const fileName = path.basename(uri.path);
        const nameParts = fileName.split(".");
        this.ext = (nameParts.pop() || "").toLowerCase();
        this.nameWithoutExt = nameParts.join(".");
        const parts = fileName.split("_");
        parts.pop();
        parts.shift();
        parts.shift();
        this.scriptName = parts.join("_").toLowerCase();
        this.fileName = fileName;
        this.language = getLanguageForFileExtension(this.ext);
        this.uri = uri;
        this.comment = getCommentFormatForLanguage(this.language);
        this.hintPrefix = getConfig<string>(Config.HintsPrefix) || "";
    }

    async readHints() {
        if (!this.comment) return;
        if (!this.hintPrefix) return;
        this.hints = {};
        const data = await vscode.workspace.fs.readFile(this.uri);
        const text = (new TextDecoder().decode(data)).split("\n");
        for (const line of text) {
            let trimmed = line.trim();
            if (trimmed.length < 1) continue;
            if (!trimmed.startsWith(this.comment)) continue;
            trimmed = trimmed.substring(this.comment.length).trim();
            if (!trimmed.startsWith(this.hintPrefix)) continue;
            trimmed = trimmed.substring(this.hintPrefix.length).trim();
            const parts = trimmed.split(" ");
            const hint = parts.shift()?.toLowerCase();
            trimmed = parts.join(" ").trim();
            if (hint) {
                this.hints[hint] = trimmed.toLowerCase();
            }
        }
        if (this.hints["file"]) {
            this.hints["file"] = cleanPathString(this.hints["file"]);
            this.scriptName = this.hints["file"];
        }
        if (this.hints["project"]) {
            this.hints["project"] = cleanPathString(this.hints["project"]);
        }
    }

    get isLog(): boolean {
        return this.ext == "log";
    }

    get logFile(): WatchedFile | null {
        return this._logFile;
    }

    set logFile(file: WatchedFile | null) {
        if (file) {
            if (this.isLog) throw new Error("Can't set logFile on logFile");
            getOutput("TEMP FILE")?.appendLine(
                `Set Log On Code - ${this.fileName}`,
            );
        }
        this._logFile = file;
    }

    get codeFile(): WatchedFile | null {
        return this._codeFile;
    }

    set codeFile(file: WatchedFile | null) {
        if (file) {
            if (!this.isLog) throw new Error("Can't set codeFile on codeFile");
            getOutput("TEMP FILE")?.appendLine(
                `Set Code On Log - ${this.fileName}`,
            );
        }
        this._codeFile = file;
    }
}
