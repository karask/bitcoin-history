import type { MetadataRoute } from "next";
import { getAllEvents } from "@/lib/events";
import { setlists } from "@/lib/setlists";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://kkarasavvas.com/bitcoin-history";
  const archiveUpdated = new Date("2026-08-24T00:00:00Z");
  return [
    { url: base, lastModified: archiveUpdated, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/present`, lastModified: archiveUpdated, changeFrequency: "monthly", priority: 0.8 },
    ...setlists.map((setlist) => ({
      url: `${base}/present?setlist=${setlist.id}`,
      lastModified: archiveUpdated,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...getAllEvents().map((event) => ({
      url: `${base}/events/${event.slug}`,
      lastModified: archiveUpdated,
      changeFrequency: "yearly" as const,
      priority: event.significance === "landmark" ? 0.8 : event.significance === "major" ? 0.65 : 0.5,
    })),
  ];
}
