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
};

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

    getDownloadedDefs(): Promise<[string, vscode.Uri][]> {
        return this.restrictToExistingLocalFiles(
            getConfig<string[]>(Config.LuauLSPDefs) || [],
        );
    }

    async getDownloadedDocs(): Promise<[string, vscode.Uri][]> {
        return this.restrictToExistingLocalFiles(
            getConfig<string[]>(Config.LuauLSPDocs) || [],
        );
    }

    async getDownloadedSelene(): Promise<[string, vscode.Uri][]> {
        const selene = getConfig<string>(Config.SeleneDocs);
        if (selene) {
            return this.restrictToExistingLocalFiles([selene]);
        }
        return Promise.resolve([]);
    }

    async download(force: boolean = false): Promise<DownloadResult> {
        if (!DefsDownloader.enabled() && !force) {
            return { lsp: false, selene: false };
        }
        if (
            !vscode.extensions.getExtension("johnnymorganz.luau-lsp") && !force
        ) {
            return { lsp: false, selene: false };
        }
        const result = await Promise.all([
            this.downloadLSPData(force),
            this.downloadSelene(force),
        ]);
        return {
            lsp: result[0].length > 0,
            selene: result[1].length > 0,
        };
    }

    async downloadLSPData(force: boolean): Promise<string[]> {
        const res = await Promise.all([
            this.downloadDefs(force),
            this.downloadDocs(force),
        ]);
        return [...res[0], ...res[0]];
    }

    private async downloadDefs(force: boolean): Promise<string[]> {
        const defs = getConfig<string[]>(Config.LuauLSPDefs) || [];
        return (await Promise.all(defs.map((d) => this.downloadFile(d, force))))
            .filter((u) => u != null);
    }

    private async downloadDocs(force: boolean): Promise<string[]> {
        const docs = getConfig<string[]>(Config.LuauLSPDocs) || [];
        return (await Promise.all(docs.map((d) => this.downloadFile(d, force))))
            .filter((u) => u != null);
    }

    async downloadSelene(force: boolean): Promise<string[]> {
        const selene = getConfig<string>(Config.SeleneDocs);
        if (selene) {
            const change = await this.downloadFile(selene, force);
            if (change) return [change];
        }
        return [];
    }

    private async downloadFile(
        url: string,
        force: boolean,
    ): Promise<string | null> {
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
                this.output.appendLine(`Saved: ${file.toString()}`);
                return url;
            }
        } catch (_e) {
        }
        return null;
    }

    async updateLuauLSPConfig(force: boolean) {
        if (!vscode.extensions.getExtension("johnnymorganz.luau-lsp")) return;

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

        if (
            !force && !arrayMismatch(defs, dlDefs) &&
            !arrayMismatch(docs, dlDocs)
        ) {
            return;
        }

        luauConfig.update("types.definitionFiles", dlDefs);
        luauConfig.update("types.documentationFiles", dlDocs);

        luauConfig.update("platform.type", "standard");

        await vscode.commands.executeCommand("luau-lsp.reloadServer");
    }

    async updateSeleneConfig(force: boolean = false) {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showWarningMessage(
                "VSCode is not open in a directory",
            );
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

        await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(wf, "selene.toml"),
            new TextEncoder().encode(
                seleneToml.replaceAll('"sl_selene_defs"', `"${relative}"`),
            ),
        );
        vscode.window.showInformationMessage("Selene Setup");
    }
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
    getOutput("DL PATH DEF")?.appendLine("Choice: " + choice);
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
