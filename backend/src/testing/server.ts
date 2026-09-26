import type { AddressInfo } from "node:net";
import type { Express } from "express";

export interface TestServer {
    url: string;
    close: () => Promise<void>;
}

export async function startServer(app: Express): Promise<TestServer> {
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}`,
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.closeAllConnections?.();
                server.close((error) => (error ? reject(error) : resolve()));
            }),
    };
}

/** A tiny HTTP client with a cookie jar, standing in for a browser. */
export class TestClient {
    private cookies = new Map<string, string>();
    accessToken: string | null = null;

    constructor(private readonly baseUrl: string, private readonly origin = "http://localhost:3000") {}

    setCookie(name: string, value: string | null): void {
        if (value === null) this.cookies.delete(name);
        else this.cookies.set(name, value);
    }

    getCookie(name: string): string | undefined {
        return this.cookies.get(name);
    }

    async request(
        method: string,
        path: string,
        options: { body?: unknown; auth?: boolean | string; headers?: Record<string, string>; sendCookies?: boolean; rawBody?: string } = {},
    ): Promise<{ status: number; body: any; headers: Headers; setCookies: string[] }> {
        const headers: Record<string, string> = { Origin: this.origin, ...options.headers };
        if (options.body !== undefined || options.rawBody !== undefined) headers["Content-Type"] = "application/json";
        const token = typeof options.auth === "string" ? options.auth : options.auth === false ? null : this.accessToken;
        if (token) headers.Authorization = `Bearer ${token}`;
        if (options.sendCookies !== false && this.cookies.size > 0) {
            headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers,
            body: options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
        });

        const setCookies = response.headers.getSetCookie();
        for (const line of setCookies) {
            const [pair] = line.split(";");
            const eq = pair!.indexOf("=");
            const name = pair!.slice(0, eq).trim();
            const value = pair!.slice(eq + 1).trim();
            if (value === "" || /expires=thu, 01 jan 1970/i.test(line)) this.cookies.delete(name);
            else this.cookies.set(name, value);
        }

        const text = await response.text();
        let body: any = text;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            /* leave as text */
        }
        return { status: response.status, body, headers: response.headers, setCookies };
    }

    get(path: string, options?: Parameters<TestClient["request"]>[2]) {
        return this.request("GET", path, options);
    }
    post(path: string, body?: unknown, options?: Parameters<TestClient["request"]>[2]) {
        return this.request("POST", path, { ...options, body });
    }
}
