export interface BuilderAppAccess {
  admin: boolean;
  builder: boolean;
  customer: boolean;
}

export interface BuilderAppAccessRecord {
  appAccess?: BuilderAppAccess | null;
}

const BUILDER_ACCESS_ERROR = "Agent Builder requires an active developer organization.";

export function hasBuilderAppAccess(
  record: BuilderAppAccessRecord | null | undefined
): boolean {
  return record?.appAccess?.builder === true;
}

export function assertBuilderAppAccess(
  record: BuilderAppAccessRecord | null | undefined
): void {
  if (hasBuilderAppAccess(record)) {
    return;
  }

  const error = new Error(BUILDER_ACCESS_ERROR) as Error & {
    response?: { status?: number };
  };
  error.response = { status: 403 };
  throw error;
}
