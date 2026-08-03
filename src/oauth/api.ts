/**
 * Authenticated v1 API client for the CLI's account/provisioning family.
 *
 * Every call rides a live `cd_wk_` access token (resolved + rotated by
 * session.ts) and speaks the one Stripe-shaped envelope the backend returns:
 *   success → { data, meta }
 *   error   → { error: { type, code, message, request_id } }  (non-2xx)
 * Failures surface as `ApiError` carrying the request_id so a developer can
 * quote it to support.
 */

import { getAccessToken, type Session } from "./session.js";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiResponse<T = unknown> {
  data: T;
  meta?: Record<string, unknown>;
}

interface CallOpts {
  query?: Record<string, string | undefined>;
  body?: unknown;
}

/** Resolve a session (login required) and call the v1 API. */
export async function api<T = unknown>(
  method: "GET" | "POST",
  path: string,
  opts: CallOpts = {},
  baseUrlOverride?: string,
): Promise<ApiResponse<T>> {
  const session = await getAccessToken(baseUrlOverride);
  return apiWith<T>(session, method, path, opts);
}

/** Call the v1 API with an already-resolved session (avoids a second refresh). */
export async function apiWith<T = unknown>(
  session: Session,
  method: "GET" | "POST",
  path: string,
  opts: CallOpts = {},
): Promise<ApiResponse<T>> {
  const url = new URL(`${session.baseUrl}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    const err = (parsed.error ?? {}) as Record<string, unknown>;
    throw new ApiError(
      (err.message as string) || text || `HTTP ${res.status}`,
      (err.code as string) || "http_error",
      res.status,
      err.request_id as string | undefined,
    );
  }
  return { data: parsed.data as T, meta: parsed.meta as Record<string, unknown> | undefined };
}
