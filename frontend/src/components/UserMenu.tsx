import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";

export function getInitials(name?: string | null, fallback = "U") {
    const letters = (name ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    return letters || fallback;
}

export function UserMenu() {
    const { status, user, signOut } = useAuth();
    const navigate = useNavigate();

    if (status !== "authenticated" || !user) return null;

    const displayName = user.name || "Account";

    async function handleSignOut() {
        await signOut();
        toast.success("Signed out");
        navigate("/");
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label="Account menu"
                className="flex h-10 items-center gap-2.5 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-sm font-medium transition-colors hover:bg-accent data-[state=open]:bg-accent"
            >
                <span className="flex size-8 items-center justify-center rounded-full bg-foreground font-mono text-[11px] font-medium text-background">
                    {getInitials(user.name)}
                </span>
                <span className="hidden max-w-32 truncate sm:block">{displayName}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                    <p className="text-sm font-medium">{displayName}</p>
                    <p className="mt-0.5 truncate text-[13px] font-normal text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleSignOut}>
                    <LogOut />
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
