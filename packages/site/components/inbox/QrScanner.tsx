"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Brackets } from "~~/components/primitives/Brackets";
import { Btn } from "~~/components/primitives/Btn";
import { CameraIcon, QrIcon } from "~~/components/primitives/icons";

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

interface QrScannerProps {
  onResolve: (url: string) => void;
  onClose: () => void;
}

function normalisePacketUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed, window.location.origin);
    if (!url.pathname.startsWith("/r/")) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}

export function QrScanner({ onResolve, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [manual, setManual] = useState("");
  const [cameraError, setCameraError] = useState<string>();
  const supportsDetector = useMemo(() => typeof window !== "undefined" && Boolean(window.BarcodeDetector), []);

  useEffect(() => {
    if (!supportsDetector) return;
    let active = true;
    let stream: MediaStream | undefined;
    let frame = 0;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!active || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new window.BarcodeDetector!({ formats: ["qr_code"] });
        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const hit = codes.find(c => normalisePacketUrl(c.rawValue));
            if (hit) {
              const url = normalisePacketUrl(hit.rawValue)!;
              active = false;
              onResolve(url);
              return;
            }
          } catch {
            // Keep the camera alive; transient frame decode errors are normal.
          }
          frame = window.setTimeout(scan, 350);
        };
        void scan();
      } catch (err) {
        setCameraError((err as Error).message || "Camera unavailable");
      }
    }

    void start();
    return () => {
      active = false;
      window.clearTimeout(frame);
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [onResolve, supportsDetector]);

  const submitManual = () => {
    const url = normalisePacketUrl(manual);
    if (!url) {
      toast.error("Paste a CipherGift /r/ link");
      return;
    }
    onResolve(url);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.74)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 110,
        padding: 24,
      }}
    >
      <div
        className="panel modal-panel"
        onClick={e => e.stopPropagation()}
        style={{ width: 430, maxWidth: "100%", padding: 22, position: "relative" }}
      >
        <Brackets />
        <div className="tick" style={{ marginBottom: 8 }}>
          QR CLAIM
        </div>
        <h3 style={{ margin: "0 0 16px", fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600 }}>
          Scan a gift
        </h3>

        <div
          style={{
            aspectRatio: "1",
            borderRadius: 8,
            overflow: "hidden",
            background: "var(--bg-2)",
            border: "1px solid var(--line-2)",
            display: "grid",
            placeItems: "center",
          }}
        >
          {supportsDetector && !cameraError ? (
            <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 12, padding: 20 }}>
              <CameraIcon size={28} />
              <div style={{ marginTop: 10 }}>{cameraError || "Camera QR scan is not available here."}</div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <label className="field-label">Paste link</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="cr-input mono"
              value={manual}
              onChange={e => setManual(e.target.value)}
              placeholder="https://.../r/0"
              onKeyDown={e => e.key === "Enter" && submitManual()}
            />
            <Btn kind="primary" icon={<QrIcon size={12} />} onClick={submitManual}>
              Open
            </Btn>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <Btn kind="ghost" onClick={onClose}>
            Close
          </Btn>
        </div>
      </div>
    </div>
  );
}
