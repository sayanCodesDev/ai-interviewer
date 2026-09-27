import { Excalidraw } from "@excalidraw/excalidraw";
// This package's "./index.css" export is gated on "development"/"production" package.json export conditions,
// which Bun's bundler and dev server need to be told about explicitly (see build.ts and bunfig.toml).
import "@excalidraw/excalidraw/index.css";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { forwardRef, useImperativeHandle, useRef } from "react";

import { loadDraft, saveDraft } from "@/hooks/useEditorPrefs";
import { describeExcalidrawScene } from "./sceneDescription";

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
                initialData={{ elements: initialElements, appState: { theme: "dark", viewBackgroundColor: "#1a1a17" } }}
                onChange={handleChange}
                theme="dark"
                UIOptions={{ canvasActions: { saveToActiveFile: false, loadScene: false, export: false, toggleTheme: false } }}
            />
        </div>
    );
});
