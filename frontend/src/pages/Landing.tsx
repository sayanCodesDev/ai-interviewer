import { Bento } from "@/components/landing/Bento";
import { CapabilityStrip } from "@/components/landing/CapabilityStrip";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { MockInterviews } from "@/components/landing/MockInterviews";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteNav } from "@/components/landing/SiteNav";

export function Landing() {
    return (
        <>
            <SiteNav />
            <main>
                <Hero />
                <CapabilityStrip />
                <HowItWorks />
                <Bento />
                <MockInterviews />
                <Faq />
                <FinalCta />
            </main>
            <SiteFooter />
        </>
    );
}
