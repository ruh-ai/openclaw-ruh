import type { Request, Response, NextFunction } from 'express';

export function httpError(status: number, detail: string): Error & { status: number } {
  const err = new Error(detail) as Error & { status: number };
  err.status = status;
  return err;
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
