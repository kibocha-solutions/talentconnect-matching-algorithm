export type ApiStatus = {
  checkedAt?: string;
  health: "checking" | "reachable" | "unreachable";
  matchEndpoint: "unknown" | "reachable" | "unreachable";
  apiBaseUrl: string;
  provider?: string;
  modelStatus?: string;
  modelLoaded?: boolean;
  message?: string;
};

export type MatchResult = {
  candidate_id: string;
  job_id: string;
  overall_score: number;
  score_breakdown: {
    skills_score: number;
    experience_score: number;
    salary_score: number;
    portfolio_score: number;
  };
  matched_at: string;
};

export type MatchResponsePayload = {
  results: MatchResult[];
  shortlist_size: number;
  retrieval_provider: string;
  retrieval_model: string;
  retrieval_fallback_used: boolean;
};

export type BulkMatchItemPayload = {
  job_id: string;
  results: MatchResult[];
  shortlist_size: number;
  retrieval_provider: string;
  retrieval_model: string;
  retrieval_fallback_used: boolean;
};

export type BulkMatchResponsePayload = {
  matches: BulkMatchItemPayload[];
  candidate_pool_size: number;
  failures: Array<{
    job_id: string;
    error: {
      status: number;
      code?: string;
      message: string;
    };
  }>;
};

export type StructuredApiError = {
  status: number;
  code?: string;
  message: string;
  fieldErrors: Array<{ field: string; message: string }>;
};

type ConfigResponse = {
  embedding_provider?: string;
};

type ModelStatusResponse = {
  status?: string;
  model_loaded?: boolean;
};

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: {
      field_errors?: Array<{ field?: string; message?: string }>;
    };
  };
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function checkApiStatus(): Promise<ApiStatus> {
  const checkedAt = new Date().toISOString();

  try {
    const health = await fetch("/health", { cache: "no-store" });
    if (!health.ok) {
      return unreachable(checkedAt, `Health check returned ${health.status}.`);
    }

    const [configResult, modelResult] = await Promise.allSettled([
      fetchJson<ConfigResponse>("/api/internal/config"),
      fetchJson<ModelStatusResponse>("/api/internal/model/status"),
    ]);

    const config = configResult.status === "fulfilled" ? configResult.value : undefined;
    const model = modelResult.status === "fulfilled" ? modelResult.value : undefined;
    const matchReachable = configResult.status === "fulfilled" ? "reachable" : "unreachable";

    return {
      checkedAt,
      health: "reachable",
      matchEndpoint: matchReachable,
      apiBaseUrl: API_BASE_URL,
      provider: config?.embedding_provider,
      modelStatus: model?.status,
      modelLoaded: model?.model_loaded,
      message:
        matchReachable === "reachable"
          ? "Backend is reachable."
          : "Backend health is reachable, but internal API metadata is unavailable.",
    };
  } catch (error) {
    return unreachable(
      checkedAt,
      error instanceof Error ? error.message : "Backend is not reachable.",
    );
  }
}

export async function runMatchRequest(payload: {
  job: Record<string, unknown>;
  candidates: Array<Record<string, unknown>>;
}): Promise<MatchResponsePayload> {
  const response = await fetch("/api/internal/match", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await toStructuredError(response);
  }

  return (await response.json()) as MatchResponsePayload;
}

export async function runBulkMatchRequest(payload: {
  jobs: Array<Record<string, unknown>>;
  candidates: Array<Record<string, unknown>>;
}): Promise<BulkMatchResponsePayload> {
  const response = await fetch("/api/internal/match/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await toStructuredError(response);
  }

  return (await response.json()) as BulkMatchResponsePayload;
}

function unreachable(checkedAt: string, message: string): ApiStatus {
  return {
    checkedAt,
    health: "unreachable",
    matchEndpoint: "unreachable",
    apiBaseUrl: API_BASE_URL,
    message,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

async function toStructuredError(response: Response): Promise<StructuredApiError> {
  let envelope: ErrorEnvelope | undefined;

  try {
    envelope = (await response.json()) as ErrorEnvelope;
  } catch {
    envelope = undefined;
  }

  const fallbackMessage =
    response.status >= 500
      ? "Backend is unavailable or did not respond. Ensure backend services are running, then retry."
      : `Request failed with status ${response.status}.`;

  return {
    status: response.status,
    code: envelope?.error?.code,
    message: envelope?.error?.message ?? fallbackMessage,
    fieldErrors: (envelope?.error?.details?.field_errors ?? []).map((item) => ({
      field: item.field ?? "record",
      message: item.message ?? "Invalid value.",
    })),
  };
}
