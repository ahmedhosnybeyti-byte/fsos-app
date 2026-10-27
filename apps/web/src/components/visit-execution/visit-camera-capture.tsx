"use client";
import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useTranslation } from "@/components/translation-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { VisitExecutionTranslationKey } from "@/lib/i18n/visit-execution-messages";
import { cameraErrorKey, captureVisitFrame, VisitCameraSession } from "./visit-camera";

export function VisitCameraCapture({ disabled, onCapture }: { disabled: boolean; onCapture: (file: File) => void }) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<VisitExecutionTranslationKey | null>(null);
  const session = useRef(new VisitCameraSession());
  const generation = useRef(0);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => () => { generation.current++; session.current.close(); }, []);
  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    const element = video.current;
    if (!stream || !element) return;
    const current = generation.current;
    let cancelled = false;
    element.srcObject = stream;
    const failed = () => {
      if (cancelled || current !== generation.current) return;
      session.current.close(); setReady(false); setError("visit.cameraError");
    };
    const tracks = stream.getVideoTracks();
    tracks.forEach((track) => track.addEventListener("ended", failed));
    void element.play().catch(failed);
    return () => {
      cancelled = true;
      tracks.forEach((track) => track.removeEventListener("ended", failed));
      element.pause(); element.srcObject = null;
    };
  }, [stream]);

  function close() {
    generation.current++;
    session.current.close();
    setOpen(false); setStream(null); setPhoto(null); setReady(false); setCapturing(false); setError(null);
  }
  async function start() {
    const current = ++generation.current;
    setOpen(true); setPhoto(null); setReady(false); setStream(null); setError(null); setCapturing(false);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("visit.cameraUnsupported"); return;
    }
    try {
      const next = await session.current.open(navigator.mediaDevices);
      if (current === generation.current && next) setStream(next);
    } catch (reason) {
      if (current === generation.current) setError(cameraErrorKey(reason));
    }
  }
  async function capture() {
    if (!video.current || !ready || capturing) return;
    const current = generation.current;
    setCapturing(true);
    try {
      const file = await captureVisitFrame(video.current);
      if (current !== generation.current) return;
      session.current.close(); setStream(null); setReady(false); setPhoto(file);
    } catch {
      if (current === generation.current) { session.current.close(); setStream(null); setReady(false); setError("visit.cameraCaptureError"); }
    } finally {
      if (current === generation.current) setCapturing(false);
    }
  }
  return <>
    <Button type="button" disabled={disabled} onClick={() => void start()}><Camera className="h-4 w-4" />{t("visit.openCamera")}</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent dir={locale === "ar" ? "rtl" : "ltr"}>
        <DialogHeader><DialogTitle>{t("visit.cameraTitle")}</DialogTitle><DialogDescription>{t("visit.cameraHint")}</DialogDescription></DialogHeader>
        {photo && preview ? <img src={preview} alt={t("visit.cameraPreview")} className="max-h-80 w-full rounded-md bg-background object-contain" /> :
          <video ref={video} autoPlay muted playsInline aria-label={t("visit.cameraLive")} className="aspect-video max-h-80 w-full rounded-md bg-background object-contain" onLoadedData={() => setReady(true)} />}
        {!ready && !photo && !error && <p role="status" className="text-sm text-muted-foreground">{t("visit.cameraStarting")}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>{t("visit.cameraCancel")}</Button>
          {photo ? <><Button type="button" variant="outline" onClick={() => void start()}>{t("visit.cameraRetake")}</Button><Button type="button" onClick={() => { const file = photo; close(); onCapture(file); }}>{t("visit.cameraUse")}</Button></> :
            error ? <Button type="button" onClick={() => void start()}>{t("visit.retry")}</Button> :
              <Button type="button" disabled={!ready || capturing} onClick={() => void capture()}>{t("visit.cameraCapture")}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
