import type { CategoryId } from "@/lib/event-schema";

/** District colours, shared by every presentation mode so the two never drift apart. */
export const categoryColors: Record<CategoryId, string> = {
  origins: "#ff9b42",
  protocol: "#72d9ff",
  mining: "#ffd166",
  adoption: "#7ee2a8",
  infrastructure: "#b8a3ff",
  finance: "#f3a6ca",
  policy: "#87a7ff",
  crisis: "#ff746c",
};

/** The name each district goes by in the presentation. */
export const districtNames: Record<CategoryId, string> = {
  origins: "The Cold Start",
  protocol: "The Lattice",
  mining: "The Furnace",
  adoption: "The Grid",
  infrastructure: "The Scaffold",
  finance: "The Canyon",
  policy: "The Colonnade",
  crisis: "The Fracture",
};

export function withAlpha(hex: string, alpha: number): string {
  const value = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, "0");
  return `${hex}${value}`;
}

/** Format a price the way the archive does: cents while it was worth cents. */
export function formatPrice(price: number | null): string {
  if (price === null) return "no market";
  if (price < 1) return `$${price.toFixed(2)}`;
  if (price < 1000) return `$${price.toFixed(0)}`;
  if (price < 1_000_000) return `$${Math.round(price).toLocaleString("en-US")}`;
  return `$${(price / 1_000_000).toFixed(1)}M`;
}

/** Short axis label for a decade gridline. */
export function formatGridPrice(price: number): string {
  if (price < 1) return `$${price.toFixed(2)}`;
  if (price < 1000) return `$${price}`;
  if (price < 1_000_000) return `$${price / 1000}k`;
  return `$${price / 1_000_000}M`;
}
