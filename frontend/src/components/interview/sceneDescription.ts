import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

type TextElement = ExcalidrawElement & { type: "text" };

const isText = (el: ExcalidrawElement): el is TextElement => el.type === "text";
const centerOf = (el: ExcalidrawElement) => ({ x: el.x + el.width / 2, y: el.y + el.height / 2 });
const contains = (shape: ExcalidrawElement, point: { x: number; y: number }) =>
    point.x >= shape.x && point.x <= shape.x + shape.width && point.y >= shape.y && point.y <= shape.y + shape.height;

/**
 * The label a shape carries: its own properly bound text (double-clicked inside it), or — since a candidate
 * clicking slightly off-target is common and shouldn't lose the label entirely — the nearest otherwise-unbound
 * text element whose center actually sits inside the shape. `claimed` tracks which free text a shape has used,
 * so it is not then also reported a second time as an unrelated floating note.
 */
function labelOf(el: ExcalidrawElement, elements: readonly ExcalidrawElement[], claimed: Set<string>): string {
    if (isText(el)) return el.text.trim() || "an empty label";
    const bound = elements.find((e): e is TextElement => isText(e) && "containerId" in e && e.containerId === el.id);
    if (bound?.text.trim()) return bound.text.trim();

    const nearby = elements.find((e) => isText(e) && !claimed.has(e.id) && !("containerId" in e && e.containerId) && e.text.trim() && contains(el, centerOf(e)));
    if (nearby) { claimed.add(nearby.id); return (nearby as TextElement).text.trim(); }

    return `an unlabeled ${el.type}`;
}

/**
 * Turns the drawn boxes, arrows and labels into plain text: what the interviewer actually reads. Structured data,
 * not a screenshot, so it is read precisely instead of guessed at by a vision model, and costs nothing extra to send.
 */
export function describeExcalidrawScene(elements: readonly ExcalidrawElement[]): string {
    const live = elements.filter((el) => !el.isDeleted);
    if (live.length === 0) return "(The candidate has not drawn anything yet.)";

    const byId = new Map(live.map((el) => [el.id, el]));
    const shapes = live.filter((el) => el.type === "rectangle" || el.type === "ellipse" || el.type === "diamond");
    const arrows = live.filter((el) => el.type === "arrow");
    const claimed = new Set<string>();

    const lines: string[] = [];
    if (shapes.length > 0) {
        lines.push("Boxes on the board:");
        for (const s of shapes) lines.push(`- ${labelOf(s, live, claimed)}`);
    }
    if (arrows.length > 0) {
        lines.push("Arrows:");
        for (const a of arrows) {
            const start = "startBinding" in a && a.startBinding ? byId.get(a.startBinding.elementId) : undefined;
            const end = "endBinding" in a && a.endBinding ? byId.get(a.endBinding.elementId) : undefined;
            const from = start ? labelOf(start, live, claimed) : "an unconnected point";
            const to = end ? labelOf(end, live, claimed) : "an unconnected point";
            lines.push(`- ${from} points to ${to}`);
        }
    }
    // Only text nothing else claimed as its label: genuinely standalone annotations.
    const freeText = live.filter((el): el is TextElement => isText(el) && !("containerId" in el && el.containerId) && !claimed.has(el.id));
    if (freeText.length > 0) {
        lines.push("Free-floating notes:");
        for (const t of freeText) if (t.text.trim()) lines.push(`- ${t.text.trim()}`);
    }
    return lines.join("\n");
}
