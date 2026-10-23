/** Own only this dialog's camera tracks; a late permission response cannot leak a stream. */
export class VisitCameraSession {
  private generation = 0;
  private stream: MediaStream | null = null;

  close() {
    this.generation++;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  async open(devices: Pick<MediaDevices, "getUserMedia">): Promise<MediaStream | null> {
    this.close();
    const generation = this.generation;
    const stream = await devices.getUserMedia({ audio: false, video: {
      facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 },
    } });
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }
    this.stream = stream;
    return stream;
  }
}

export function cameraErrorKey(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "visit.cameraDenied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "visit.cameraMissing";
  if (name === "NotReadableError" || name === "TrackStartError") return "visit.cameraBusy";
  return "visit.cameraError";
}

/** Bound captured pixels/bytes before using the existing JPEG upload contract. */
export async function captureVisitFrame(video: HTMLVideoElement, canvas = document.createElement("canvas")): Promise<File> {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) throw new Error("Camera frame unavailable");
  const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Camera canvas unavailable");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob?.size || blob.type !== "image/jpeg" || blob.size > 8 * 1024 * 1024) throw new Error("Camera image unavailable or too large");
  return new File([blob], `visit-camera-${Date.now()}.jpg`, { type: "image/jpeg" });
}
