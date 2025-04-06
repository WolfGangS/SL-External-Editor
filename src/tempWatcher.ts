import * as vscode from "vscode";
import os from "os";
import path from "path";
import { OutputHandle } from "./output";
import { Config, getConfig } from "./config";

type WatchedFileHints = { [k: string]: string | undefined };

enum Language {
    None,
    LSL,
    SLua,
}

type WatchedFile = {
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

function getLanguageForFileExt(fileExt: string): Language {
    switch (fileExt.toLowerCase()) {
        case "lua":
        case "luau":
            return Language.SLua;
        case "lsl":
            return Language.LSL;
        default:
            return Language.None;
    }
}

function getFileExtensions(): string[] {
    return (getConfig<string[]>(Config.WatcherFileExtensions) || [])
        .map((s) => s.toLowerCase());
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
        const tempDir = os.platform() == "win32"
            ? vscode.Uri.file("/tmp")
            : vscode.Uri.file("/tmp");
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
        const language = getLanguageForFileExt(ext);
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

    getMatchingTempFile(filePath: string, root: boolean): WatchedFile | null {
        filePath = filePath.toLowerCase();
        for (const watchedName in this.watched) {
            this.output.appendLine("TEST: " + watchedName);
            const watchedFile = this.watched[watchedName];
            if (watchedFile.includedFiles.includes(filePath)) {
                return watchedFile;
            }
            if (watchedFile.rootFile == filePath) return watchedFile;
            if (this.fileNameMatchesWatchedFile(watchedFile, filePath, root)) {
                this.output.appendLine(`MATCH: ${filePath}`);
                this.output.appendLine(`MATCH: ${JSON.stringify(watchedFile)}`);
                watchedFile.rootFile = filePath;
                return watchedFile;
            }
        }
        return null;
    }

    fileNameMatchesWatchedFile(
        file: WatchedFile,
        filePath: string,
        root: boolean,
    ): boolean {
        const fileName = path.basename(filePath);
        const fileExt = fileName.split(".").pop() || "";
        const exts = getFileExtensions();
        if (!exts.includes(fileExt)) return false;
        const dirPath = path.dirname(filePath);
        const parts = fileName.split(".");
        parts.pop();
        const fileNameSansExt = parts.join(".");
        const dirs = dirPath.split("/");
        const dir = dirs[dirs.length - 1];
        const filePathSansExt = `${dirPath}/${fileNameSansExt}`;
        this.output.appendLine(`CHECK PATH: ${filePath}`);
        this.output.appendLine(`CHECK EXT: ${fileExt}`);
        this.output.appendLine(`CHECK NAME: ${fileName}`);
        this.output.appendLine(`CHECK DIR: ${dirPath}`);

        if (getLanguageForFileExt(fileExt) !== file.language) return false;

        const pathHint = file.hints["path"] || "";
        if (pathHint) {
            return dirPath.startsWith(pathHint) &&
                fileNameSansExt == file.scriptName;
        }
        const projectHint = file.hints["project"];
        if (projectHint) {
            const parts = dirPath.split(projectHint);
            if (parts.length == 2) {
                let projPath = parts.pop() as string;
                this.output.appendLine(
                    `CHECK PROJ: ${projectHint} > ${projPath}`,
                );
                while (projPath?.startsWith("/")) {
                    projPath = projPath.substring(1);
                }
                return this.createAlternateNameArray(
                    [projPath],
                    `${fileNameSansExt}`,
                    fileExt,
                ).includes(file.scriptName);
            }
            return false;
        }
        if (
            getConfig<boolean>(Config.WatcherFilesRequireDirectoryPrefix) ||
            !root
        ) {
            this.output.appendLine("Dir Prefix Required");
            this.output.appendLine(
                JSON.stringify(
                    this.createAlternateNameArray(
                        [dir],
                        `${fileNameSansExt}`,
                        fileExt,
                    ),
                    null,
                    2,
                ),
            );
            return this.createAlternateNameArray(
                [dir],
                `${fileNameSansExt}`,
                fileExt,
            )
                .includes(file.scriptName);
        }
        return fileNameSansExt == file.scriptName ||
            fileName == file.scriptName;
    }

    private createAlternateNameArray(
        dirs: string[],
        path: string,
        ext: string,
    ): string[] {
        const data = [
            path,
            path.replaceAll("/", ""),
            path.replaceAll("/", " "),
            path.replaceAll("/", "_"),
            path.replaceAll("/", "-"),
            path.replaceAll("/", "."),
        ];

        return [...data, ...data.map((s) => `${s}.${ext}`)];
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
