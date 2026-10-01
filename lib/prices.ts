/** Recorded observations only: no interpolation, month lookup or carried-forward quote. */
export function priceOnDate(
  series: Record<string, number>, date: string, precision: "day" | "month" | "year" = "day",
): number | null {
  if (precision !== "day" || !Object.hasOwn(series, date)) return null;
  const price = series[date];
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Retain cents around parity; preserve useful precision for very early quotations. */
export function formatDailyPrice(price: number | null): string {
  if (price === null) return "No recorded daily price";
  const digits = price < 0.01 ? 5 : price < 1000 ? 2 : 0;
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
