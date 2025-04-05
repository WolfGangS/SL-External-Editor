import * as vscode from "vscode";
import {
    getLanguageForFileExtension,
    getTempDir,
    Language,
} from "./tempWatcher";
import { Config, getConfig } from "./config";
import { getOutput } from "./extension";
import { OutputHandle } from "./output";
import * as path from "path";
import util from "node:util";
import child_process from "node:child_process";
const exec = util.promisify(child_process.exec);

export function isPreProcConfigured(uri: vscode.Uri) {
    const lang = getLang(uri, true);
    if (!lang) return false;
    const cmd = getCmd(lang);
    return !!cmd;
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

    const rawCmd = getCmd(language);
    if (!rawCmd) throw new Error("No preproc command configured");

    const [cmd, out] = prepCmd(rawCmd, uri, language, wf);

    output.appendLine("Run command: " + cmd);

    const result = await exec(cmd);
    const decoded = await decodeResponse(result.stdout, out);
    if (typeof decoded == "string") {
        return {
            text: decoded,
            files: [],
            language,
        };
    } else {
        return { ...decoded, language };
    }
}

async function decodeResponse(
    stdout: string,
    out: vscode.Uri | false,
): Promise<string | PreProcResponse> {
    try {
        if (out) {
            const data = await vscode.workspace.fs.readFile(out);
            stdout = new TextDecoder().decode(data);
        }
        const json = JSON.parse(stdout);
        if (isPreProcResponse(json)) {
            return json;
        }
    } catch (_e) {
    }
    return stdout;
}

function prepCmd(
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

function getWorkingFolder(): vscode.Uri | null {
    if (!vscode.workspace.workspaceFolders) {
        return null;
    }
    return vscode.workspace.workspaceFolders[0].uri;
}

type PreProcResponse = {
    text: string;
    files: string[];
    hash?: string;
    language: Language;
};

function isPreProcResponse(json: unknown): json is PreProcResponse {
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
    return true;
}

function isStringArray(array: unknown[]): array is string[] {
    for (const u of array) {
        if (typeof u !== "string") return false;
    }
    return true;
}
