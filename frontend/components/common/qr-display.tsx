"use client";

import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { useEffect, useState } from "react";

import { displayToken } from "@/lib/qr";

const navy = "#0b1f3a";
const cream = "#f8f3e8";

export function QrDisplay({ payload, size = 220 }: { payload?: string; size?: number }) {
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setImage(null);
    setFailed(false);
    if (!payload) return;

    if (/^data:image\//i.test(payload)) {
      setImage(payload);
      return;
    }

    void QRCode.toDataURL(payload, {
      width: size * 2,
      margin: 1,
      color: { dark: `${navy}ff`, light: `${cream}ff` },
    })
      .then((url) => {
        if (active) setImage(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [payload, size]);

  if (!payload) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground"
        style={{ width: size, height: size }}
      >
        <QrCode className="size-8" />
        <p className="px-4 text-center text-xs">Start the session to generate a QR code</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        QR preview unavailable. Token: {displayToken(payload)}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-cream p-3 shadow-soft" style={{ width: size + 24 }}>
      {image ? (
        <img src={image} alt="Session QR code" width={size} height={size} className="rounded-lg" />
      ) : (
        <div className="animate-pulse rounded-lg bg-muted" style={{ width: size, height: size }} />
      )}
      <p className="mt-2 truncate text-center font-mono text-[10px] text-muted-foreground">
        {displayToken(payload)}
      </p>
    </div>
  );
}
