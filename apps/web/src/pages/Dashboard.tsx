import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchOrders,
  fetchSms,
  fetchTicket,
  simulatePayment,
  ticketCodeFromScan,
  type Meta,
  type OrderRow,
  type SmsRow,
  type TicketPass,
} from "../api";
import { CameraScan, TicketPassCard } from "./TicketPass";

export function DashboardPage({ meta }: { meta: Meta | null }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [messages, setMessages] = useState<SmsRow[]>([]);
  const [error, setError] = useState("");
  const [pendingRef, setPendingRef] = useState("");
  const [pass, setPass] = useState<TicketPass | null>(null);
  const [scanError, setScanError] = useState("");
  const passRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [nextOrders, nextSms] = await Promise.all([fetchOrders(), fetchSms()]);
      setOrders(nextOrders);
      setMessages(nextSms);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the dashboard");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  const openTicket = useCallback(async (raw: string) => {
    const code = ticketCodeFromScan(raw);
    if (!code) {
      setPass(null);
      setScanError("That QR is not a ticket from this demo.");
      return;
    }
    setScanError("");
    try {
      const next = await fetchTicket(code);
      setPass(next);
    } catch (err) {
      setPass(null);
      setScanError(err instanceof Error ? err.message : "Ticket not found");
    }
  }, []);

  useEffect(() => {
    if (pass) passRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pass]);

  async function simulate(reference: string, status: "SUCCESSFUL" | "FAILED") {
    setPendingRef(reference);
    try {
      await simulatePayment(reference, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setPendingRef("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">Orders</h2>
          <p className="text-sm text-[#4d574f]">
            Refreshes every 3 seconds. Phone numbers are masked.
          </p>
          {orders.some((order) => order.paymentStatus === "PENDING") ? (
            <p className="mt-2 max-w-xl text-sm text-[#4d574f]">
              Press Succeed to issue the ticket and the SMS. A second press does not create another
              ticket.
            </p>
          ) : null}
        </div>
        <ModePills meta={meta} />
      </section>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-clay)]">{error}</p>
      ) : null}
      <section ref={passRef} className="space-y-3">
        {pass ? (
          <TicketPassCard pass={pass} onChange={setPass} />
        ) : (
          <p className="text-sm text-[#4d574f]">
            Click Scan on a ticket QR. The pass appears here.
          </p>
        )}
        {scanError ? <p className="text-sm text-[var(--color-clay)]">{scanError}</p> : null}
        <CameraScan onCode={(raw) => void openTicket(raw)} />
      </section>
      <div className="overflow-x-auto rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs tracking-wide text-[#667068] uppercase">
            <tr>
              <th className="px-4 py-3">Ref</th>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Pay</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ticket</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-[#667068]">
                  No orders yet. Buy one in the simulator.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.reference} className="border-t border-[var(--color-line)] align-top">
                  <td className="px-4 py-3 font-mono">{order.reference}</td>
                  <td className="px-4 py-3">{order.phone}</td>
                  <td className="px-4 py-3">
                    {order.eventName}
                    <div className="text-xs text-[#667068]">
                      {order.quantity} · {order.totalRwf.toLocaleString()} RWF
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {order.provider ?? "—"}
                    {order.amountCharged ? (
                      <div className="text-xs text-[#667068]">
                        {order.amountCharged} {order.currencyCharged}
                      </div>
                    ) : null}
                    {order.approvalUrl ? (
                      <a
                        className="mt-1 block text-xs underline"
                        href={order.approvalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Approval link
                      </a>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge value={order.paymentStatus ?? order.orderStatus} />
                    {order.paymentStatus === "PENDING" && canSimulate(meta, order.provider) ? (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={pendingRef === order.reference}
                          onClick={() => void simulate(order.reference, "SUCCESSFUL")}
                          className="rounded-full bg-[var(--color-forest)] px-2 py-1 text-xs text-white"
                        >
                          Succeed
                        </button>
                        <button
                          type="button"
                          disabled={pendingRef === order.reference}
                          onClick={() => void simulate(order.reference, "FAILED")}
                          className="rounded-full bg-[var(--color-clay)] px-2 py-1 text-xs text-white"
                        >
                          Fail
                        </button>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {order.ticketCode ? (
                      <div>
                        <div className="font-mono">{order.ticketCode}</div>
                        <button
                          type="button"
                          onClick={() => void openTicket(order.ticketCode ?? "")}
                          className="mt-2 rounded bg-white text-left"
                        >
                          <img
                            alt={`QR for ${order.ticketCode}`}
                            src={`/api/tickets/${order.ticketCode}/qr`}
                            className="h-32 w-32"
                          />
                          <span className="block pb-1 text-center text-xs text-[var(--color-forest)]">
                            Scan
                          </span>
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section>
        <h2 className="font-display text-3xl">Sent SMS</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {messages.length === 0 ? (
            <p className="text-sm text-[#667068]">No messages yet.</p>
          ) : null}
          {messages.map((message) => (
            <article
              key={message.id}
              className="rounded-2xl border border-[var(--color-line)] bg-white p-4"
            >
              <div className="flex items-center justify-between text-xs text-[#667068]">
                <span>{message.to}</span>
                <span>{message.provider}</span>
              </div>
              <pre className="mt-2 font-mono text-sm whitespace-pre-wrap">{message.body}</pre>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function canSimulate(meta: Meta | null, provider: string | null): boolean {
  if (!meta || !provider) return false;
  if (provider === "mtn") return meta.mtnMode === "mock";
  if (provider === "airtel") return meta.airtelMode === "mock";
  if (provider === "paypal") return meta.paypalMode === "mock";
  return false;
}

function Badge({ value }: { value: string }) {
  const tone =
    value === "SUCCESSFUL" || value === "PAID" || value === "ISSUED"
      ? "bg-[var(--color-moss)] text-[var(--color-forest)]"
      : value === "FAILED" || value === "EXPIRED"
        ? "bg-red-50 text-[var(--color-clay)]"
        : "bg-amber-50 text-[#8a5a10]";
  return <span className={`rounded-full px-2 py-1 text-xs ${tone}`}>{value}</span>;
}

function ModePills({ meta }: { meta: Meta | null }) {
  if (!meta) return null;
  const items = [
    ["MTN", meta.mtnMode],
    ["Airtel", meta.airtelMode],
    ["PayPal", meta.paypalMode],
    ["SMS", meta.smsMode],
  ] as const;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {items.map(([label, mode]) => (
        <span key={label} className="rounded-full bg-white px-3 py-1">
          {label}: {mode}
        </span>
      ))}
    </div>
  );
}
