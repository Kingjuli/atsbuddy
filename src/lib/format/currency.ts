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


