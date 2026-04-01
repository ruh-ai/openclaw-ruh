export interface ClassifiedGatewayRunError {
  retryable: boolean;
  response: {
    type: "error";
    error: string;
    content: string;
  } | null;
}

const MODEL_LIMITATION_PATTERNS = [
  "failed_generation",
  "failed to call a function",
  "rate_limit",
  "context_length",
];

const PROVIDER_AUTH_PATTERNS = [
  "authentication_error",
  "failed to authenticate",
  "api error: 401",
  "invalid x-api-key",
  "invalid api key",
  "invalid_api_key",
  "unauthorized",
];

export function classifyGatewayRunError(
  errorMsg: string
): ClassifiedGatewayRunError {
  const normalized = errorMsg.toLowerCase();

  if (PROVIDER_AUTH_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return {
      retryable: false,
      response: {
        type: "error",
        error: errorMsg,
        content:
          "The architect agent could not authenticate with its configured LLM provider. Update the provider credentials or sandbox LLM settings and try again.\n\n" +
          `Error: ${errorMsg}`,
      },
    };
  }

  if (MODEL_LIMITATION_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return {
      retryable: false,
      response: {
        type: "error",
        error: errorMsg,
        content: `The agent encountered an error: ${errorMsg}. This may be a model limitation — try simplifying your message or the agent model may need upgrading.`,
      },
    };
  }

  return {
    retryable: true,
    response: null,
  };
}
