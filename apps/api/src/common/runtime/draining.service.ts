import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class DrainingService implements OnApplicationShutdown {
  private draining = false;

  beginDraining() {
    this.draining = true;
  }

  isDraining() {
    return this.draining;
  }

  // Covers programmatic Nest shutdown as well as the signal handler in main.
  onApplicationShutdown() {
    this.beginDraining();
  }
}

// Keep liveness/readiness observable while refusing application work during
// shutdown. Existing requests are allowed to complete before app.close().
export function rejectNewWorkWhileDraining(draining: DrainingService) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!draining.isDraining() || req.path.startsWith("/health")) return next();
    res.setHeader("Retry-After", "5");
    res.status(503).json({ status: "draining" });
  };
}
