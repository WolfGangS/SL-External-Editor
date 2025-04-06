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
