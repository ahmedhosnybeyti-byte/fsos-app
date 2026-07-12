import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";

// Normalizes every thrown error (HttpException or otherwise) into one JSON
// shape so both the web app and the ChatGPT Action caller can rely on a
// stable error contract.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttpException ? exception.getResponse() : null;

    const message =
      typeof body === "string"
        ? body
        : body && typeof body === "object" && "message" in body
          ? (body as { message: unknown }).message
          : "Internal server error";

    // Was `if (status >= 500)` — 4xx from a misbehaving Action (bad API key,
    // expired/used code, malformed body) left zero server-side trace, which
    // made exactly this class of failure impossible to diagnose from logs.
    // Widened to log every non-2xx; the response body sent to the client is
    // unchanged either way.
    const authHeader = request.headers.authorization;
    const authSummary = authHeader ? `${authHeader.slice(0, 14)}... (len ${authHeader.length})` : "MISSING";
    const logLine = `${request.method} ${request.url} -> ${status} | auth=${authSummary} | body=${JSON.stringify(request.body)}`;
    if (status >= 500) {
      this.logger.error(logLine, exception instanceof Error ? exception.stack : undefined);
    } else if (status >= 400) {
      this.logger.warn(`${logLine} | message=${JSON.stringify(message)}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      errors: body && typeof body === "object" && "errors" in body ? (body as { errors: unknown }).errors : undefined,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
