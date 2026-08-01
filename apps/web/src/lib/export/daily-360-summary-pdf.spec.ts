import { strict as assert } from "node:assert";
import test from "node:test";
import { assertDaily360PdfCanvas, getDaily360PdfCaptureDimensions } from "./daily-360-summary-pdf";

test("rejects zero-sized Daily 360 PDF capture targets", () => {
  assert.throws(() => getDaily360PdfCaptureDimensions({ scrollWidth: 0, scrollHeight: 0, getBoundingClientRect: () => ({ width: 0, height: 0 }) } as never));
});

test("accepts a visible capture target and rejects an empty canvas image", () => {
  assert.deepEqual(getDaily360PdfCaptureDimensions({ scrollWidth: 320, scrollHeight: 1200, getBoundingClientRect: () => ({ width: 300, height: 500 }) } as never), { width: 320, height: 1200 });
  assert.throws(() => assertDaily360PdfCanvas({ width: 320, height: 1200, toDataURL: () => "data:image/png;base64,AA==" }));
});
