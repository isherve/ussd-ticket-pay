import { useSearchParams } from "react-router-dom";

export function PayResultPage() {
  const [params] = useSearchParams();
  const status = params.get("status") ?? "pending";
  return (
    <section className="mx-auto max-w-lg rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] p-8">
      <p className="text-xs tracking-[0.16em] text-[var(--color-gold)] uppercase">PayPal return</p>
      <h2 className="mt-2 font-display text-4xl capitalize">{status}</h2>
      <p className="mt-3 text-sm leading-6">
        Sandbox buyers approve on PayPal, then land here. Ticket status is on the dashboard. Mock mode does not redirect through PayPal.
      </p>
    </section>
  );
}
