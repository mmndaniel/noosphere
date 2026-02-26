import type { Request, Response, NextFunction } from 'express';

/**
 * Bearer token auth middleware.
 * When NOOSPHERE_TOKEN is set, requires Authorization: Bearer <token>.
 * When unset, all requests pass through (zero-config local use).
 */
export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.NOOSPHERE_TOKEN;
  if (!token) {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ') || header.slice(7) !== token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
