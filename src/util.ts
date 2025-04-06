import path from "path";

export function arrayMismatch(aa: string[], bb: string[]) {
    if (aa.length != bb.length) return true;
    for (const a of aa) {
        if (!bb.includes(a)) return true;
    }
    for (const b of bb) {
        if (!aa.includes(b)) return true;
    }
    return false;
}

export function cleanPathString(str: string): string {
    while (str.includes("//")) str = str.replaceAll("//", "/");
    while (str.includes("\\\\")) str = str.replaceAll("\\\\", "\\");
    while (str.startsWith("/")) str = str.substring(1);
    while (str.endsWith("/")) str = str.substring(0, str.length - 1);
    str = str.replaceAll("/", "%%%%");
    str = str.replaceAll("\\", "%%%%");
    return str.replaceAll("%%%%", path.sep);
}
