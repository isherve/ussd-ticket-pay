import { NavLink, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchMeta, type Meta } from "./api";
import { DashboardPage } from "./pages/Dashboard";
import { PayResultPage } from "./pages/PayResult";
import { SimulatorPage } from "./pages/Simulator";
import { TicketPage } from "./pages/TicketPage";
import { WalletPage } from "./pages/Wallet";

export function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMeta()
      .then(setMeta)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "API unreachable"));
  }, []);

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-6 md:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-line)] pb-4">
        <div>
          <p className="text-xs tracking-[0.18em] text-[var(--color-gold)] uppercase">
            Kigali · mock payments
          </p>
          <h1 className="font-display text-4xl leading-none">USSD Ticket Pay</h1>
          <p className="mt-2 max-w-md text-sm text-[#4d574f]">
            The wallet is the difference. Send, split, or pay for a ticket from one balance. Each
            move posts once.
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Tab to="/wallet">Wallet</Tab>
          <Tab to="/">Simulator</Tab>
          <Tab to="/admin">Dashboard</Tab>
          <a href="/docs" className="rounded-full bg-white/70 px-4 py-2">
            API
          </a>
        </nav>
      </header>
      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-clay)]">
          {error}
        </p>
      ) : null}
      <Routes>
        <Route path="/" element={<SimulatorPage meta={meta} />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/admin" element={<DashboardPage meta={meta} />} />
        <Route path="/pay/result" element={<PayResultPage />} />
        <Route path="/t/:code" element={<TicketPage />} />
        <Route path="*" element={<SimulatorPage meta={meta} />} />
      </Routes>
    </div>
  );
}

function Tab({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `rounded-full px-4 py-2 ${isActive ? "bg-[var(--color-ink)] text-[var(--color-paper)]" : "bg-white/70"}`
      }
    >
      {children}
    </NavLink>
  );
}
