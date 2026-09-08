import { strict as assert } from "node:assert";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { HttpExceptionFilter } from "../filters/http-exception.filter";
import { redactSensitiveQueryValues, redactSensitiveUrl } from "./redact-sensitive-url";

test("redacts sensitive query values while retaining safe diagnostics", () => {
  const safeUrl = redactSensitiveUrl("/api/v1/gpt/dataset?fileId=file-1&sessionToken=super-secret&apiKey=key-123&limit=10");

  assert.equal(safeUrl, "/api/v1/gpt/dataset?fileId=file-1&sessionToken=%5BREDACTED%5D&apiKey=%5BREDACTED%5D&limit=10");
  assert.doesNotMatch(safeUrl, /super-secret|key-123/);
  assert.doesNotMatch(redactSensitiveQueryValues("request failed at /gpt?sessionToken=super-secret"), /super-secret/);
});

test("exception logs and response paths use the redacted URL", () => {
  const filter = new HttpExceptionFilter();
  const lines: string[] = [];
  (filter as unknown as { logger: { warn: (line: string) => void } }).logger.warn = (line) => lines.push(line);
  let responseBody: unknown;
  const response = { status: () => ({ json: (body: unknown) => { responseBody = body; } }) };
  const request = { method: "GET", url: "/api/v1/gpt/dataset?sessionToken=super-secret", headers: {}, body: undefined };
  const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }) };

  filter.catch(new BadRequestException("Rejected"), host as never);

  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0] ?? "", /super-secret/);
  assert.equal((responseBody as { path: string }).path, "/api/v1/gpt/dataset?sessionToken=%5BREDACTED%5D");
});
