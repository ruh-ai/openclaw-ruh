export interface CustomerAppAccess {
  admin: boolean;
  builder: boolean;
  customer: boolean;
}

export interface CustomerAppAccessRecord {
  appAccess?: CustomerAppAccess | null;
}

const CUSTOMER_ACCESS_ERROR = "Customer organization access required";

export function hasCustomerAppAccess(
  record: CustomerAppAccessRecord | null | undefined
): boolean {
  return record?.appAccess?.customer === true;
}

export function assertCustomerAppAccess(
  record: CustomerAppAccessRecord | null | undefined
): void {
  if (hasCustomerAppAccess(record)) {
    return;
  }

  const error = new Error(CUSTOMER_ACCESS_ERROR) as Error & {
    response?: { status?: number };
  };
  error.response = { status: 403 };
  throw error;
}
