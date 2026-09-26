/** A compact, readable rendering of a JSON value for showing test inputs and outputs. */
export function formatValue(value: unknown, max = 600): string {
    let text: string;
    try {
        text = value === undefined ? "" : JSON.stringify(value);
    } catch {
        text = String(value);
    }
    text ??= "";
    return text.length > max ? `${text.slice(0, max)}… (${text.length - max} more characters)` : text;
}

/** "name = value, name = value" for an example's inputs. */
export function formatInputs(params: Array<{ name: string }>, values: unknown[]): string {
    return params.map((param, i) => `${param.name} = ${formatValue(values[i])}`).join("\n");
}

/** mm:ss or h:mm:ss from milliseconds. */
export function formatOffset(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
