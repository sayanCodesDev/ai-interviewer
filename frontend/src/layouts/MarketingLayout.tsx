import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteNav } from "@/components/landing/SiteNav";

/** Header and footer for the public pages. */
export function MarketingLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <SiteNav />
            <main className="pt-[72px]">{children}</main>
            <SiteFooter />
        </>
    );
}
