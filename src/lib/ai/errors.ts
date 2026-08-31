/**
 * Provider error classification + user-facing messages.
 *
 * Billing / quota / auth / invalid-request errors are NON-RETRYABLE and must
 * surface immediately (zero attempts wasted). Only transient failures
 * (network, timeout, transient 5xx, appropriate rate limits) are retried.
 */

export type ErrorCode =
  | "PROVIDER_BILLING_ERROR"
  | "PROVIDER_AUTH_ERROR"
  | "PROVIDER_INVALID_REQUEST"
  | "PROVIDER_INVALID_MODEL"
  | "PROVIDER_PERMISSION"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_NETWORK"
  | "PROVIDER_5XX"
  | "UNKNOWN";

export type RetryClass = "RETRYABLE" | "NON_RETRYABLE";

export interface ClassifiedError {
  /** Machine-readable code for this failure. */
  code: ErrorCode;
  /** Whether a retry is likely to help. */
  retryClass: RetryClass;
  /** Short, developer-facing message (no stack trace). */
  message: string;
  /** True when the provider is exhausted/out of credits. */
  isBilling: boolean;
}

const NON_RETRYABLE_MARKERS: Array<{ code: ErrorCode; pattern: RegExp }> = [
  // OpenAI ("insufficient_quota", "You exceeded your current quota"),
  // OpenRouter ("You have no credits remaining"), generic billing.
  { code: "PROVIDER_BILLING_ERROR", pattern: /(no credits remaining|insufficient_quota|exceeded your current quota|out of (credits|quota)|billing|payment required|402|insufficient_balance|add credits)/i },
  // Auth / key problems.
  { code: "PROVIDER_AUTH_ERROR", pattern: /(invalid api key|unauthorized|authentication|not authenticated|401|incorrect api key|api key missing)/i },
  { code: "PROVIDER_PERMISSION", pattern: /(forbidden|permission|403|not.*allow|access denied)/i },
  // Invalid request / model.
  { code: "PROVIDER_INVALID_REQUEST", pattern: /(invalid_request_error|400|bad request|invalid parameter|unsupported parameter|missing parameter)/i },
  { code: "PROVIDER_INVALID_MODEL", pattern: /(unknown model|model not found|does not exist|invalid model|no such model|404)/i },
];

const RETRYABLE_MARKERS: Array<{ code: ErrorCode; pattern: RegExp }> = [
  { code: "PROVIDER_TIMEOUT", pattern: /(timeout|timed out|ETIMEDOUT|ECONNABORTED)/i },
  { code: "PROVIDER_NETWORK", pattern: /(network error|failed to fetch|ECONNREFUSED|ECONNRESET|enetunreach|offline|socket)/i },
  { code: "PROVIDER_RATE_LIMITED", pattern: /(rate limit|429|too many requests|try again later)/i },
  { code: "PROVIDER_5XX", pattern: /(5\d\d|internal server|service unavailable|server error|503|502|500)/i },
];

export function classifyProviderError(raw: unknown): ClassifiedError {
  const message =
    (raw instanceof Error ? raw.message : typeof raw === "string" ? raw : String(raw)) || "Unknown error";

  // Non-retryable wins — never burn attempts on billing/auth/invalid config.
  for (const { code, pattern } of NON_RETRYABLE_MARKERS) {
    if (pattern.test(message)) {
      return {
        code,
        retryClass: "NON_RETRYABLE",
        message,
        isBilling: code === "PROVIDER_BILLING_ERROR",
      };
    }
  }

  for (const { code, pattern } of RETRYABLE_MARKERS) {
    if (pattern.test(message)) {
      return {
        code,
        retryClass: "RETRYABLE",
        message,
        isBilling: false,
      };
    }
  }

  return { code: "UNKNOWN", retryClass: "RETRYABLE", message, isBilling: false };
}

/**
 * Friendly, non-technical message shown to end users. Internal details are
 * kept out of the primary surface (developer diagnostics can log separately).
 */
export function friendlyProviderError(raw: unknown): string {
  const c = classifyProviderError(raw);
  switch (c.code) {
    case "PROVIDER_BILLING_ERROR":
      return "Your AI request couldn't be completed because the configured provider has no remaining credits.";
    case "PROVIDER_AUTH_ERROR":
      return "Your AI request couldn't be completed because the provider rejected the API key or login.";
    case "PROVIDER_INVALID_MODEL":
      return "Your AI request couldn't be completed because the selected model isn't valid for this provider.";
    case "PROVIDER_INVALID_REQUEST":
      return "Your AI request couldn't be completed because the request was invalid for the selected provider.";
    case "PROVIDER_PERMISSION":
      return "Your AI request couldn't be completed because you don't have permission to use this provider.";
    case "PROVIDER_RATE_LIMITED":
      return "The AI provider is rate-limiting requests. Please wait a moment and try again.";
    case "PROVIDER_TIMEOUT":
      return "The AI request timed out. Please try again.";
    case "PROVIDER_NETWORK":
      return "Connection lost while contacting the AI provider. Please check your connection and try again.";
    default:
      return "The AI request couldn't be completed. Please try again.";
  }
}

/** Clone of a classified error with a friendly, developer-safe message. */
export class AIChatError extends Error {
  readonly code: ErrorCode;
  readonly retryClass: RetryClass;
  readonly isBilling: boolean;

  constructor(raw: unknown) {
    const c = classifyProviderError(raw);
    super(friendlyProviderError(raw));
    this.name = "AIChatError";
    this.code = c.code;
    this.retryClass = c.retryClass;
    this.isBilling = c.isBilling;
    // Keep the original detail on the error for developer diagnostics without
    // leaking it through the default user-facing message.
    (this as { cause?: unknown }).cause = raw;
  }
}
