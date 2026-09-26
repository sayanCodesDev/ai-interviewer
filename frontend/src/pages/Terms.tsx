import { MarketingLayout } from "@/layouts/MarketingLayout";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="mt-12">
            <h2 className="text-h3">{title}</h2>
            <div className="mt-4 grid gap-4 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
        </section>
    );
}

export function Terms() {
    return (
        <MarketingLayout>
            <div className="page-container max-w-3xl py-16 sm:py-24">
                <p className="label-mono text-muted-foreground">Legal</p>
                <h1 className="text-h2 mt-4">Terms of use</h1>
                <p className="mt-4 text-sm text-muted-foreground">Last updated 26 September 2026</p>

                <p className="mt-8 text-[17px] leading-relaxed text-muted-foreground">
                    By creating an account or taking an interview you agree to these terms.
                </p>

                <Section title="What the service is">
                    <p>AI Interviewer provides simulated technical interviews for practice. The interviewer is an AI and can be wrong. Scores, feedback and study plans are estimates from one conversation, offered as practice feedback. They are not professional advice or an assessment for employment, and no company has endorsed them.</p>
                </Section>

                <Section title="Your account">
                    <p>Keep your password private and give accurate information. You are responsible for what happens under your account. Each account has a daily limit on interviews, to keep the service available to everyone.</p>
                </Section>

                <Section title="Acceptable use">
                    <p>Don't try to break, overload or bypass the service, including the code sandbox. Don't run code intended to attack other systems, mine cryptocurrency or reach the network. Don't upload material you have no right to share, or anyone else's personal data. Don't use the service to build a competing product by scraping it.</p>
                </Section>

                <Section title="Your content">
                    <p>You own what you provide: your resume, job descriptions, answers and code. You let us process it, as described in the privacy page, to run your interviews and produce your reports. You can delete it at any time.</p>
                </Section>

                <Section title="No warranty">
                    <p>The service is provided as it is, without promises that it will be uninterrupted, error-free or that any score will match a real interview's outcome. To the extent the law allows, we're not liable for losses that come from relying on it.</p>
                </Section>

                <Section title="Changes">
                    <p>We may update these terms and the privacy page as the service changes. If a change is significant we'll say so on the site.</p>
                </Section>
            </div>
        </MarketingLayout>
    );
}
