export interface AdminAppAccess {
  admin: boolean;
  builder: boolean;
  customer: boolean;
}

export interface AdminAppAccessRecord {
  appAccess?: AdminAppAccess | null;
}

const ADMIN_ACCESS_ERROR = "Platform admin access required";

export function hasAdminAppAccess(
  record: AdminAppAccessRecord | null | undefined
): boolean {
  return record?.appAccess?.admin === true;
}

export function assertAdminAppAccess(
  record: AdminAppAccessRecord | null | undefined
): void {
  if (hasAdminAppAccess(record)) {
    return;
  }

  const error = new Error(ADMIN_ACCESS_ERROR) as Error & {
    response?: { status?: number };
  };
  error.response = { status: 403 };
  throw error;
}
