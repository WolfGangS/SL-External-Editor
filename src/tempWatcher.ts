import * as vscode from "vscode";
import os from "os";
import path from "path";
import { OutputHandle } from "./output";
import { Config, getConfig } from "./config";

type WatchedFileHints = { [k: string]: string | undefined };

export enum Language {
    None = "None",
    LSL = "LSL",
    SLua = "SLua",
}

export type WatchedFile = {
    ext: string;
    fileName: string;
    scriptName: string;
    hints: WatchedFileHints;
    language: Language;
    uri: vscode.Uri;
    comment: string;
    hintPrefix: string;
    includedFiles: string[];
    rootFile: string;
    multiMatch: boolean;
};

function getCommentFormatForLanguage(lang: Language): string {
    switch (lang) {
        case Language.SLua:
            return "--";
        case Language.LSL:
        default:
            return "//";
    }
}

function getLanguageForFileExtension(fileExt: string): Language {
    switch (fileExt.toLowerCase()) {
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

function getTempDir(): vscode.Uri {
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

export class TempWatcher implements vscode.Disposable {
    private static instance: TempWatcher | null = null;
    private dir: vscode.Uri;
    private interval: NodeJS.Timeout | null = null;
    private watched: { [k: string]: WatchedFile } = {};
    private output: OutputHandle;
    private createHandles: { [k: string]: (file: WatchedFile) => void } = {};
    private deleteHandles: { [k: string]: (file: WatchedFile) => void } = {};
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
        this.output.appendLine(`Watching '${this.dir}'`);
        this.interval = setInterval(() => this.watch(), 1000);
        return this;
    }
    stop(): this {
        if (this.interval) {
            this.output.appendLine("Stopped");
            clearInterval(this.interval);
            this.interval = null;
        }
        this.watched = {};
        return this;
    }
    private watch() {
        vscode.workspace.fs.readDirectory(this.dir)
            .then((entries) => {
                const scripts: string[] = [];
                for (const entry of entries) {
                    const name = entry[0];
                    const type = entry[1];
                    if (type != vscode.FileType.File) continue;
                    if (!name.startsWith("sl_script_")) continue;
                    scripts.push(name);
                    if (this.watched[name]) continue;

                    const file = this.createFile(name);
                    const fileExts = getFileExtensions();
                    if (fileExts.includes(file.ext)) {
                        if (file.comment && file.hintPrefix) {
                            this.readHintsAndNotify(file);
                        } else {
                            this.fileCreated(file);
                        }
                    } else {
                        this.output.appendLine(
                            "Ignore: " + name + " not in extension array",
                        );
                    }
                }
                for (const file in this.watched) {
                    if (!scripts.includes(file)) {
                        this.fileDeleted(this.watched[file]);
                    }
                }
            });
    }

    private createFile(fileName: string): WatchedFile {
        const ext = (fileName.split(".").pop() || "").toLowerCase();
        const parts = fileName.split("_");
        parts.pop();
        parts.shift();
        parts.shift();
        const scriptName = parts.join("_").toLowerCase();
        const language = getLanguageForFileExtension(ext);
        return {
            fileName,
            language,
            ext,
            scriptName,
            hints: {},
            uri: vscode.Uri.joinPath(this.dir, fileName),
            comment: getCommentFormatForLanguage(language),
            hintPrefix: getConfig<string>(Config.HintsPrefix) || "",
            rootFile: "",
            includedFiles: [],
            multiMatch: false,
        };
    }

    private fileDeleted(file: WatchedFile) {
        this.output.appendLine(`Delete: '${file.fileName}'`);
        for (const handle in this.deleteHandles) {
            this.deleteHandles[handle](file);
        }
        delete this.watched[file.fileName];
    }

    private readHintsAndNotify(file: WatchedFile) {
        vscode.workspace.fs.readFile(
            vscode.Uri.joinPath(this.dir, file.fileName),
        )
            .then((data) => {
                const text = new TextDecoder().decode(data)
                    .split(
                        "\n",
                    );
                const hints: WatchedFileHints = {};
                for (const line of text) {
                    let trimmed = line.trim();
                    if (trimmed.length < 1) continue;
                    if (!trimmed.startsWith(file.comment)) continue;
                    trimmed = trimmed.substring(file.comment.length).trim();
                    if (!trimmed.startsWith(file.hintPrefix)) continue;
                    trimmed = trimmed.substring(file.hintPrefix.length).trim();
                    const parts = trimmed.split(" ");
                    const hint = parts.shift();
                    trimmed = parts.join(" ").trim();
                    if (hint) {
                        hints[hint] = trimmed.toLowerCase();
                    }
                }
                file.hints = hints;
                if (hints["file"]) {
                    file.scriptName = hints["file"];
                }
                this.fileCreated(file);
            });
    }

    private fileCreated(file: WatchedFile) {
        this.watched[file.fileName] = file;
        this.output.appendLine(`Create: '${file.fileName}'`);
        this.output.appendLine(JSON.stringify(file.hints));
        for (const handle in this.createHandles) {
            this.createHandles[handle](file);
        }
    }

    getMatchingTempFiles(
        filePath: string,
        relativePath: string,
    ): WatchedFile[] {
        filePath = filePath.toLowerCase();
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
            if (watchedFile.rootFile == filePath) return [watchedFile];
            if (
                this.fileNameMatchesWatchedFile(
                    watchedFile,
                    filePath,
                    relativePath,
                )
            ) {
                this.output.appendLine(`MATCH: ${filePath}`);
                this.output.appendLine(`MATCH: ${JSON.stringify(watchedFile)}`);
                matches.push(watchedFile);
            }
        }
        if (matches.length == 1) {
            matches[0].rootFile = filePath;
        }
        return matches;
    }

    getWatchedFileForFileUri(fileUri: vscode.Uri): WatchedFile | null {
        const base = path.basename(fileUri.path);
        return this.watched[base] || null;
    }

    fileNameMatchesWatchedFile(
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
                null,
                2,
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
    }
    hookFileCreate(handleName: string, cb: (file: WatchedFile) => void) {
        this.createHandles[handleName] = cb;
    }
    unhookFileCreate(handleName: string): boolean {
        if (this.createHandles[handleName]) {
            delete this.createHandles[handleName];
            return true;
        }
        return false;
    }
    hookFileDelete(handleName: string, cb: (file: WatchedFile) => void) {
        this.deleteHandles[handleName] = cb;
    }
    unhookFileDelete(handleName: string): boolean {
        if (this.deleteHandles[handleName]) {
            delete this.deleteHandles[handleName];
            return true;
        }
        return false;
    }
}
