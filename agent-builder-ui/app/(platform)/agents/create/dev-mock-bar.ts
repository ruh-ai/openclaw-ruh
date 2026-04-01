export const DEV_MOCK_BAR_QUERY_PARAM = "devMockBar";

function isTruthyFlag(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function shouldShowDevMockBar(nodeEnv: string | undefined, queryValue: string | null): boolean {
  return nodeEnv === "development" && isTruthyFlag(queryValue);
}
