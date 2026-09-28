import { Excalidraw } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { loadDraft, saveDraft } from "@/hooks/useEditorPrefs";
import { describeExcalidrawScene } from "./sceneDescription";

// Not a normal `import "...css"`: this package's stylesheet export is gated behind non-standard package.json
// export conditions that made Bun's production bundler pick the wrong chunk as the app's own entry script
// (see build.ts's history for the exact failure). Served as a plain static file instead, the same way
// monaco-setup.ts serves Monaco's assets, so this component's CSS need never go through module resolution.
const EXCALIDRAW_CSS_HREF = "/excalidraw/index.css";
function useExcalidrawStylesheet(): void {
    useEffect(() => {
        if (document.querySelector(`link[href="${EXCALIDRAW_CSS_HREF}"]`)) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = EXCALIDRAW_CSS_HREF;
        document.head.appendChild(link);
    }, []);
}

export interface DesignCanvasHandle {
    /** A structured, readable description of the current diagram, for the interviewer to read instead of a screenshot. */
    describeScene: () => string;
}

interface DesignCanvasProps {
    draftKey: string;
}

/** A whiteboard for the system-design round: boxes, arrows and labels, read by the interviewer as structured data. */
export const DesignCanvas = forwardRef<DesignCanvasHandle, DesignCanvasProps>(function DesignCanvas({ draftKey }, ref) {
    const api = useRef<ExcalidrawImperativeAPI | null>(null);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useExcalidrawStylesheet();

    useImperativeHandle(ref, () => ({
        describeScene: () => describeExcalidrawScene(api.current?.getSceneElements() ?? []),
    }), []);

    function handleChange(elements: readonly ExcalidrawElement[], _appState: AppState, _files: BinaryFiles) {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            try {
                saveDraft(draftKey, JSON.stringify(elements));
            } catch {
                /* a draft that fails to save is not worth interrupting the interview over */
            }
        }, 600);
    }

    const initialElements = (() => {
        const raw = loadDraft(draftKey);
        if (!raw) return [];
        try {
            return JSON.parse(raw) as ExcalidrawElement[];
        } catch {
            return [];
        }
    })();

    return (
        <div className="h-full w-full overflow-hidden rounded-lg border border-night-line [&_.excalidraw]:h-full">
            <Excalidraw
                excalidrawAPI={(a) => { api.current = a; }}
                // `theme="dark"` only styles Excalidraw's own panels; it does not change the default colour it
                // gives new shapes, which stays its light-mode "#1e1e1e" regardless. Left alone, that's a nearly
                // invisible dark stroke on our dark canvas — the candidate draws boxes they can barely see. Both
                // colours below are the app's own night palette, so a fresh board reads clearly from the first line.
                initialData={{ elements: initialElements, appState: { theme: "dark", viewBackgroundColor: "#1a1a17", currentItemStrokeColor: "#f2f0ea" } }}
                onChange={handleChange}
                theme="dark"
                UIOptions={{ canvasActions: { saveToActiveFile: false, loadScene: false, export: false, toggleTheme: false } }}
            />
        </div>
    );
});
