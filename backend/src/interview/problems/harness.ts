import type { Language, RunJob } from "../../runner/types";
import type { ParamType, Signature } from "./types";

/**
 * Turns a problem signature into (a) the starter code a candidate sees and (b) the test driver that is
 * appended to their code. The driver reads test inputs from stdin, calls the candidate's function,
 * and prints each result between markers that carry a per-run token, so the candidate's own prints
 * cannot forge a result:
 *
 *   \n@@<token>|B|<id>\n            a test begins
 *   \n@@<token>|R|<id>|<µs>|<json>\n   ...and returned
 *   \n@@<token>|E|<id>|<message>\n     ...or threw
 *
 * Stdin layout: token line, test count, then per test an id line followed by one JSON line per parameter.
 */

const CPP_PRELUDE = "#include <bits/stdc++.h>\nusing namespace std;\n";
export const CPP_PRELUDE_LINES = CPP_PRELUDE.split("\n").length - 1;

const snake = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// ---------------------------------------------------------------------------------- type tables

const TS_TYPES: Record<ParamType, string> = {
    int: "number", long: "number", double: "number", bool: "boolean", string: "string",
    "int[]": "number[]", "double[]": "number[]", "bool[]": "boolean[]", "string[]": "string[]",
    "int[][]": "number[][]", "string[][]": "string[][]",
};

const PY_TYPES: Record<ParamType, string> = {
    int: "int", long: "int", double: "float", bool: "bool", string: "str",
    "int[]": "List[int]", "double[]": "List[float]", "bool[]": "List[bool]", "string[]": "List[str]",
    "int[][]": "List[List[int]]", "string[][]": "List[List[str]]",
};

const JAVA_TYPES: Record<ParamType, string> = {
    int: "int", long: "long", double: "double", bool: "boolean", string: "String",
    "int[]": "int[]", "double[]": "double[]", "bool[]": "boolean[]", "string[]": "String[]",
    "int[][]": "int[][]", "string[][]": "String[][]",
};

const CPP_TYPES: Record<ParamType, string> = {
    int: "int", long: "long long", double: "double", bool: "bool", string: "string",
    "int[]": "vector<int>", "double[]": "vector<double>", "bool[]": "vector<bool>", "string[]": "vector<string>",
    "int[][]": "vector<vector<int>>", "string[][]": "vector<vector<string>>",
};

const JAVA_READERS: Record<ParamType, string> = {
    int: "readInt", long: "readLong", double: "readDouble", bool: "readBool", string: "readString",
    "int[]": "readIntArr", "double[]": "readDoubleArr", "bool[]": "readBoolArr", "string[]": "readStringArr",
    "int[][]": "readIntMat", "string[][]": "readStringMat",
};

const JAVA_DEFAULTS: Record<ParamType, string> = {
    int: "0", long: "0L", double: "0.0", bool: "false", string: '""',
    "int[]": "new int[0]", "double[]": "new double[0]", "bool[]": "new boolean[0]", "string[]": "new String[0]",
    "int[][]": "new int[0][]", "string[][]": "new String[0][]",
};

const PY_DEFAULTS: Record<ParamType, string> = {
    int: "0", long: "0", double: "0.0", bool: "False", string: '""',
    "int[]": "[]", "double[]": "[]", "bool[]": "[]", "string[]": "[]", "int[][]": "[]", "string[][]": "[]",
};

const JS_DOC_TYPES: Record<ParamType, string> = {
    int: "number", long: "number", double: "number", bool: "boolean", string: "string",
    "int[]": "number[]", "double[]": "number[]", "bool[]": "boolean[]", "string[]": "string[]",
    "int[][]": "number[][]", "string[][]": "string[][]",
};

// ---------------------------------------------------------------------------------------- starters

export function starterCode(sig: Signature, language: Language): string {
    const params = sig.params;
    switch (language) {
        case "javascript": {
            const docs = params.map((p) => ` * @param {${JS_DOC_TYPES[p.type]}} ${p.name}`).join("\n");
            return `/**\n${docs}\n * @return {${JS_DOC_TYPES[sig.returns]}}\n */\nfunction ${sig.name}(${params.map((p) => p.name).join(", ")}) {\n  // Write your solution here\n\n}\n`;
        }
        case "typescript":
            return `function ${sig.name}(${params.map((p) => `${p.name}: ${TS_TYPES[p.type]}`).join(", ")}): ${TS_TYPES[sig.returns]} {\n  // Write your solution here\n\n}\n`;
        case "python": {
            const uses = [...params.map((p) => p.type), sig.returns].some((t) => t.endsWith("[]"));
            const args = params.map((p) => `${snake(p.name)}: ${PY_TYPES[p.type]}`).join(", ");
            return `${uses ? "from typing import List\n\n" : ""}def ${snake(sig.name)}(${args}) -> ${PY_TYPES[sig.returns]}:\n    # Write your solution here\n    return ${PY_DEFAULTS[sig.returns]}\n`;
        }
        case "java": {
            const args = params.map((p) => `${JAVA_TYPES[p.type]} ${p.name}`).join(", ");
            return `import java.util.*;\n\nclass Solution {\n    public ${JAVA_TYPES[sig.returns]} ${sig.name}(${args}) {\n        // Write your solution here\n        return ${JAVA_DEFAULTS[sig.returns]};\n    }\n}\n`;
        }
        case "cpp": {
            const args = params.map((p) => `${CPP_TYPES[p.type]}${p.type.endsWith("[]") ? "&" : ""} ${p.name}`).join(", ");
            return `#include <bits/stdc++.h>\nusing namespace std;\n\n${CPP_TYPES[sig.returns]} ${sig.name}(${args}) {\n    // Write your solution here\n    return {};\n}\n`;
        }
    }
}

// --------------------------------------------------------------------------------------- drivers

function jsEpilogue(sig: Signature): string {
    const reads = sig.params.map(() => "JSON.parse(lines[p++])").join(", ");
    return String.raw`

import * as __fs from "node:fs";
{
    // writeSync on a pipe can write only part of a large buffer, or fail with EAGAIN while the reader
    // catches up, so loop until every byte is out.
    const __write = (s) => {
        const buf = Buffer.from(s, "utf8");
        let off = 0;
        while (off < buf.length) {
            try {
                off += __fs.writeSync(1, buf, off, buf.length - off);
            } catch (e) {
                if (e && e.code === "EAGAIN") { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2); continue; }
                throw e;
            }
        }
    };
    // Route the candidate's prints through the same synchronous channel so output stays in order.
    process.stdout.write = (chunk) => { __write(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8")); return true; };
    const lines = __fs.readFileSync(0, "utf8").split("\n");
    let p = 0;
    const token = lines[p++];
    const count = parseInt(lines[p++], 10);
    for (let t = 0; t < count; t++) {
        const id = lines[p++];
        const args = [${reads}];
        __write("\n@@" + token + "|B|" + id + "\n");
        const started = process.hrtime.bigint();
        try {
            if (typeof ${sig.name} !== "function") throw new Error("Function ${sig.name} is not defined. Keep the function name from the starter code.");
            let result = ${sig.name}(...args);
            if (result && typeof result.then === "function") result = await result;
            const micros = Number((process.hrtime.bigint() - started) / 1000n);
            __write("\n@@" + token + "|R|" + id + "|" + micros + "|" + JSON.stringify(result === undefined ? null : result) + "\n");
        } catch (error) {
            const message = String(error && error.message !== undefined ? error.name + ": " + error.message : error).split("\n").join(" ").slice(0, 500);
            __write("\n@@" + token + "|E|" + id + "|" + message + "\n");
        }
    }
}
`;
}

function pyEpilogue(sig: Signature): string {
    const n = sig.params.length;
    return String.raw`


import sys as __sys, json as __json, time as __time, threading as __threading

def __harness_main():
    lines = __sys.stdin.read().split("\n")
    p = 0
    token = lines[p]; p += 1
    count = int(lines[p]); p += 1
    out = __sys.stdout
    for _ in range(count):
        tid = lines[p]; p += 1
        args = [__json.loads(lines[p + i]) for i in range(${n})]; p += ${n}
        out.write("\n@@%s|B|%s\n" % (token, tid)); out.flush()
        started = __time.perf_counter()
        try:
            result = ${snake(sig.name)}(*args)
            micros = int((__time.perf_counter() - started) * 1e6)
            out.write("\n@@%s|R|%s|%d|%s\n" % (token, tid, micros, __json.dumps(result)))
        except BaseException as error:
            message = (type(error).__name__ + ": " + str(error)).replace("\n", " ")[:500]
            out.write("\n@@%s|E|%s|%s\n" % (token, tid, message))
        out.flush()

__sys.setrecursionlimit(50000)
__threading.stack_size(256 * 1024 * 1024)
__thread = __threading.Thread(target=__harness_main)
__thread.start()
__thread.join()
`;
}

const CPP_RUNTIME = String.raw`

namespace __h {
struct P {
    const string& s; size_t i = 0;
    explicit P(const string& x) : s(x) {}
    void ws() { while (i < s.size() && (s[i] == ' ' || s[i] == '\t' || s[i] == '\r')) i++; }
    bool eat(char c) { ws(); if (i < s.size() && s[i] == c) { i++; return true; } return false; }
    void need(char c) { if (!eat(c)) throw runtime_error("malformed test input"); }
    string num() { ws(); size_t st = i; while (i < s.size() && strchr("+-0123456789.eE", s[i])) i++; return s.substr(st, i - st); }
};
template <class T> struct R;
template <> struct R<int> { static int get(P& p) { return stoi(p.num()); } };
template <> struct R<long long> { static long long get(P& p) { return stoll(p.num()); } };
template <> struct R<double> { static double get(P& p) { return stod(p.num()); } };
template <> struct R<bool> {
    static bool get(P& p) {
        p.ws();
        if (p.s.compare(p.i, 4, "true") == 0) { p.i += 4; return true; }
        if (p.s.compare(p.i, 5, "false") == 0) { p.i += 5; return false; }
        throw runtime_error("malformed test input");
    }
};
static void putUtf8(string& out, unsigned cp) {
    if (cp < 0x80) out += (char)cp;
    else if (cp < 0x800) { out += (char)(0xC0 | (cp >> 6)); out += (char)(0x80 | (cp & 0x3F)); }
    else if (cp < 0x10000) { out += (char)(0xE0 | (cp >> 12)); out += (char)(0x80 | ((cp >> 6) & 0x3F)); out += (char)(0x80 | (cp & 0x3F)); }
    else { out += (char)(0xF0 | (cp >> 18)); out += (char)(0x80 | ((cp >> 12) & 0x3F)); out += (char)(0x80 | ((cp >> 6) & 0x3F)); out += (char)(0x80 | (cp & 0x3F)); }
}
template <> struct R<string> {
    static string get(P& p) {
        p.need('"'); string out;
        while (p.i < p.s.size() && p.s[p.i] != '"') {
            char c = p.s[p.i++];
            if (c != '\\') { out += c; continue; }
            char e = p.s[p.i++];
            switch (e) {
                case 'n': out += '\n'; break; case 't': out += '\t'; break; case 'r': out += '\r'; break;
                case 'b': out += '\b'; break; case 'f': out += '\f'; break;
                case 'u': {
                    unsigned cp = stoul(p.s.substr(p.i, 4), nullptr, 16); p.i += 4;
                    if (cp >= 0xD800 && cp < 0xDC00 && p.s.compare(p.i, 2, "\\u") == 0) {
                        unsigned lo = stoul(p.s.substr(p.i + 2, 4), nullptr, 16); p.i += 6;
                        cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                    }
                    putUtf8(out, cp); break;
                }
                default: out += e;
            }
        }
        p.need('"'); return out;
    }
};
template <class T> struct R<vector<T>> {
    static vector<T> get(P& p) {
        vector<T> v; p.need('[');
        if (p.eat(']')) return v;
        do { v.push_back(R<T>::get(p)); } while (p.eat(','));
        p.need(']'); return v;
    }
};

void W(ostream& o, int v) { o << v; }
void W(ostream& o, long long v) { o << v; }
void W(ostream& o, double v) { if (!isfinite(v)) { o << "null"; return; } ostringstream t; t << setprecision(17) << v; o << t.str(); }
void W(ostream& o, bool v) { o << (v ? "true" : "false"); }
void W(ostream& o, const string& v) {
    o << '"';
    for (unsigned char c : v) {
        switch (c) {
            case '"': o << "\\\""; break; case '\\': o << "\\\\"; break; case '\n': o << "\\n"; break;
            case '\r': o << "\\r"; break; case '\t': o << "\\t"; break;
            default: if (c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); o << b; } else o << (char)c;
        }
    }
    o << '"';
}
template <class T> void W(ostream& o, const vector<T>& v) {
    o << '[';
    for (size_t i = 0; i < v.size(); i++) { if (i) o << ','; typename vector<T>::value_type x = v[i]; W(o, x); }
    o << ']';
}
static string oneLine(string s) { for (char& c : s) if (c == '\n' || c == '\r') c = ' '; return s.substr(0, 500); }
}  // namespace __h
`;

function cppEpilogue(sig: Signature): string {
    const readArgs = sig.params
        .map((p, i) => `        string l${i}; getline(cin, l${i}); __h::P p${i}(l${i}); ${CPP_TYPES[p.type]} a${i} = __h::R<${CPP_TYPES[p.type]}>::get(p${i});`)
        .join("\n");
    const call = `${sig.name}(${sig.params.map((_, i) => `a${i}`).join(", ")})`;
    return `${CPP_RUNTIME}
int main() {
    string token, line;
    getline(cin, token); getline(cin, line);
    int count = stoi(line);
    for (int t = 0; t < count; t++) {
        string id; getline(cin, id);
        try {
${readArgs}
            cout << "\\n@@" << token << "|B|" << id << "\\n" << flush;
            auto started = chrono::steady_clock::now();
            auto result = ${call};
            long long micros = chrono::duration_cast<chrono::microseconds>(chrono::steady_clock::now() - started).count();
            ostringstream os; __h::W(os, result);
            cout << "\\n@@" << token << "|R|" << id << "|" << micros << "|" << os.str() << "\\n" << flush;
        } catch (const exception& e) {
            cout << "\\n@@" << token << "|E|" << id << "|" << __h::oneLine(e.what()) << "\\n" << flush;
        } catch (...) {
            cout << "\\n@@" << token << "|E|" << id << "|unknown exception\\n" << flush;
        }
    }
    return 0;
}
`;
}

const JAVA_RUNTIME = String.raw`
    static final class P {
        final String s; int i = 0;
        P(String s) { this.s = s; }
        void ws() { while (i < s.length() && (s.charAt(i) == ' ' || s.charAt(i) == '\t' || s.charAt(i) == '\r')) i++; }
        boolean eat(char c) { ws(); if (i < s.length() && s.charAt(i) == c) { i++; return true; } return false; }
        void need(char c) { if (!eat(c)) throw new RuntimeException("malformed test input"); }
        String num() { ws(); int st = i; while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++; return s.substring(st, i); }
        int readInt() { return Integer.parseInt(num()); }
        long readLong() { return Long.parseLong(num()); }
        double readDouble() { return Double.parseDouble(num()); }
        boolean readBool() {
            ws();
            if (s.startsWith("true", i)) { i += 4; return true; }
            if (s.startsWith("false", i)) { i += 5; return false; }
            throw new RuntimeException("malformed test input");
        }
        String readString() {
            need('"'); StringBuilder out = new StringBuilder();
            while (i < s.length() && s.charAt(i) != '"') {
                char c = s.charAt(i++);
                if (c != '\\') { out.append(c); continue; }
                char e = s.charAt(i++);
                switch (e) {
                    case 'n': out.append('\n'); break; case 't': out.append('\t'); break; case 'r': out.append('\r'); break;
                    case 'b': out.append('\b'); break; case 'f': out.append('\f'); break;
                    case 'u': out.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                    default: out.append(e);
                }
            }
            need('"'); return out.toString();
        }
        int[] readIntArr() { List<Integer> l = new ArrayList<>(); need('['); if (!eat(']')) { do { l.add(readInt()); } while (eat(',')); need(']'); } int[] r = new int[l.size()]; for (int k = 0; k < r.length; k++) r[k] = l.get(k); return r; }
        double[] readDoubleArr() { List<Double> l = new ArrayList<>(); need('['); if (!eat(']')) { do { l.add(readDouble()); } while (eat(',')); need(']'); } double[] r = new double[l.size()]; for (int k = 0; k < r.length; k++) r[k] = l.get(k); return r; }
        boolean[] readBoolArr() { List<Boolean> l = new ArrayList<>(); need('['); if (!eat(']')) { do { l.add(readBool()); } while (eat(',')); need(']'); } boolean[] r = new boolean[l.size()]; for (int k = 0; k < r.length; k++) r[k] = l.get(k); return r; }
        String[] readStringArr() { List<String> l = new ArrayList<>(); need('['); if (!eat(']')) { do { l.add(readString()); } while (eat(',')); need(']'); } return l.toArray(new String[0]); }
        int[][] readIntMat() { List<int[]> l = new ArrayList<>(); need('['); if (!eat(']')) { do { l.add(readIntArr()); } while (eat(',')); need(']'); } return l.toArray(new int[0][]); }
        String[][] readStringMat() { List<String[]> l = new ArrayList<>(); need('['); if (!eat(']')) { do { l.add(readStringArr()); } while (eat(',')); need(']'); } return l.toArray(new String[0][]); }
    }

    static void w(StringBuilder o, int v) { o.append(v); }
    static void w(StringBuilder o, long v) { o.append(v); }
    static void w(StringBuilder o, double v) { if (Double.isNaN(v) || Double.isInfinite(v)) o.append("null"); else o.append(v); }
    static void w(StringBuilder o, boolean v) { o.append(v ? "true" : "false"); }
    static void w(StringBuilder o, String v) {
        if (v == null) { o.append("null"); return; }
        o.append('"');
        for (int k = 0; k < v.length(); k++) {
            char c = v.charAt(k);
            switch (c) {
                case '"': o.append("\\\""); break; case '\\': o.append("\\\\"); break; case '\n': o.append("\\n"); break;
                case '\r': o.append("\\r"); break; case '\t': o.append("\\t"); break;
                default: if (c < 0x20) o.append(String.format("\\u%04x", (int) c)); else o.append(c);
            }
        }
        o.append('"');
    }
    static void w(StringBuilder o, int[] v) { if (v == null) { o.append("null"); return; } o.append('['); for (int k = 0; k < v.length; k++) { if (k > 0) o.append(','); w(o, v[k]); } o.append(']'); }
    static void w(StringBuilder o, double[] v) { if (v == null) { o.append("null"); return; } o.append('['); for (int k = 0; k < v.length; k++) { if (k > 0) o.append(','); w(o, v[k]); } o.append(']'); }
    static void w(StringBuilder o, boolean[] v) { if (v == null) { o.append("null"); return; } o.append('['); for (int k = 0; k < v.length; k++) { if (k > 0) o.append(','); w(o, v[k]); } o.append(']'); }
    static void w(StringBuilder o, String[] v) { if (v == null) { o.append("null"); return; } o.append('['); for (int k = 0; k < v.length; k++) { if (k > 0) o.append(','); w(o, v[k]); } o.append(']'); }
    static void w(StringBuilder o, int[][] v) { if (v == null) { o.append("null"); return; } o.append('['); for (int k = 0; k < v.length; k++) { if (k > 0) o.append(','); w(o, v[k]); } o.append(']'); }
    static void w(StringBuilder o, String[][] v) { if (v == null) { o.append("null"); return; } o.append('['); for (int k = 0; k < v.length; k++) { if (k > 0) o.append(','); w(o, v[k]); } o.append(']'); }
    static String oneLine(String s) { if (s == null) return ""; s = s.replace('\n', ' ').replace('\r', ' '); return s.length() > 500 ? s.substring(0, 500) : s; }
`;

function javaMain(sig: Signature): string {
    const reads = sig.params
        .map((p, i) => `            String l${i} = in.readLine(); ${JAVA_TYPES[p.type]} a${i} = new P(l${i}).${JAVA_READERS[p.type]}();`)
        .join("\n");
    const call = `sol.${sig.name}(${sig.params.map((_, i) => `a${i}`).join(", ")})`;
    return `import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class Main {
${JAVA_RUNTIME}
    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        System.setOut(new PrintStream(new FileOutputStream(FileDescriptor.out), true, "UTF-8"));
        String token = in.readLine();
        int count = Integer.parseInt(in.readLine().trim());
        Solution sol = new Solution();
        for (int t = 0; t < count; t++) {
            String id = in.readLine();
            try {
${reads}
                System.out.print("\\n@@" + token + "|B|" + id + "\\n");
                long started = System.nanoTime();
                ${JAVA_TYPES[sig.returns]} result = ${call};
                long micros = (System.nanoTime() - started) / 1000;
                StringBuilder sb = new StringBuilder();
                w(sb, result);
                System.out.print("\\n@@" + token + "|R|" + id + "|" + micros + "|" + sb + "\\n");
            } catch (Throwable e) {
                System.out.print("\\n@@" + token + "|E|" + id + "|" + oneLine(e.getClass().getSimpleName() + ": " + e.getMessage()) + "\\n");
            }
            System.out.flush();
        }
    }
}
`;
}

// ------------------------------------------------------------------------------------- job builder

export interface HarnessTest {
    id: string;
    args: unknown[];
}

export type BuildResult = { ok: true; job: RunJob; token: string } | { ok: false; message: string };

function stdinFor(token: string, tests: HarnessTest[]): string {
    const lines: string[] = [token, String(tests.length)];
    for (const test of tests) {
        lines.push(test.id);
        for (const arg of test.args) lines.push(JSON.stringify(arg));
    }
    return lines.join("\n") + "\n";
}

/** Combines the candidate's code with the driver for their language, ready for the runner. */
export function buildRunJob(
    sig: Signature,
    language: Language,
    code: string,
    tests: HarnessTest[],
    token: string,
    limits: { runTimeoutMs: number; compileTimeoutMs?: number },
): BuildResult {
    const stdin = stdinFor(token, tests);
    const base = { stdin, runTimeoutMs: limits.runTimeoutMs, compileTimeoutMs: limits.compileTimeoutMs ?? 20_000, maxOutputBytes: 4 * 1024 * 1024 };

    switch (language) {
        case "javascript":
            return { ok: true, token, job: { ...base, language, files: { "main.mjs": code + jsEpilogue(sig) } } };
        case "typescript":
            return { ok: true, token, job: { ...base, language, files: { "main.ts": code + jsEpilogue(sig) } } };
        case "python":
            return { ok: true, token, job: { ...base, language, files: { "main.py": code + pyEpilogue(sig) } } };
        case "cpp": {
            if (/\bint\s+main\s*\(/.test(code)) {
                return { ok: false, message: "Remove your main() function. The test harness provides its own, and having two won't compile." };
            }
            return { ok: true, token, job: { ...base, language, files: { "main.cpp": CPP_PRELUDE + code + cppEpilogue(sig) } } };
        }
        case "java":
            return { ok: true, token, job: { ...base, language, files: { "Solution.java": code, "Main.java": javaMain(sig) } } };
    }
}
