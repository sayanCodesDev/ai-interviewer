/**
 * The interviewer's voice is timed by a 20 ms clock that lives in this process. If the process cannot keep that clock (the
 * computer is busy, a laptop is saving power, something blocks the event loop) the audio leaves in lumps and the voice breaks
 * up, however good the connection is. This watches for that and says so, so the cause shows up in the server's log rather than
 * being blamed on the speech service or the network.
 */
export interface LateWarning {
    /** Ticks in the window that ran later than the threshold. */
    lateTicks: number;
    worstMs: number;
}

export interface LatenessOptions {
    /** How long one measurement lasts. */
    windowMs: number;
    /** A tick later than this (two frames) is one the listener can hear. */
    lateMs: number;
    /** How many late ticks in a window count as "running late" rather than one unlucky pause. */
    minLate: number;
    /** After a warning, stay quiet this long. */
    quietMs: number;
}

const DEFAULTS: LatenessOptions = { windowMs: 10_000, lateMs: 40, minLate: 5, quietMs: 60_000 };

export class LatenessMonitor {
    private windowStartedAt = 0;
    private late = 0;
    private worst = 0;
    private lastWarnAt = Number.NEGATIVE_INFINITY;
    private readonly options: LatenessOptions;

    constructor(options: Partial<LatenessOptions> = {}) {
        this.options = { ...DEFAULTS, ...options };
    }

    /** Records one tick. Returns a warning when a measurement window ends with the clock having run late too often. */
    note(latenessMs: number, now: number): LateWarning | null {
        if (this.windowStartedAt === 0) this.windowStartedAt = now;
        if (latenessMs > this.options.lateMs) {
            this.late++;
            this.worst = Math.max(this.worst, latenessMs);
        }
        if (now - this.windowStartedAt < this.options.windowMs) return null;

        const warning = this.late >= this.options.minLate && now - this.lastWarnAt >= this.options.quietMs ? { lateTicks: this.late, worstMs: Math.round(this.worst) } : null;
        if (warning) this.lastWarnAt = now;
        this.windowStartedAt = now;
        this.late = 0;
        this.worst = 0;
        return warning;
    }
}
