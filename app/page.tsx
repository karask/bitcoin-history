import type { Metadata } from "next";
import TimelineExplorer from "./TimelineExplorer";
import { getTimelineEvents } from "@/lib/events";

export const metadata: Metadata = {
  title: "Bitcoin Timechain — The history of an idea in motion",
  description: "Explore the breakthroughs, crises, culture, and adoption that shaped Bitcoin.",
};

export default function Home() {
  return <TimelineExplorer events={getTimelineEvents()} />;
}
