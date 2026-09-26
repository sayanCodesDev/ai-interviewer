import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { EditorPrefs } from "@/hooks/useEditorPrefs";

interface EditorSettingsProps {
    prefs: EditorPrefs;
    onChange: (patch: Partial<EditorPrefs>) => void;
    onResetCode: () => void;
}

export function EditorSettings({ prefs, onChange, onResetCode }: EditorSettingsProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Editor settings">
                    <Settings2 />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Editor</DropdownMenuLabel>
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onChange({ fontSize: Math.min(22, prefs.fontSize + 1) }); }}>
                    Larger text <span className="ml-auto font-mono text-xs text-muted-foreground">{prefs.fontSize}px</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onChange({ fontSize: Math.max(11, prefs.fontSize - 1) }); }}>
                    Smaller text
                </DropdownMenuItem>
                <DropdownMenuCheckboxItem checked={prefs.tabSize === 2} onCheckedChange={(on) => onChange({ tabSize: on ? 2 : 4 })}>
                    Two-space tabs
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={prefs.wordWrap} onCheckedChange={(on) => onChange({ wordWrap: on })}>
                    Wrap long lines
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={prefs.minimap} onCheckedChange={(on) => onChange({ minimap: on })}>
                    Minimap
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={prefs.theme === "paper"} onCheckedChange={(on) => onChange({ theme: on ? "paper" : "night" })}>
                    Light editor theme
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onResetCode}>Reset to starter code</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
