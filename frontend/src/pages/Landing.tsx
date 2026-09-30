import { Bento } from "@/components/landing/Bento";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { Formats } from "@/components/landing/Formats";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { MockInterviews } from "@/components/landing/MockInterviews";
import { ReportShowcase } from "@/components/landing/ReportShowcase";
import { RolesMarquee } from "@/components/landing/RolesMarquee";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteNav } from "@/components/landing/SiteNav";

export function Landing() {
    return (
        <>
            <SiteNav />
            <main>
                <Hero />
                <RolesMarquee />
                <HowItWorks />
                <Bento />
                <Formats />
                <ReportShowcase />
                <MockInterviews />
                <Faq />
                <FinalCta />
            </main>
            <SiteFooter />
        </>
    );
}
