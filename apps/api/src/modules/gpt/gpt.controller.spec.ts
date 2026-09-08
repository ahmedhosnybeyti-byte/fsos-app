import { strict as assert } from "node:assert";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { GptController } from "./gpt.controller";

test("accepts a GPT session token only from the secure header", async () => {
  const calls: Array<[string, string]> = [];
  const controller = new GptController({
    listDatasets: async (apiKey: string, sessionToken: string) => { calls.push([apiKey, sessionToken]); return []; },
  } as never);

  await controller.listDatasets("Bearer api-key", "session-from-header", undefined);

  assert.deepEqual(calls, [["api-key", "session-from-header"]]);
});

test("rejects a GPT session token supplied through the query string", async () => {
  const controller = new GptController({ listDatasets: async () => [] } as never);

  assert.throws(
    () => controller.listDatasets("Bearer api-key", "session-from-header", "leaked-query-token"),
    (error: unknown) => error instanceof BadRequestException,
  );
});
