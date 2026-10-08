import { useEffect, useState } from "react";
import { fetchWallet, sendWallet, splitWallet, topUpWallet, type WalletView } from "../api";

function formatRwf(amount: number): string {
  return `${new Intl.NumberFormat("en-GB").format(amount)} RWF`;
}

function movementLabel(kind: WalletView["transfers"][number]["kind"]): string {
  if (kind === "TOPUP") return "Deposit";
  if (kind === "SEND") return "Internal transfer";
  if (kind === "SPLIT") return "Internal split";
  return "Ticket spend";
}

export function WalletPage() {
  const [phone, setPhone] = useState("+250788123456");
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [toPhone, setToPhone] = useState("+250788999111");
  const [depositAmount, setDepositAmount] = useState("10000");
  const [sendAmount, setSendAmount] = useState("2500");
  const [splitAmount, setSplitAmount] = useState("5000");
  const [people, setPeople] = useState(["+250728999222", "+250728999333"]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(next = phone) {
    const view = await fetchWallet(next);
    setWallet(view);
  }

  useEffect(() => {
    load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : "Could not load wallet"),
    );
  }, []);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await action());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] p-6">
        <p className="text-xs tracking-[0.18em] text-[var(--color-gold)] uppercase">
          Internal ledger
        </p>
        <h2 className="font-display text-4xl">Wallet</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[#4d574f]">
          One RWF balance in this service. Deposit, send, split, or pay for a ticket. Each move
          posts once, and the receipt is the reference on the row.
        </p>
        <ul className="mt-4 space-y-2 text-sm leading-6">
          <li className="rounded-xl bg-white/70 px-3 py-2">
            <span className="font-medium">Deposit.</span> Type the amount. It is a demo credit for
            money that has already arrived.
          </li>
          <li className="rounded-xl bg-white/70 px-3 py-2">
            <span className="font-medium">Internal transfer.</span> Phone to phone. Both balances
            change in one transaction.
          </li>
          <li className="rounded-xl bg-white/70 px-3 py-2">
            <span className="font-medium">Split and ticket spend.</span> Still on this ledger. A
            repeated confirm does not post twice.
          </li>
        </ul>
        <p className="mt-3 text-xs leading-5 text-[#5c675f]">
          The balance stays in this app. A cash-out to MTN or Airtel would be a later step.
        </p>
        <label className="mt-5 block text-sm">
          Your number
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-white px-3 py-2"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <p className="font-display text-3xl">{wallet ? formatRwf(wallet.balanceRwf) : "—"}</p>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void load().catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : "Could not load wallet"),
                )
              }
              className="rounded-full bg-white px-4 py-2 text-sm disabled:opacity-40"
            >
              Refresh
            </button>
            <label className="text-sm">
              Amount
              <input
                value={depositAmount}
                onChange={(event) => setDepositAmount(event.target.value)}
                inputMode="numeric"
                aria-label="Deposit amount"
                className="mt-1 w-36 rounded-xl border border-[var(--color-line)] bg-white px-3 py-2"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const amountRwf = Number(depositAmount);
                if (!Number.isInteger(amountRwf) || amountRwf < 1 || amountRwf > 1_000_000) {
                  setNotice("");
                  setError("Enter an amount from 1 to 1000000 RWF.");
                  return;
                }
                void run(async () => {
                  const move = await topUpWallet(phone, amountRwf);
                  return move.duplicate
                    ? `Deposit ${move.reference} was already posted.`
                    : `Deposited ${formatRwf(move.amountRwf)}. Internal ${move.reference}.`;
                });
              }}
              className="rounded-full bg-[var(--color-forest)] px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              Deposit
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-[#5c675f]">{wallet ? `Shown as ${wallet.phone}` : ""}</p>
        {notice ? (
          <p className="mt-4 rounded-xl bg-[var(--color-moss)] px-3 py-2 text-sm">{notice}</p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-[var(--color-clay)]">{error}</p> : null}

        <h3 className="mt-8 text-sm font-medium">Recent activity</h3>
        <ul className="mt-2 space-y-2">
          {wallet && wallet.transfers.length === 0 ? (
            <li className="text-sm text-[#5c675f]">No transfers yet.</li>
          ) : null}
          {wallet?.transfers.map((entry) => (
            <li
              key={entry.reference}
              className="flex items-baseline justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-mono text-xs text-[var(--color-gold)]">
                  Internal {entry.reference}
                </span>
                <span className="mt-1 block">
                  {entry.kind === "TOPUP"
                    ? "Deposit"
                    : `${movementLabel(entry.kind)} · ${entry.counterparty}`}
                </span>
              </span>
              <span className="font-mono">
                {entry.direction === "in" ? "+" : "−"}
                {formatRwf(entry.amountRwf)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6">
        <form
          className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const amountRwf = Number(sendAmount);
            void run(async () => {
              const move = await sendWallet({ fromPhone: phone, toPhone, amountRwf });
              return `Internal transfer ${formatRwf(move.amountRwf)} to ${move.recipients[0]?.phone ?? "the other wallet"}. Internal ${move.reference}.`;
            });
          }}
        >
          <h3 className="font-display text-2xl">Internal transfer</h3>
          <p className="mt-1 text-sm text-[#4d574f]">
            The other number has to already be on this service. Both balances change in one
            transaction.
          </p>
          <label className="mt-3 block text-sm">
            To
            <input
              value={toPhone}
              onChange={(event) => setToPhone(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-white px-3 py-2"
            />
          </label>
          <label className="mt-3 block text-sm">
            Amount
            <input
              value={sendAmount}
              onChange={(event) => setSendAmount(event.target.value)}
              inputMode="numeric"
              className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-white px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-full bg-[var(--color-ink)] px-5 py-2 text-sm text-[var(--color-paper)] disabled:opacity-40"
          >
            Send
          </button>
        </form>

        <form
          className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const amountRwf = Number(splitAmount);
            const phones = people.map((item) => item.trim()).filter((item) => item.length > 0);
            void run(async () => {
              const move = await splitWallet({ fromPhone: phone, amountRwf, phones });
              const remainder =
                move.remainderRwf > 0
                  ? ` ${formatRwf(move.remainderRwf)} stayed in your wallet.`
                  : "";
              return `Split ${formatRwf(move.amountRwf)} as ${formatRwf(move.shareRwf)} each.${remainder} Ref ${move.reference}.`;
            });
          }}
        >
          <h3 className="font-display text-2xl">Split</h3>
          <p className="mt-1 text-sm text-[#4d574f]">
            Equal shares. Any leftover RWF stays with you.
          </p>
          <label className="mt-3 block text-sm">
            Amount
            <input
              value={splitAmount}
              onChange={(event) => setSplitAmount(event.target.value)}
              inputMode="numeric"
              className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-white px-3 py-2"
            />
          </label>
          <div className="mt-3 space-y-2">
            {people.map((person, index) => (
              <label key={index} className="block text-sm">
                Person {index + 1}
                <input
                  value={person}
                  onChange={(event) =>
                    setPeople((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-white px-3 py-2"
                />
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={people.length >= 5}
              onClick={() => setPeople((current) => [...current, ""])}
              className="rounded-full bg-white px-4 py-2 text-sm disabled:opacity-40"
            >
              Add person
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-[var(--color-ink)] px-5 py-2 text-sm text-[var(--color-paper)] disabled:opacity-40"
            >
              Split equally
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
