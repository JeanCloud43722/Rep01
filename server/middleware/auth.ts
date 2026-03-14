import type { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    userId: number;
    username: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.userId) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}
