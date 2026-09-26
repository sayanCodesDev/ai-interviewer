import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";

export function AppHeader() {
    return (
        <header className="border-b bg-background">
            <div className="app-container flex h-16 items-center justify-between">
                <Logo />
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <UserMenu />
                </div>
            </div>
        </header>
    );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader />
            <main className="flex-1">{children}</main>
        </div>
    );
}
