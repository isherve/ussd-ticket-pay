import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { postUssd, type Meta } from "../api";

const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

const purchase = [
  { key: "1", label: "Buy ticket" },
  { key: "1", label: "Jazz Night" },
  { key: "2", label: "Two tickets" },
  { key: "1", label: "MTN MoMo" },
  { key: "1", label: "Confirm" },
] as const;

type Line = { kind: "menu" | "end"; text: string };

export function SimulatorPage({ meta }: { meta: Meta | null }) {
  const serviceCode = meta?.serviceCode ?? "*384*123#";
  const ttl = meta?.sessionTtlSeconds ?? 120;
  const [phone, setPhone] = useState("+250788123456");
  const [buyerName, setBuyerName] = useState("Aline Uwase");
  const [sessionId, setSessionId] = useState("");
  const [history, setHistory] = useState("");
  const [draft, setDraft] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [cue, setCue] = useState<number | null>(null);
  const [reference, setReference] = useState("");
  const playingRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = useMemo(() => {
    if (!deadline || ended) return null;
    return Math.max(0, Math.ceil((deadline - now) / 1000));
  }, [deadline, ended, now]);

  useEffect(() => {
    if (remaining === 0 && sessionId && !ended) {
      setEnded(true);
      setLines((current) => [...current, { kind: "end", text: "Session expired. Dial again." }]);
    }
  }, [remaining, sessionId, ended]);

  async function send(text: string, id = sessionId): Promise<string | null> {
    setBusy(true);
    setError("");
    try {
      const body = await postUssd({
        sessionId: id,
        phoneNumber: phone,
        serviceCode,
        text,
        buyerName,
      });
      const end = body.startsWith("END ");
      const visible = body.replace(/^(CON|END)\s/, "");
      setLines((current) => [...current, { kind: end ? "end" : "menu", text: visible }]);
      setEnded(end);
      setHistory(text);
      setDeadline(end ? null : Date.now() + ttl * 1000);
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function playPurchase() {
    if (playingRef.current || busy) return;
    playingRef.current = true;
    setPlaying(true);
    setReference("");
    setError("");
    const id = `web-${Date.now().toString(36)}`;
    setSessionId(id);
    setHistory("");
    setDraft("");
    setLines([]);
    setEnded(false);
    setDeadline(null);
    setCue(null);
    try {
      const opened = await send("", id);
      if (!opened) return;
      let text = "";
      for (let index = 0; index < purchase.length; index += 1) {
        const choice = purchase[index]?.key;
        if (!choice) break;
        setCue(index);
        setDraft(choice);
        await delay(450);
        text = text ? `${text}*${choice}` : choice;
        setDraft("");
        const body = await send(text, id);
        if (!body) return;
        const match = /Ref:\s*([A-Z0-9]+)/.exec(body);
        if (match?.[1]) setReference(match[1]);
        await delay(550);
      }
    } finally {
      playingRef.current = false;
      setCue(null);
      setPlaying(false);
    }
  }

  function dial() {
    const id = `web-${Date.now().toString(36)}`;
    setSessionId(id);
    setHistory("");
    setDraft("");
    setLines([]);
    setEnded(false);
    setDeadline(null);
    void send("", id);
  }

  function submitDraft() {
    const choice = draft.trim();
    if (!sessionId || ended || !choice) return;
    const text = history ? `${history}*${choice}` : choice;
    setDraft("");
    void send(text);
  }

  function press(key: string) {
    if (!sessionId || ended) return;
    if (key === "#") {
      submitDraft();
      return;
    }
    setDraft((current) => `${current}${key}`.slice(0, 8));
  }

  const screen = lines[lines.length - 1];

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[340px_1fr]">
      <div className="mx-auto w-[320px] rounded-[36px] bg-[#1c1f1d] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between px-2 text-[11px] text-[#d9d4c8]">
          <span>USSD</span>
          <span>{remaining === null ? "idle" : `${remaining}s`}</span>
        </div>
        <div className="min-h-64 rounded-2xl bg-[var(--color-lcd)] p-4 font-mono text-sm leading-6 whitespace-pre-wrap text-[var(--color-lcd-text)]">
          {screen ? screen.text : `Dial ${serviceCode} to buy a ticket.`}
        </div>
        <div className="mt-3 rounded-xl bg-black/40 px-3 py-2 font-mono text-sm text-white">
          {draft || " "}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {keys.map((key) => (
            <button
              key={key}
              type="button"
              disabled={!sessionId || ended || busy || playing}
              onClick={() => press(key)}
              className="rounded-xl bg-[#2a2e2c] py-3 text-white disabled:opacity-40"
            >
              {key}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDraft((value) => value.slice(0, -1))}
            disabled={playing}
            className="rounded-xl bg-[#3a332c] py-2 text-sm text-white disabled:opacity-40"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={submitDraft}
            disabled={!sessionId || ended || busy || playing}
            className="rounded-xl bg-[var(--color-gold)] py-2 text-sm font-medium text-black disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>

      <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] p-6">
        <h2 className="font-display text-3xl">Phone simulator</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[#4d574f]">
          This posts <code>application/x-www-form-urlencoded</code> to <code>/ussd</code> the same
          way Africa&apos;s Talking does. Play the purchase below, or type one menu number and press
          Send. A session expires after {ttl} seconds of silence.
        </p>
        <ol className="mt-5 space-y-2">
          {purchase.map((step, index) => (
            <li
              key={step.label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${cue === index ? "bg-[var(--color-moss)]" : "bg-white/70"}`}
            >
              <span className="w-6 font-mono text-[var(--color-gold)]">{step.key}</span>
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void playPurchase()}
            disabled={busy || playing}
            className="rounded-full bg-[var(--color-ink)] px-5 py-2 text-sm text-[var(--color-paper)] disabled:opacity-40"
          >
            {playing ? "Playing…" : "Play this purchase"}
          </button>
        </div>
        {reference ? (
          <p className="mt-4 rounded-xl bg-[var(--color-moss)] px-3 py-2 text-sm leading-6">
            Payment <span className="font-mono">{reference}</span> is waiting.{" "}
            <Link to="/admin" className="underline">
              Open the dashboard
            </Link>{" "}
            and press Succeed, then dial again and choose My tickets.
          </p>
        ) : null}
        <label className="mt-5 block text-sm">
          Buyer name
          <input
            value={buyerName}
            onChange={(event) => setBuyerName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-white px-3 py-2"
          />
        </label>
        <label className="mt-4 block text-sm">
          Phone number
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-white px-3 py-2"
          />
        </label>
        <p className="mt-2 text-xs text-[#5c675f]">
          Try +250788123456 (MTN) or +250728123456 (Airtel). Prices on the menu are RWF.
        </p>
        <button
          type="button"
          onClick={dial}
          disabled={busy || playing}
          className="mt-4 rounded-full bg-[var(--color-forest)] px-5 py-2 text-white disabled:opacity-40"
        >
          Dial {serviceCode}
        </button>
        {error ? <p className="mt-3 text-sm text-[var(--color-clay)]">{error}</p> : null}
      </section>
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
