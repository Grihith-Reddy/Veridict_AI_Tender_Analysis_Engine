import axios, { isAxiosError } from "axios";
import type {
  BidderUploadResponse,
  CriteriaExtractResponse,
  DemoSeedResponse,
  EvaluateRunResponse,
  TenderUploadResponse,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const api = axios.create({ baseURL: BASE });

export function formatApiError(error: unknown): string {
  if (isAxiosError(error)) {
    const payload = error.response?.data as { detail?: unknown } | undefined;
    const detail = payload?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((part: unknown) => {
          if (part && typeof part === "object" && "msg" in part && typeof (part as { msg: string }).msg === "string") {
            return (part as { msg: string }).msg;
          }
          return JSON.stringify(part);
        })
        .join("; ");
    }
    if (detail !== undefined && detail !== null && typeof detail === "object") {
      try {
        return JSON.stringify(detail);
      } catch {
        /* fall through */
      }
    }
    return error.message || "Request failed";
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function loadDemoSeed(): Promise<DemoSeedResponse> {
  const { data } = await api.post<DemoSeedResponse>("/api/demo/seed");
  return data;
}

export async function uploadTender(file: File): Promise<TenderUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<TenderUploadResponse>("/api/upload/tender", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function uploadBidder(params: {
  file: File;
  sessionId: string;
  bidderName: string;
}): Promise<BidderUploadResponse> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("session_id", params.sessionId);
  form.append("bidder_name", params.bidderName);
  const { data } = await api.post<BidderUploadResponse>("/api/upload/bidder", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function extractCriteria(sessionId: string): Promise<CriteriaExtractResponse> {
  const { data } = await api.post<CriteriaExtractResponse>("/api/evaluate/criteria", { session_id: sessionId });
  return data;
}

export async function resolveAmbiguity(params: {
  sessionId: string;
  criterionId: string;
  resolvedDescription: string;
}): Promise<{ status: string; criterion_id: string }> {
  const { data } = await api.post("/api/evaluate/resolve-ambiguity", {
    session_id: params.sessionId,
    criterion_id: params.criterionId,
    resolved_description: params.resolvedDescription,
  });
  return data;
}

export async function runEvaluation(sessionId: string): Promise<EvaluateRunResponse> {
  const { data } = await api.post<EvaluateRunResponse>("/api/evaluate/run", { session_id: sessionId });
  return data;
}
