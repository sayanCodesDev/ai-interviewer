/**
 * Spreads model calls across several models so that no single model's tokens-per-minute allowance
 * is exhausted. Each model has its own budget (a free Groq key gives 8,000 tokens a minute per
 * model), so three models triple the capacity, and a rate-limited model is routed around instead
 * of failing the call.
 */

interface ModelState {
    /** Tokens spent in the last minute: [timestamp, tokens]. */
    spent: Array<[number, number]>;
    cooldownUntil: number;
    limit: number;
}

const WINDOW_MS = 60_000;
/** Leave headroom: estimates are rough, and other calls may be in flight. */
const BUDGET_FRACTION = 0.85;

export class ModelRouter {
    private readonly state = new Map<string, ModelState>();

    constructor(private readonly defaultLimit: number, private readonly now: () => number = Date.now) {}

    private get(model: string): ModelState {
        let s = this.state.get(model);
        if (!s) {
            s = { spent: [], cooldownUntil: 0, limit: this.defaultLimit };
            this.state.set(model, s);
        }
        return s;
    }

    private prune(s: ModelState): void {
        const cutoff = this.now() - WINDOW_MS;
        while (s.spent.length > 0 && s.spent[0]![0] < cutoff) s.spent.shift();
    }

    /** Tokens still available to this model in the current minute (by our own accounting). */
    remaining(model: string): number {
        const s = this.get(model);
        this.prune(s);
        return Math.max(0, s.limit * BUDGET_FRACTION - s.spent.reduce((n, [, tokens]) => n + tokens, 0));
    }

    /** Whether a request of about this size fits, and the model isn't cooling down. */
    canSend(model: string, tokens: number): boolean {
        const s = this.get(model);
        if (this.now() < s.cooldownUntil) return false;
        // A request bigger than a whole minute's allowance can never fit; let it try rather than wait forever.
        if (tokens > s.limit * BUDGET_FRACTION) return true;
        return this.remaining(model) >= tokens;
    }

    /** The first model in preference order that can take the request, or null if none can right now. */
    pick(models: string[], tokens: number, exclude: ReadonlySet<string> = new Set()): string | null {
        for (const model of models) {
            if (!exclude.has(model) && this.canSend(model, tokens)) return model;
        }
        return null;
    }

    record(model: string, tokens: number): void {
        this.get(model).spent.push([this.now(), tokens]);
    }

    /** The provider said no (429). Stay away for a while. */
    cooldown(model: string, ms: number): void {
        const s = this.get(model);
        s.cooldownUntil = Math.max(s.cooldownUntil, this.now() + ms);
    }

    /**
     * Whether any of these models can take a request right now, and if none can, how long until the
     * soonest is likely to. A model that hit its daily allowance is cooling down for a long time, which
     * is how "the provider is out of quota for today" becomes visible before someone starts an interview.
     */
    availability(models: string[]): { available: boolean; retryAfterMs: number } {
        const waits = models.map((model) => Math.max(0, this.get(model).cooldownUntil - this.now()));
        const soonest = waits.length > 0 ? Math.min(...waits) : 0;
        return { available: soonest === 0, retryAfterMs: soonest };
    }

    /** The provider told us this model's real limit. */
    learnLimit(model: string, tokensPerMinute: number): void {
        if (Number.isFinite(tokensPerMinute) && tokensPerMinute > 0) this.get(model).limit = tokensPerMinute;
    }

    /** Milliseconds until some model in the list can probably take a request of this size. */
    waitMs(models: string[], tokens: number): number {
        let best = Infinity;
        for (const model of models) {
            const s = this.get(model);
            this.prune(s);
            const cool = Math.max(0, s.cooldownUntil - this.now());
            let budgetWait = 0;
            if (tokens <= s.limit * BUDGET_FRACTION && this.remaining(model) < tokens) {
                // Wait until enough old spending ages out of the window.
                let freed = this.remaining(model);
                budgetWait = WINDOW_MS;
                for (const [at, spentTokens] of s.spent) {
                    freed += spentTokens;
                    if (freed >= tokens) { budgetWait = Math.max(0, at + WINDOW_MS - this.now()); break; }
                }
            }
            best = Math.min(best, Math.max(cool, budgetWait));
        }
        return Number.isFinite(best) ? best : 0;
    }
}

/** A rough token count: about four characters per token for English and code. */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.6);
}
