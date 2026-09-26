/**
 * Makes text easy to hear. The interviewer's words are shown as written, but a speech synthesiser reads
 * "O(n log n)" as a jumble, "k8s" as three letters and "->" as nothing at all. That is fine for a chat
 * window and unintelligible aloud, in exactly the kind of conversation where these appear constantly.
 *
 * Only patterns that are certainly code, maths or shorthand are rewritten. Ordinary prose passes through untouched.
 */

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const ORDINALS: Record<string, string> = { "2": "squared", "3": "cubed", "4": "to the fourth", "5": "to the fifth", "6": "to the sixth" };

function word(n: string): string {
    const value = Number(n);
    return Number.isInteger(value) && value >= 0 && value <= 10 ? ONES[value]! : n;
}

/** "n^2" -> "n squared", "2^n" -> "two to the n", "10^5" -> "ten to the fifth". */
function power(base: string, exponent: string): string {
    const baseWords = /^\d+$/.test(base) ? word(base) : base;
    if (ORDINALS[exponent]) return `${baseWords} ${ORDINALS[exponent]}`;
    return `${baseWords} to the ${/^\d+$/.test(exponent) ? word(exponent) : exponent}`;
}

const SIMPLE_REPLACEMENTS: Array<[RegExp, string]> = [
    [/\be\.g\.,?/gi, "for example,"],
    [/\bi\.e\.,?/gi, "that is,"],
    [/\bvs\.?(?=\s)/gi, "versus"],
    [/\betc\./gi, "et cetera"],
    [/\bapprox\./gi, "approximately"],
    [/\bw\/o\b/gi, "without"],
    [/\bw\/(?=\s)/gi, "with"],
    [/\bk8s\b/gi, "Kubernetes"],
    [/\bnginx\b/gi, "engine X"],
    [/\bkubectl\b/gi, "kube control"],
    [/\bgRPC\b/g, "gee R P C"],
    [/\bOAuth\b/g, "oh auth"],
    [/\bNoSQL\b/g, "no sequel"],
    [/\bSQL\b/g, "sequel"],
    [/\bCI\/CD\b/g, "C I C D"],
    [/\bI\/O\b/g, "I O"],
    [/\bTCP\/IP\b/g, "T C P I P"],
];

const SYMBOLS: Array<[RegExp, string]> = [
    [/\s*(?:->|→|=>)\s*/g, " to "],
    [/\s*(?:<=|≤)\s*/g, " is at most "],
    [/\s*(?:>=|≥)\s*/g, " is at least "],
    [/\s*(?:!=|≠)\s*/g, " is not equal to "],
    [/\s*===?\s*/g, " equals "],
    [/\s*&&\s*/g, " and "],
    [/\s*\|\|\s*/g, " or "],
    [/\s+&\s+/g, " and "],
    [/\s+\+\s+/g, " plus "],
    [/(\d)\s*%/g, "$1 percent"],
    [/\s*—\s*|\s+--\s+/g, ", "],
];

export function speechText(input: string): string {
    let text = input;

    // Big-O and similar: O(n log n) -> "O of n log n". Do this first: it contains brackets and carets.
    text = text.replace(/(?<![\p{L}\p{N}_])([OΘΩ]|Big-?O)\(([^()]{1,40})\)/gu, (_m, symbol: string, inner: string) => {
        const spoken = inner
            .replace(/\b(\w+)\s*\^\s*(\w+)\b/g, (_x, base: string, exponent: string) => power(base, exponent))
            .replace(/\blog\s*\(?\s*(\w+)\s*\)?/gi, "log $1")
            .replace(/\*/g, " times ")
            .replace(/^\s*1\s*$/, "one")
            .replace(/\s+/g, " ")
            .trim();
        const letter = /Big/i.test(symbol) ? "Big O" : symbol === "O" ? "O" : symbol === "Θ" ? "theta" : "omega";
        return `${letter} of ${spoken}`;
    });

    // Powers outside Big-O: 10^5, n^2, 2^n.
    text = text.replace(/\b(\d+|[a-zA-Z])\s*\^\s*(\d+|[a-zA-Z])\b/g, (_m, base: string, exponent: string) => power(base, exponent));
    // Scientific shorthand: 1e9, 1e5.
    text = text.replace(/\b1e(\d)\b/g, (_m, n: string) => `ten to the ${word(n)}`);

    for (const [pattern, replacement] of SIMPLE_REPLACEMENTS) text = text.replace(pattern, replacement);
    for (const [pattern, replacement] of SYMBOLS) text = text.replace(pattern, replacement);

    // Web addresses: "github.com/user/repo" is spoken as a person would say it.
    text = text.replace(/\bhttps?:\/\/(\S+)/gi, "$1");
    text = text.replace(/\b((?:[a-z0-9-]+\.)+(?:com|org|io|dev|net|app|ai))((?:\/[\w./-]*[\w/-])?)/gi, (_m, host: string, path: string) =>
        `${host.replace(/\./g, " dot ")}${path ? path.replace(/\//g, " slash ").replace(/\./g, " dot ") : ""}`,
    );

    // Identifiers: snake_case and camelCase are read as separate words, and call parentheses are dropped.
    text = text.replace(/\b([a-z]+(?:_[a-z0-9]+)+)\b/g, (m) => m.replace(/_/g, " "));
    text = text.replace(/\b([a-z]+[a-z0-9]*(?:[A-Z][a-z0-9]+)+)\b/g, (m) => m.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase());
    text = text.replace(/\b([A-Za-z_][\w. ]{0,30}?)\(\)/g, "$1");

    // Emoji and stray formatting characters.
    text = text.replace(/[\p{Extended_Pictographic}‍️]/gu, "");
    text = text.replace(/[`*_#~|<>{}\\]/g, " ");

    return text.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

/** About how long a piece of text takes to say: the synthesiser's voices average roughly 65 ms per character. */
export function estimateSpeechMs(text: string): number {
    return Math.round(text.length * 65);
}
