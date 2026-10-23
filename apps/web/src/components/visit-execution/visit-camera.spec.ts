import assert from "node:assert/strict";
import test from "node:test";
import { cameraErrorKey, captureVisitFrame, VisitCameraSession } from "./visit-camera";

function fixtureStream() {
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] } as unknown as MediaStream;
  return { stream, stopped: () => stopped };
}

test("camera permission is video-only, prefers rear camera, and close releases owned tracks", async () => {
  const fixture = fixtureStream();
  const session = new VisitCameraSession();
  let constraints: MediaStreamConstraints | undefined;
  assert.equal(await session.open({ getUserMedia: async (value) => { constraints = value; return fixture.stream; } }), fixture.stream);
  assert.equal(constraints?.audio, false);
  assert.deepEqual((constraints?.video as MediaTrackConstraints).facingMode, { ideal: "environment" });
  session.close(); session.close();
  assert.equal(fixture.stopped(), 1);
});

test("closing while permission is pending stops a late camera stream without accepting it", async () => {
  const fixture = fixtureStream();
  const session = new VisitCameraSession();
  let resolve!: (stream: MediaStream) => void;
  const pending = session.open({ getUserMedia: () => new Promise((done) => { resolve = done; }) });
  session.close(); resolve(fixture.stream);
  assert.equal(await pending, null); assert.equal(fixture.stopped(), 1);
});

test("a replacement camera request cannot be overwritten by an older permission response", async () => {
  const first = fixtureStream(), second = fixtureStream();
  const session = new VisitCameraSession();
  let resolve!: (stream: MediaStream) => void;
  const pending = session.open({ getUserMedia: () => new Promise((done) => { resolve = done; }) });
  assert.equal(await session.open({ getUserMedia: async () => second.stream }), second.stream);
  resolve(first.stream); assert.equal(await pending, null);
  assert.equal(first.stopped(), 1); assert.equal(second.stopped(), 0);
  session.close(); assert.equal(second.stopped(), 1);
});

test("camera denial, missing hardware and busy device produce distinct translated states", async () => {
  const session = new VisitCameraSession();
  const denied = Object.assign(new Error("blocked"), { name: "NotAllowedError" });
  await assert.rejects(session.open({ getUserMedia: async () => { throw denied; } }), denied);
  assert.equal(cameraErrorKey(denied), "visit.cameraDenied");
  assert.equal(cameraErrorKey({ name: "NotFoundError" }), "visit.cameraMissing");
  assert.equal(cameraErrorKey({ name: "NotReadableError" }), "visit.cameraBusy");
  assert.equal(cameraErrorKey(null), "visit.cameraError");
  session.close();
});

test("capture bounds portrait frames and creates a JPEG File for the existing upload path", async () => {
  const video = { readyState: 2, videoWidth: 2160, videoHeight: 3840 } as HTMLVideoElement;
  let drawn: unknown[] = [];
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (...args: unknown[]) => { drawn = args; } }),
    toBlob: (done: (value: Blob) => void, type: string) => { assert.equal(type,"image/jpeg"); done(new Blob(["encoded frame"], { type })); },
  } as unknown as HTMLCanvasElement;
  const file = await captureVisitFrame(video, canvas);
  assert.equal(canvas.width,1080); assert.equal(canvas.height,1920);
  assert.deepEqual(drawn,[video,0,0,1080,1920]);
  assert.equal(file.type,"image/jpeg"); assert.match(file.name,/^visit-camera-\d+\.jpg$/);
  assert.equal(await file.text(),"encoded frame");
});

test("capture rejects unready frames, missing encoding and oversized/wrong-format output", async () => {
  await assert.rejects(captureVisitFrame({ readyState: 0 } as HTMLVideoElement, {} as HTMLCanvasElement));
  const video = { readyState: 2, videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
  for (const blob of [null, new Blob([], { type:"image/jpeg" }), new Blob(["png"],{type:"image/png"}), new Blob([new Uint8Array(8*1024*1024+1)],{type:"image/jpeg"})]) {
    const canvas = { getContext: () => ({ drawImage: () => {} }), toBlob: (done: (b: Blob | null) => void) => done(blob) } as unknown as HTMLCanvasElement;
    await assert.rejects(captureVisitFrame(video,canvas));
  }
});
