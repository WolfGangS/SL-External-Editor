import * as vscode from "vscode";
import os from "os";
import {
    getLanguageForFileExtension,
    getTempDir,
    Language,
} from "./tempWatcher";
import { Config, getConfig } from "./config";
import { getOutput } from "./extension";
import * as path from "path";
import util from "node:util";
import child_process from "node:child_process";
import { getFilePathForUrl } from "./defsDownloader";
const exec = util.promisify(child_process.exec);

const state_last_preproc_dl = "sl-ext-editor.preproc.last_dl";

export function isPreProcConfigured(uri: vscode.Uri) {
    const lang = getLang(uri, true);
    if (!lang) return false;
    const cmd = getCmd(lang);
    return !!cmd;
}

export async function queryLinesFromPreProc(lines: number[]) {
}

export async function runPreProc(
    uri: vscode.Uri,
): Promise<PreProcResponse> {
    const output = getOutput("PreProc");
    if (!output) throw new Error("No Output");
    output.appendLine(uri.path);

    const wf = getWorkingFolder();
    if (!wf) throw new Error("VSCode not open in folder");

    const language = getLang(uri);
    if (!language) {
        throw new Error("Couldn't determine language as LSL or SLua");
    }

    const [cmd, out] = getPreparedCMD(uri, language, wf);
    if (!cmd) throw new Error("No preproc command configured");

    output.appendLine("Run command: " + cmd);

    try {
        const result = await runCmd(cmd);
        const decoded = await decodeResponse(result.stdout, out);
        if (typeof decoded == "string") {
            return {
                success: true,
                text: decoded,
                files: [],
                language,
            };
        } else {
            const ts = JSON.parse(JSON.stringify(decoded));
            delete ts["text"];
            output.appendLine(JSON.stringify(ts, null, 2));
            return { success: true, language, ...decoded };
        }
    } catch (e) {
        vscode.window.showErrorMessage(`PREPROC FAILED: ${e}`);
    }
    return { success: false, text: "", language, files: [] };
}

async function decodeResponse(
    stdout: string,
    out: vscode.Uri | false,
): Promise<string | PreProcOutput> {
    try {
        if (out) {
            const data = await vscode.workspace.fs.readFile(out);
            stdout = new TextDecoder().decode(data);
            await vscode.workspace.fs.delete(out);
        }
        const json = JSON.parse(stdout);
        if (isPreProcOutput(json)) {
            return { success: true, ...json };
        }
    } catch (_e) {
    }
    return stdout;
}

export function getPreparedCMD(
    uri: vscode.Uri,
    lang: Language,
    wf: vscode.Uri,
): [string | false, vscode.Uri | false] {
    const raw = getCmd(lang);
    if (!raw) return [false, false];
    return prepCmd(raw, uri, lang, wf);
}

export function prepCmd(
    cmd: string,
    uri: vscode.Uri,
    lang: Language,
    wf: vscode.Uri,
): [string, vscode.Uri | false] {
    let out: vscode.Uri | false = false;
    cmd = cmd.replaceAll("%script%", uri.path);
    cmd = cmd.replaceAll("%lang%", lang.toLowerCase());
    cmd = cmd.replaceAll("%root%", wf.path);
    if (cmd.includes("%out%")) {
        out = vscode.Uri.joinPath(
            getTempDir(),
            `${Date.now()}-output-${path.basename(uri.path)}`,
        );
        cmd = cmd.replaceAll("%out%", out.path);
    }
    return [cmd, out];
}

function getCmd(lang: Language): string | null {
    const cmd = getConfig<string>(
        lang == Language.LSL
            ? Config.PreProcCommandLSL
            : Config.PreProcCommandSLua,
    ) || "";
    if (cmd.length < 5) {
        return null;
    }
    return cmd;
}

function getLang(uri: vscode.Uri, silent: boolean = false): Language | null {
    const ext = uri.path.split(".").pop();
    if (!ext) {
        return null;
    }
    const lang = getLanguageForFileExtension(ext);
    if (lang == Language.None) {
        return null;
    }
    return lang;
}

export function getWorkingFolder(): vscode.Uri | null {
    if (!vscode.workspace.workspaceFolders) {
        return null;
    }
    return vscode.workspace.workspaceFolders[0].uri;
}

type PreProcResponse = {
    success: boolean;
    text: string;
    files: string[];
    language: Language;
    hash?: string;
    errorMessage?: string;
    sourceMap?: unknown;
};

type PreProcOutput = {
    success?: boolean;
    text: string;
    files: string[];
    language?: Language;
    hash?: string;
    errorMessage?: string;
    sourceMap?: unknown;
};

function isPreProcOutput(json: unknown): json is PreProcOutput {
    if (typeof json != "object") return false;
    if (json == null) return false;
    if (json instanceof Array) return false;
    if (!("text" in json)) return false;
    if (typeof (json.text) != "string") return false;
    if (!("files" in json)) return false;
    if (!(json.files instanceof Array)) return false;
    if (!isStringArray(json.files)) return false;
    if ("hash" in json) {
        if (typeof (json.hash) != "string") return false;
    }
    if ("success" in json) {
        if (typeof json.success != "boolean") return false;
    }
    if ("success" in json) {
        if (typeof json.success != "boolean") return false;
    }
    return true;
}

function isStringArray(array: unknown[]): array is string[] {
    for (const u of array) {
        if (typeof u !== "string") return false;
    }
    return true;
}

export async function runCmd(
    cmd: string,
): Promise<child_process.PromiseWithChild<{ stderr: string; stdout: string }>> {
    return await exec(cmd);
}

export async function shouldRedownloadPreProc(
    context: vscode.ExtensionContext,
): Promise<boolean> {
    const url = getPreProcUrl();
    if (!url) return false;
    const stateUrl = context.globalState.get(state_last_preproc_dl) ?? "";
    const output = getOutput("PreProc?");
    output?.appendLine(`Test: '${url[0]}' - '${stateUrl}'`);
    if (stateUrl == "") {
        const dirs = await vscode.workspace.fs.readDirectory(
            context.globalStorageUri,
        );
        for (const [name, type] of dirs) {
            if (type != vscode.FileType.File) continue;
            output?.appendLine(`Test: file ${name}`);
            if (name.toLowerCase().includes("preproc")) {
                output?.appendLine(
                    `Test File Url: '${url[0]}' - '${stateUrl}'`,
                );
                return url[0] != stateUrl;
            }
        }
        return false;
    }
    return url[0] != stateUrl;
}

export async function downloadPreProc(context: vscode.ExtensionContext) {
    const url = getPreProcUrl();
    if (!url) return;
    const output = getOutput("PreProc DL");
    if (!output) throw "no output";
    output.appendLine(`Downloading '${url[0]}'`);
    const result = await fetch(url[0]);
    const buff = await result.arrayBuffer();
    const file = getFilePathForUrl(url[0], context, false);
    await vscode.workspace.fs.writeFile(
        file,
        new Uint8Array(buff),
    );
    context.globalState.update(state_last_preproc_dl, url[0]);
    output.appendLine(
        `Downloaded: ${url[0]}\nAnd Save to: ${file.path}`,
    );
    const globalDir = context.globalStorageUri.path.toLowerCase();
    const slua_preproc = (getConfig<string>(Config.PreProcCommandSLua) || "")
        .toLowerCase();
    const cmd = url[1].replaceAll("%preproc%", file.path);
    if (slua_preproc.length < 1 || slua_preproc.startsWith(globalDir)) {
        vscode.workspace.getConfiguration().update(
            Config.PreProcCommandSLua,
            undefined,
        );
        vscode.workspace.getConfiguration().update(
            Config.PreProcCommandSLua,
            cmd,
            vscode.ConfigurationTarget.Global,
        );
    }
    const lsl_preproc = (getConfig<string>(Config.PreProcCommandSLua) || "")
        .toLowerCase();
    if (lsl_preproc.length < 1 || lsl_preproc.startsWith(globalDir)) {
        vscode.workspace.getConfiguration().update(
            Config.PreProcCommandLSL,
            undefined,
        );
        vscode.workspace.getConfiguration().update(
            Config.PreProcCommandLSL,
            cmd,
            vscode.ConfigurationTarget.Global,
        );
    }
    if (os.platform() == "linux") {
        try {
            await runCmd(`chmod +x ${file.path}`);
        } catch (e) {
            vscode.window.showErrorMessage(`${e}`);
        }
    }
}

export function getPreProcUrl(): [string, string] | false {
    const url = getDefaultDslUrl();
    if (!url) return false;
    return [
        url,
        '"%preproc%" --file "%script%" --lang "%lang%" --root "%root%"',
    ];
}

function getDefaultDslUrl(): string | false {
    switch (os.platform()) {
        case "win32":
            return "https://github.com/WolfGangS/DSL-PreProc/releases/download/v0.2.2/win_dsl_preproc.exe";
        case "darwin":
            return "https://github.com/WolfGangS/DSL-PreProc/releases/download/v0.2.2/mac_dsl_preproc";
        case "linux":
            return "https://github.com/WolfGangS/DSL-PreProc/releases/download/v0.2.2/dsl_preproc";
        default:
            return false;
    }
}
