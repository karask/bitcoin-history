import Link from "@/components/SiteLink";
import { sitePath } from "@/lib/site-path";

type SiteHeaderProps = {
  /** Where "Timeline" and "Method" point. In-page anchors on the home page, so its filters survive. */
  timelineHref?: string;
  methodHref?: string;
  /** The ride link carries context: the explorer's filters, or the event being read. */
  rideHref?: string;
  status?: string;
};

/** One header for every archive page, so the same destination always has the same name. */
export default function SiteHeader({
  timelineHref = sitePath("/#events"),
  methodHref = sitePath("/#method"),
  rideHref = sitePath("/present"),
  status,
}: SiteHeaderProps) {
  return <header className="site-header">
    <Link className="brand" href={sitePath("/")} aria-label="Bitcoin Timechain home"><span className="brand-mark" aria-hidden="true">₿</span><span>BITCOIN TIMECHAIN</span></Link>
    <nav aria-label="Primary navigation">
      <Link href={timelineHref}>Timeline</Link>
      <Link href={rideHref}>3D ride</Link>
      <Link href={methodHref}>Method</Link>
    </nav>
    {status ? <span className="archive-status"><i aria-hidden="true" /> {status}</span> : <span />}
  </header>;
}
