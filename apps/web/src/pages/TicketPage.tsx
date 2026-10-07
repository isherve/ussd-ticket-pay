import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchTicket, type TicketPass } from "../api";
import { TicketPassCard } from "./TicketPass";

export function TicketPage() {
  const { code } = useParams();
  const [pass, setPass] = useState<TicketPass | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    fetchTicket(code)
      .then((next) => {
        if (!cancelled) setPass(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ticket not found");
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-clay)]">{error}</p>
    );
  }
  if (!pass) return <p className="text-sm text-[#4d574f]">Reading ticket…</p>;
  return <TicketPassCard pass={pass} onChange={setPass} />;
}
