import { Config, DownloadLocation, getConfig } from "./config";
import { OutputHandle } from "./output";
import * as vscode from "vscode";
import path from "path";
import { arrayMismatch } from "./util";
import { getOutput } from "./extension";

const seleneToml = `std = "sl_selene_defs"

[rules]
global_usage = "allow"
shadowing = "allow"
must_use = "warn"

[config]
empty_if = { comments_count = true }
unused_variable = { ignore_pattern = "^_|^changed$|^attached$|^on_rez$|^touch_start$|^touch_end$|^touch$|^listen$|^timer$|^http_request$|^http_response$|^link_message$" }`;

const cyrb53 = (str: string, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
};

function getFilePathForUrl(url: string, context: vscode.ExtensionContext) {
    const uri = vscode.Uri.parse(url);
    url = uri.toString();
    const base = path.basename(url);
    const hash = cyrb53(url, 4);
    return vscode.Uri.joinPath(context.globalStorageUri, `${hash}_${base}`);
}

export type DownloadResult = {
    lsp: boolean;
    selene: boolean;
    snippet: boolean;
};

const state_next_download = "sl-external-editor.next-download";

export class DefsDownloader {
    private static instance: DefsDownloader | null = null;
    private output: OutputHandle;
    private context: vscode.ExtensionContext;
    private constructor(
        output: OutputHandle,
        context: vscode.ExtensionContext,
    ) {
        this.output = output;
        this.context = context;
    }

    static enabled(): boolean {
        return getConfig<boolean>(Config.Download) || false;
    }

    static setup(
        output: OutputHandle,
        context: vscode.ExtensionContext,
    ): DefsDownloader {
        this.instance = new DefsDownloader(output, context);
        return this.instance;
    }

    static get(): DefsDownloader {
        if (!this.instance) throw new Error("Accessing before setup");
        return this.instance;
    }

    lspEnabled(): boolean {
        return !!vscode.extensions.getExtension("johnnymorganz.luau-lsp");
    }

    seleneEnabled(): boolean {
        return !!vscode.extensions.getExtension("Kampfkarren.selene-vscode");
    }

    needsDownload(): boolean {
        if (!DefsDownloader.enabled()) return false;
        const next =
            this.context.globalState.get<number>(state_next_download) || 0;
        const now = Math.floor(Date.now() / 1000);
        this.output.appendLine(
            `Next DL: ${new Date(next * 1000)} ${
                next < now ? "true" : "false"
            }`,
        );
        return next < now;
    }

    async restrictToExistingLocalFiles(
        urls: string[],
    ): Promise<[string, vscode.Uri][]> {
        const exists: [string, vscode.Uri][] = [];
        for (const url of urls) {
            const file = getFilePathForUrl(url, this.context);
            try {
                const stat = await vscode.workspace.fs.stat(file);
                if (stat.type == vscode.FileType.File) {
                    exists.push([url, file]);
                }
            } catch (_e) {
            }
        }
        return exists;
    }

    async getDownloadedDefs(): Promise<[string, vscode.Uri][]> {
        return await this.restrictToExistingLocalFiles(
            getConfig<string[]>(Config.LuauLSPDefs) || [],
        );
    }

    async getDownloadedDocs(): Promise<[string, vscode.Uri][]> {
        return await this.restrictToExistingLocalFiles(
            getConfig<string[]>(Config.LuauLSPDocs) || [],
        );
    }

    async getDownLoadedSnippets(): Promise<[string, vscode.Uri][]> {
        return await this.restrictToExistingLocalFiles(
            getConfig<string[]>(Config.DownloadSnippets) || [],
        );
    }

    async getDownloadedSelene(): Promise<[string, vscode.Uri][]> {
        const selene = getConfig<string>(Config.SeleneDocs);
        if (selene) {
            return await this.restrictToExistingLocalFiles([selene]);
        }
        return Promise.resolve([]);
    }

    async getDownloadedSeleneToml(): Promise<[string, vscode.Uri][]> {
        const selene = getConfig<string>(Config.SeleneToml);
        if (selene) {
            return await this.restrictToExistingLocalFiles([selene]);
        }
        return Promise.resolve([]);
    }

    async download(force: boolean = false): Promise<DownloadResult> {
        if (!DefsDownloader.enabled() && !force) {
            return { lsp: false, selene: false, snippet: false };
        }
        const result = await Promise.all([
            this.downloadLSPData(force),
            this.downloadSelene(force),
            this.downloadSnippets(force),
        ]);

        this.context.globalState.update(
            state_next_download,
            Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 2),
        );

        return {
            lsp: result[0].length > 0,
            selene: result[1].length > 0,
            snippet: result[2].length > 0,
        };
    }

    async downloadLSPData(force: boolean): Promise<string[]> {
        const urls = [
            ...(getConfig<string[]>(Config.LuauLSPDefs) || []),
            ...(getConfig<string[]>(Config.LuauLSPDocs) || []),
        ];
        this.output.appendLine(`Downloading ${urls.length} LSP Def file(s)...`);
        return (await Promise.all(
            urls.map((d) => this.downloadFile(d, force)),
        ))
            .filter((u) => u != null);
    }

    async downloadSnippets(force: boolean): Promise<string[]> {
        const snips = getConfig<string[]>(Config.DownloadSnippets) || [];
        this.output.appendLine(
            `Downloading ${snips.length} Snippet file(s)...`,
        );
        return (await Promise.all(
            snips.map((d) => this.downloadFile(d, force)),
        ))
            .filter((u) => u != null);
    }

    async downloadSelene(force: boolean): Promise<string[]> {
        this.output.appendLine("Downloading Selene...");
        const selene = getConfig<string>(Config.SeleneDocs) || "";
        const toml = getConfig<string>(Config.SeleneDocs) || "";
        return (await Promise.all(
            [selene, toml].map((d) => this.downloadFile(d, force)),
        )).filter((u) => u != null);
    }

    private async downloadFile(
        url: string,
        force: boolean,
    ): Promise<string | null> {
        if (!url.startsWith("https://")) return null;
        const file = getFilePathForUrl(url, this.context);
        try {
            const result = await fetch(url);
            const buff = await result.arrayBuffer();
            const buffLen = buff.byteLength;
            const text = new TextDecoder().decode(buff);
            const hash = `${cyrb53(text, 4)}:${buffLen}`;
            const urlHash = cyrb53(url, 4);
            const oldHash = this.context.globalState.get<string>(
                `cache.${urlHash}`,
            ) || "";
            if (oldHash != hash || force) {
                this.context.globalState.update(urlHash, hash);
                await vscode.workspace.fs.writeFile(
                    file,
                    new TextEncoder().encode(text),
                );
                this.output.appendLine(
                    `Saved: ${path.basename(file.toString())}`,
                );
                return url;
            }
        } catch (_e) {
        }
        return null;
    }

    async updateLuauLSPConfig(force: boolean = false) {
        if (!this.lspEnabled() && !force) return;

        const luauConfig = vscode.workspace.getConfiguration("luau-lsp");

        const dlDefCache = await DefsDownloader.get().getDownloadedDefs();
        const dlDocCache = await DefsDownloader.get().getDownloadedDocs();

        if (dlDefCache.length < 1 && dlDocCache.length < 1) return;

        const dlDefs: string[] = [];
        for (const dlDef of dlDefCache) {
            const url = dlDef[0];
            const cached = dlDef[1];
            const target = await getPathForDefFileInstall(cached, url, false);
            if (!target) continue;
            if (cached != target) {
                await vscode.workspace.fs.copy(
                    cached,
                    target,
                    { overwrite: true },
                );
            }
            dlDefs.push(vscode.workspace.asRelativePath(target));
        }

        const dlDocs: string[] = [];
        for (const dlDoc of dlDocCache) {
            const url = dlDoc[0];
            const cached = dlDoc[1];
            const target = await getPathForDefFileInstall(cached, url, false);
            if (!target) continue;
            if (cached != target) {
                await vscode.workspace.fs.copy(
                    cached,
                    target,
                    { overwrite: true },
                );
            }
            dlDocs.push(vscode.workspace.asRelativePath(target));
        }

        const defs = luauConfig.get<string[]>("types.definitionFiles") || [];
        const docs = luauConfig.get<string[]>("types.documentationFiles") || [];

        luauConfig.update("types.definitionFiles", dlDefs);
        luauConfig.update("types.documentationFiles", dlDocs);

        luauConfig.update("platform.type", "standard");

        await vscode.commands.executeCommand("luau-lsp.reloadServer");
    }

    async updateSnippets(force: boolean = false) {
        if (!vscode.workspace.workspaceFolders) {
            if (force) {
                vscode.window.showWarningMessage(
                    "VSCode is not open in a directory",
                );
            }
            return;
        }

        const wf = vscode.workspace.workspaceFolders[0].uri;
        const snippets = await this.getDownLoadedSnippets();

        for (const [url, cachedFile] of snippets) {
            const base = path.basename(url);
            await vscode.workspace.fs.copy(
                cachedFile,
                vscode.Uri.joinPath(wf, ".vscode", base),
                { overwrite: true },
            );
        }
    }

    async updateSeleneConfig(force: boolean = false) {
        if (!this.seleneEnabled() && !force) return false;
        if (!vscode.workspace.workspaceFolders) {
            if (force) {
                vscode.window.showWarningMessage(
                    "VSCode is not open in a directory",
                );
            }
            return;
        }
        const sel = (await DefsDownloader.get().getDownloadedSelene()).pop();
        if (!sel) return;
        const seleneUrl = sel[0];
        const seleneCache = sel[1];
        const target = await getPathForDefFileInstall(
            seleneCache,
            seleneUrl,
            true,
        );
        if (typeof target == "boolean") return;
        const wf = vscode.workspace.workspaceFolders[0].uri;
        await vscode.workspace.fs.copy(
            seleneCache,
            target,
            { overwrite: true },
        );
        const relative = vscode.workspace.asRelativePath(target).replaceAll(
            ".yml",
            "",
        );

        let replaced = false;
        let toml = (await getSeleneTomlFileContent(
            (await this.getDownloadedSeleneToml())[0] || null,
        ))
            .split("\n")
            .map((l) => {
                if (
                    l.trim().replaceAll(" ", "").replaceAll("\t", "")
                        .startsWith("std=")
                ) {
                    replaced = true;
                    return `std = "${relative}"`;
                }
                return l;
            })
            .join("\n");

        if (toml.length < 1) return;

        if (!replaced) {
            toml = `std = "${relative}"\n${toml}`;
        }

        await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(wf, "selene.toml"),
            new TextEncoder().encode(toml),
        );
        vscode.window.showInformationMessage("Selene Setup");
    }
}

async function getSeleneTomlFileContent(
    cachedToml: [string, vscode.Uri] | null,
): Promise<string> {
    if (!vscode.workspace.workspaceFolders) {
        return "";
    }

    const wf = vscode.workspace.workspaceFolders[0].uri;

    try {
        const fileContent = new TextDecoder().decode(
            await vscode.workspace.fs.readFile(
                vscode.Uri.joinPath(wf, "selene.toml"),
            ),
        );
        if (fileContent.length > 10) return fileContent;
    } catch (_e) {
    }

    if (cachedToml) {
        try {
            const text = new TextDecoder().decode(
                await vscode.workspace.fs.readFile(cachedToml[1]),
            );
            if (text.length > 10) return text;
        } catch (_e) {
        }
    }

    return seleneToml;
}

async function getPathForDefFileInstall(
    uri: vscode.Uri,
    url: string,
    selene: boolean,
): Promise<vscode.Uri | false> {
    let choice = getConfig<DownloadLocation>(Config.DownloadLocation);
    if (!choice) return false;
    if (selene && choice == DownloadLocation.Global) {
        choice = DownloadLocation.Root;
    }
    //getOutput("DL PATH DEF")?.appendLine("Choice: " + choice);
    if (choice == DownloadLocation.Global) {
        return uri;
    } else {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showWarningMessage(
                "VSCode is not open in a directory",
            );
            return false;
        }
        const basename = path.basename(url);
        let wf = vscode.workspace.workspaceFolders[0].uri;
        if (choice == DownloadLocation.Root) {
            return vscode.Uri.joinPath(wf, basename);
        }
        if (choice == DownloadLocation.Types) {
            return vscode.Uri.joinPath(wf, ".types", basename);
        }
        if (choice == DownloadLocation.VSCode) {
            return vscode.Uri.joinPath(wf, ".vscode", basename);
        }
    }
    return false;
}
