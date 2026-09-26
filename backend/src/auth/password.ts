import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";
import { z } from "zod";

// Argon2id runs on libuv's thread pool, so hashing never stalls the event loop that paces
// live interview audio (bcryptjs runs on the main thread). Parameters follow OWASP's minimum.
const ARGON_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt silently ignores everything past 72 bytes; refuse rather than truncate. */
export const PASSWORD_MAX_BYTES = 72;

const COMMON_PASSWORDS = new Set([
    "password", "password1", "password12", "password123", "password1234", "passw0rd123", "1234567890", "12345678910",
    "123456789012", "qwertyuiop", "qwerty12345", "qwerty123456", "1q2w3e4r5t", "iloveyou123", "letmein1234", "welcome1234",
    "admin12345", "administrator", "abc1234567", "abcdefghij", "111111111111", "0123456789", "changeme123", "trustno1234",
    "football123", "baseball123", "monkey12345", "dragon12345", "master12345", "sunshine123", "princess123", "superman123",
    "passwordpassword", "correcthorse", "mypassword123", "helloworld123", "internet123", "computer123", "whatever123",
]);

/** Shared by signup and any future password change. */
export const passwordSchema = z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
    .refine((value) => Buffer.byteLength(value, "utf8") <= PASSWORD_MAX_BYTES, `Use at most ${PASSWORD_MAX_BYTES} bytes.`)
    .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), "That password is too common. Pick something less guessable.")
    .refine((value) => new Set(value).size >= 4, "Use a few different characters.");

export function hashPassword(password: string): Promise<string> {
    return argonHash(password, ARGON_OPTIONS);
}

function isLegacyBcrypt(stored: string): boolean {
    return stored.startsWith("$2");
}

/** Verifies against argon2id, or against a legacy bcrypt hash from before the upgrade. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
    try {
        if (isLegacyBcrypt(stored)) return await bcrypt.compare(password, stored);
        return await argonVerify(stored, password);
    } catch {
        return false;
    }
}

/** Old bcrypt hashes are upgraded to argon2id the next time the user signs in. */
export function needsRehash(stored: string): boolean {
    return isLegacyBcrypt(stored);
}

let dummyHash: Promise<string> | null = null;

/**
 * Spends the same time as a real check when the email is unknown, so response timing
 * does not reveal which addresses have accounts.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
    dummyHash ??= hashPassword("timing-equaliser-not-a-real-password");
    await verifyPassword(await dummyHash, password);
}
