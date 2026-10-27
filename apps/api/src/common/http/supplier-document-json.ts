import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Request, Response, NextFunction } from "express";

const standardBytes = 100 * 1024;
const documentOperations = new Set(["receipt.create", "receipt.edit", "supplier.create"]);
const commandPath = /^\/api\/v1\/sfa\/wms\/warehouses\/[^/]+\/commands\/?$/;
const isCommand = (req: IncomingMessage) => req.method === "POST" && commandPath.test((req.url ?? "").split("?")[0]!);
const isJson = (req: IncomingMessage) => /^application\/json\s*(?:;|$)/i.test(req.headers["content-type"] ?? "");

/** A byte/memory envelope, never an item-count limit. Keep other routes and
 * other WMS commands at Nest's existing 100 KiB default. No raw body is retained. */
export function configureSupplierDocumentJson(app: Pick<NestExpressApplication, "useBodyParser" | "use">) {
  const sizes = new WeakMap<object, number>();
  app.useBodyParser("json", {
    limit: "10mb",
    type: req => isCommand(req) && isJson(req),
    verify: (req: IncomingMessage, _res: ServerResponse, buffer: Buffer) => { sizes.set(req, buffer.byteLength); },
  });
  app.useBodyParser("json", {
    limit: standardBytes,
    type: req => !isCommand(req) && isJson(req),
  });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (isCommand(req) && (sizes.get(req) ?? 0) > standardBytes && !documentOperations.has(req.body?.operation))
      return next(new PayloadTooLargeException("Request body exceeds standard limit"));
    next();
  });
  app.use((error: { status?: number }, req: Request, _res: Response, next: NextFunction) => {
    if (isCommand(req) && error?.status === 413) return next(new PayloadTooLargeException("Document exceeds transport byte budget"));
    if (isCommand(req) && error?.status === 400) return next(new BadRequestException("Invalid document JSON"));
    next(error);
  });
}
