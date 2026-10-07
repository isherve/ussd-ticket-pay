import { useEffect, useRef, useState } from "react";
import { admitTicket, type TicketPass } from "../api";

export function TicketPassCard({
  pass,
  onChange,
}: {
  pass: TicketPass;
  onChange: (next: TicketPass) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const admitted = pass.status === "ADMITTED";

  async function admit() {
    setBusy(true);
    setError("");
    try {
      onChange(await admitTicket(pass.code));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not admit this ticket");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="ticket-rise overflow-hidden rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)]">
      <div
        className={`px-6 py-5 ${admitted ? "bg-[var(--color-ink)] text-[var(--color-paper)]" : "bg-[var(--color-forest)] text-white"}`}
      >
        <p className="text-xs tracking-[0.2em] uppercase">
          {admitted ? "Admitted" : "Valid ticket"}
        </p>
        <h2 className="mt-1 font-display text-4xl leading-none">{pass.buyerName ?? pass.phone}</h2>
      </div>
      <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
        <Fact label="Buyer" value={pass.buyerName ?? "Name not provided"} detail={pass.phone} />
        <Fact label="Amount" value={`${pass.totalRwf.toLocaleString()} RWF`} detail={`${pass.quantity} ticket${pass.quantity === 1 ? "" : "s"}`} />
        <Fact label="Event" value={pass.eventName} detail={pass.venue} />
        <Fact label="Date" value={formatWhen(pass.startsAt)} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[var(--color-line)] px-6 py-4">
        <p className="text-sm text-[#4d574f]">
          {admitted && pass.admittedAt
            ? `Checked in ${formatWhen(pass.admittedAt)}. A second scan does not admit again.`
            : "This code has not been used at the gate."}
        </p>
        {admitted ? null : (
          <button
            type="button"
            onClick={() => void admit()}
            disabled={busy}
            className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-paper)] disabled:opacity-40"
          >
            {busy ? "Admitting…" : "Admit holder"}
          </button>
        )}
      </div>
      {error ? <p className="px-6 pb-4 text-sm text-[var(--color-clay)]">{error}</p> : null}
    </article>
  );
}

export function CameraScan({ onCode }: { onCode: (raw: string) => void }) {
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!on) return;
    const Detector = window.BarcodeDetector;
    if (!Detector) {
      setNote("This browser cannot read a camera QR. Click Scan under the ticket instead.");
      return;
    }
    let stop = false;
    let stream: MediaStream | null = null;
    const detector = new Detector({ formats: ["qr_code"] });
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const loop = async () => {
          if (stop || !videoRef.current) return;
          const found = await detector.detect(videoRef.current);
          const raw = found[0]?.rawValue;
          if (raw) {
            setOn(false);
            onCodeRef.current(raw);
            return;
          }
          window.setTimeout(() => void loop(), 350);
        };
        void loop();
      } catch {
        setNote("Camera permission was blocked. Click Scan under the ticket instead.");
        setOn(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [on]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => {
          setNote("");
          setOn((current) => !current);
        }}
        className="rounded-full bg-white px-4 py-2 text-sm"
      >
        {on ? "Stop camera" : "Scan with camera"}
      </button>
      {on ? (
        <video
          ref={videoRef}
          muted
          playsInline
          className="h-40 w-full max-w-xs rounded-2xl bg-black object-cover"
        />
      ) : null}
      {note ? <p className="text-sm text-[#4d574f]">{note}</p> : null}
    </div>
  );
}

function Fact({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <p className="text-xs tracking-wide text-[#667068] uppercase">{label}</p>
      <p className="mt-1 text-lg leading-snug">{value}</p>
      {detail ? <p className="text-sm text-[#667068]">{detail}</p> : null}
    </div>
  );
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
