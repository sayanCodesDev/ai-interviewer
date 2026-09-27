import { expect, test } from "bun:test";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { describeExcalidrawScene } from "./sceneDescription";

/** A minimal element with just the fields describeExcalidrawScene actually reads. */
function el(partial: Record<string, unknown>): ExcalidrawElement {
    return { isDeleted: false, x: 0, y: 0, width: 0, height: 0, ...partial } as unknown as ExcalidrawElement;
}

test("an empty board says so plainly", () => {
    expect(describeExcalidrawScene([])).toMatch(/not drawn anything/);
    expect(describeExcalidrawScene([el({ type: "rectangle", isDeleted: true })])).toMatch(/not drawn anything/);
});

test("a shape with text properly bound inside it is labelled by that text", () => {
    const box = el({ id: "b1", type: "rectangle", x: 0, y: 0, width: 100, height: 60 });
    const label = el({ id: "t1", type: "text", containerId: "b1", text: "API service" });
    expect(describeExcalidrawScene([box, label])).toBe("Boxes on the board:\n- API service");
});

test("text typed near a shape but not properly bound is still picked up as its label", () => {
    // This is the common real case: a candidate double-clicks slightly off-target, so Excalidraw creates a
    // free-floating text element instead of binding it — the label should not silently disappear.
    const box = el({ id: "b1", type: "rectangle", x: 100, y: 100, width: 120, height: 60 });
    const nearbyText = el({ id: "t1", type: "text", x: 140, y: 120, width: 40, height: 20, text: "Database" });
    const result = describeExcalidrawScene([box, nearbyText]);
    expect(result).toBe("Boxes on the board:\n- Database");
    expect(result).not.toMatch(/Free-floating/);
});

test("text whose center sits outside every shape is reported as a free-floating note, not attached to anything", () => {
    const box = el({ id: "b1", type: "rectangle", x: 0, y: 0, width: 50, height: 50 });
    const farText = el({ id: "t1", type: "text", x: 500, y: 500, width: 40, height: 20, text: "Rate limit: 100 rps" });
    const result = describeExcalidrawScene([box, farText]);
    expect(result).toBe("Boxes on the board:\n- an unlabeled rectangle\nFree-floating notes:\n- Rate limit: 100 rps");
});

test("a shape with nothing bound and nothing nearby is reported as unlabeled, not skipped", () => {
    const box = el({ id: "b1", type: "rectangle", x: 0, y: 0, width: 50, height: 50 });
    expect(describeExcalidrawScene([box])).toBe("Boxes on the board:\n- an unlabeled rectangle");
});

test("arrows are described by the labels of what they connect, not their ids", () => {
    const a = el({ id: "a", type: "rectangle", x: 0, y: 0, width: 60, height: 40 });
    const aLabel = el({ id: "aLabel", type: "text", containerId: "a", text: "Client" });
    const b = el({ id: "b", type: "rectangle", x: 200, y: 0, width: 60, height: 40 });
    const bLabel = el({ id: "bLabel", type: "text", containerId: "b", text: "Server" });
    const arrow = el({ id: "arr", type: "arrow", startBinding: { elementId: "a" }, endBinding: { elementId: "b" } });
    const result = describeExcalidrawScene([a, aLabel, b, bLabel, arrow]);
    expect(result).toContain("Arrows:\n- Client points to Server");
});

test("an arrow with no binding on one end says so instead of crashing", () => {
    const a = el({ id: "a", type: "rectangle", x: 0, y: 0, width: 60, height: 40 });
    const arrow = el({ id: "arr", type: "arrow", startBinding: { elementId: "a" }, endBinding: null });
    const result = describeExcalidrawScene([a, arrow]);
    expect(result).toContain("an unlabeled rectangle points to an unconnected point");
});

test("a deleted element is left out entirely", () => {
    const box = el({ id: "b1", type: "rectangle", x: 0, y: 0, width: 50, height: 50, isDeleted: true });
    const stray = el({ id: "t1", type: "text", text: "leftover" });
    expect(describeExcalidrawScene([box, stray])).toBe("Free-floating notes:\n- leftover");
});

test("the same free text is never claimed by two different shapes", () => {
    // Two overlapping boxes both contain the text's center point; only one may claim it, and the other still
    // gets reported as unlabeled rather than the label being duplicated across both.
    const a = el({ id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 100 });
    const b = el({ id: "b", type: "rectangle", x: 20, y: 20, width: 100, height: 100 });
    const text = el({ id: "t", type: "text", x: 30, y: 30, width: 20, height: 10, text: "Overlap" });
    const result = describeExcalidrawScene([a, b, text]);
    expect(result.match(/Overlap/g)?.length).toBe(1);
});
