import { z } from "zod";
import { LANGUAGES } from "../runner/types";
import type { PublicProblem, TestRun } from "./problems";
import type { RoundType } from "./plan";

/** Messages the server pushes to the browser over the WebRTC data channel. */
export type ServerEvent =
    | { type: "ROUND"; index: number; total: number; key: string; title: string; roundType: RoundType; minutes: number }
    | {
          type: "SHOW_CODE_EDITOR";
          /** "code" is a coding problem with tests; "notes" is a scratchpad for system design. */
          mode: "code" | "notes";
          problemNumber: number;
          problemTotal: number;
          problem?: PublicProblem;
          title: string;
          /** The statement text, kept for older clients. */
          question: string;
          language: string;
      }
    | { type: "HIDE_CODE_EDITOR" }
    | { type: "SUBMISSION_RESULT"; problemKey: string; attempt: number; run: TestRun }
    | { type: "CAPTION"; id: string; role: "interviewer" | "candidate"; text: string; final: boolean }
    | { type: "STATE"; state: "thinking" | "listening" | "speaking" | "ending" }
    | { type: "ENDING"; reason: EndReason; interviewId: string }
    | { type: "NOTICE"; level: "info" | "warning"; message: string };

export type EndReason = "completed" | "candidate_ended" | "time_limit" | "disconnected" | "error";

const MAX_CODE_BYTES = 100 * 1024;
const MAX_SNAPSHOT_BYTES = 12 * 1024;

/** Messages the browser may send. Everything is validated: the data channel is untrusted input. */
export const clientMessageSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("SUBMIT_CODE"),
        problemKey: z.string().max(80),
        language: z.enum(LANGUAGES),
        code: z.string().max(MAX_CODE_BYTES),
    }),
    z.object({ type: z.literal("SUBMIT_NOTES"), text: z.string().max(8_000) }),
    /** What is in the editor right now, sent every so often while the candidate types, so the interviewer can see it like a person would. */
    z.object({ type: z.literal("CODE_SNAPSHOT"), problemKey: z.string().max(80), language: z.enum(LANGUAGES), code: z.string().max(MAX_SNAPSHOT_BYTES) }),
    z.object({ type: z.literal("USER_TEXT"), text: z.string().trim().min(1).max(1_500) }),
    /** How well the interviewer's voice is arriving, measured by the browser every few seconds. */
    z.object({
        type: z.literal("CLIENT_STATS"),
        lossPercent: z.number().min(0).max(100),
        concealedPercent: z.number().min(0).max(100),
        jitterMs: z.number().min(0).max(60_000),
        packets: z.number().int().min(0).max(1_000_000),
    }),
    z.object({ type: z.literal("END_INTERVIEW") }),
    z.object({ type: z.literal("PING") }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
