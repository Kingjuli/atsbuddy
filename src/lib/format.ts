export type SupportedCurrency = "USD" | "KES";

const CURRENCY_RATE: Record<SupportedCurrency, number> = {
  USD: 1,
  KES: 130,
};

export function formatCurrency(amountUSD: number, currency: SupportedCurrency): string {
  const rate = CURRENCY_RATE[currency] ?? 1;
  const converted = amountUSD * rate;
  if (currency === "USD") return `$${converted.toFixed(6)}`;
  return `KES ${converted.toFixed(2)}`;
}

export function shortenId(id: string, head = 8, tail = 4): string {
  if (!id) return "-";
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString();
}

export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback best-effort for older browsers
  if (typeof document !== "undefined") {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    try { document.execCommand("copy"); } catch { /* noop */ }
    document.body.removeChild(el);
  }
}


