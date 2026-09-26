/**
 * The synthesiser's voice is quiet by broadcast standards (speech around -22 dBFS RMS), and a quiet voice on a laptop
 * speaker is exactly the one people say they "can't understand". A modest gain fixes that, but only with a limiter:
 * plain multiplication would clip the loud syllables into crackle. Samples below the knee are only scaled; above it
 * they are folded smoothly toward full scale, so peaks round off instead of clipping.
 */
const KNEE = 0.6;

/** Linear gain for a level change in decibels. */
export function gainFromDb(db: number): number {
    return 10 ** (db / 20);
}

/** Scales 16-bit little-endian mono PCM in place, softly limiting anything that would exceed the knee. */
export function applyGain(pcm: Buffer, gain: number): Buffer {
    if (gain === 1) return pcm;
    for (let i = 0; i + 1 < pcm.length; i += 2) {
        const scaled = (pcm.readInt16LE(i) / 32768) * gain;
        const magnitude = Math.abs(scaled);
        const limited = magnitude <= KNEE ? scaled : Math.sign(scaled) * (KNEE + (1 - KNEE) * Math.tanh((magnitude - KNEE) / (1 - KNEE)));
        pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(limited * 32767))), i);
    }
    return pcm;
}
