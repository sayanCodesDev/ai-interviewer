import { api } from "@/lib/api";
import type { InterviewListItem, InterviewMeta, InterviewOptions, Language, ReportResponse, TestRun } from "@/lib/types";

export async function fetchOptions(): Promise<InterviewOptions> {
    return (await api.get<InterviewOptions>("/api/interview-options")).data;
}

export async function createInterview(form: FormData): Promise<{ id: string }> {
    return (await api.post<{ id: string }>("/api/interviews", form)).data;
}

export async function fetchInterview(id: string): Promise<InterviewMeta> {
    return (await api.get<InterviewMeta>(`/api/interviews/${id}`)).data;
}

export async function listInterviews(cursor?: string): Promise<{ items: InterviewListItem[]; nextCursor: string | null }> {
    return (await api.get("/api/interviews", { params: { limit: 20, cursor } })).data;
}

export async function deleteInterview(id: string): Promise<void> {
    await api.delete(`/api/interviews/${id}`);
}

export async function fetchReport(id: string): Promise<ReportResponse> {
    return (await api.get<ReportResponse>(`/api/interviews/${id}/report`)).data;
}

export async function retryReport(id: string): Promise<void> {
    await api.post(`/api/interviews/${id}/report/retry`);
}

export async function endInterviewOverHttp(id: string): Promise<void> {
    await api.post(`/api/interviews/${id}/end`);
}

export async function runCode(id: string, body: { problemKey: string; language: Language; code: string; mode: "examples" | "custom"; args?: unknown[] }): Promise<TestRun> {
    return (await api.post<{ run: TestRun }>(`/api/interviews/${id}/run`, body)).data.run;
}

export async function deleteAccount(password: string): Promise<void> {
    await api.delete("/api/account", { data: { password } });
}
