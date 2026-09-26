import { sanitizeUntrusted } from "./untrusted";

export const MAX_RESUME_BYTES = 2 * 1024 * 1024;
export const MAX_RESUME_CHARS = 8_000;
const MAX_PDF_PAGES = 12;

export class ResumeError extends Error {}

export interface UploadedFile {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
}

function looksLikePdf(buffer: Buffer): boolean {
    return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

function looksLikeText(buffer: Buffer): boolean {
    // Plain text has almost no control bytes; a renamed binary has many.
    const sample = buffer.subarray(0, 4_000);
    let odd = 0;
    for (const byte of sample) if (byte < 9 || (byte > 13 && byte < 32)) odd++;
    return odd / Math.max(1, sample.length) < 0.01;
}

/**
 * Pulls the text out of an uploaded resume (PDF or plain text). The file type is decided by the
 * file's content, not its claimed type or name, and the text is cleaned before anything else sees it.
 */
export async function extractResumeText(file: UploadedFile): Promise<string> {
    if (file.buffer.length === 0) throw new ResumeError("That file is empty.");
    if (file.buffer.length > MAX_RESUME_BYTES) throw new ResumeError("That file is larger than 2 MB.");

    let raw: string;
    if (looksLikePdf(file.buffer)) {
        try {
            const { extractText, getDocumentProxy } = await import("unpdf");
            const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
            if (pdf.numPages > MAX_PDF_PAGES) throw new ResumeError(`That PDF has more than ${MAX_PDF_PAGES} pages. Upload a shorter resume.`);
            const { text } = await extractText(pdf, { mergePages: true });
            raw = Array.isArray(text) ? text.join("\n") : text;
        } catch (error) {
            if (error instanceof ResumeError) throw error;
            throw new ResumeError("We couldn't read that PDF. Try exporting it again, or upload plain text.");
        }
    } else if (/\.(txt|md)$/i.test(file.originalname) || file.mimetype.startsWith("text/")) {
        if (!looksLikeText(file.buffer)) throw new ResumeError("That file doesn't look like text or a PDF.");
        raw = file.buffer.toString("utf8");
    } else {
        throw new ResumeError("Upload a PDF or a plain text file.");
    }

    const cleaned = sanitizeUntrusted(raw, MAX_RESUME_CHARS);
    if (cleaned.length < 30) throw new ResumeError("We couldn't find any text in that file. If it's a scan, paste the text into the job description box instead.");
    return cleaned;
}
