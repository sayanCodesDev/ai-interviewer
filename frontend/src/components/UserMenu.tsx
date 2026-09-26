import { History, LogOut, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PasswordInput } from "@/components/PasswordInput";
import { apiErrorMessage, clearSession } from "@/lib/api";
import { deleteAccount } from "@/lib/interviews";
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
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    if (status !== "authenticated" || !user) return null;

    const displayName = user.name || "Account";

    async function handleSignOut() {
        await signOut();
        toast.success("Signed out");
        navigate("/");
    }

    async function handleDeleteAccount(event: React.FormEvent) {
        event.preventDefault();
        setDeleting(true);
        setDeleteError(null);
        try {
            await deleteAccount(password);
            clearSession();
            toast.success("Your account and all of its data were deleted.");
            navigate("/");
        } catch (error) {
            setDeleteError(apiErrorMessage(error, "We couldn't delete your account."));
        } finally {
            setDeleting(false);
        }
    }

    return (
        <>
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
                <DropdownMenuItem asChild>
                    <Link to="/dashboard">
                        <History />
                        Your interviews
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleSignOut}>
                    <LogOut />
                    Sign out
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-destructive data-[highlighted]:text-destructive [&_svg]:text-destructive">
                    <Trash2 />
                    Delete account
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) { setPassword(""); setDeleteError(null); } }}>
            <DialogContent>
                <form onSubmit={handleDeleteAccount} className="grid gap-5">
                    <DialogHeader>
                        <DialogTitle>Delete your account?</DialogTitle>
                        <DialogDescription>
                            This permanently removes your account, every interview, transcript, code submission and report. It can't be undone. Enter your password to confirm.
                        </DialogDescription>
                    </DialogHeader>
                    <PasswordInput id="delete-password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
                    {deleteError && <p role="alert" className="text-[13px] text-destructive">{deleteError}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                        <Button type="submit" variant="destructive" disabled={!password || deleting}>{deleting ? "Deleting…" : "Delete everything"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
        </>
    );
}
