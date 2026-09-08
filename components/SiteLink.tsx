import type { ComponentProps } from "react";

// Pages serves exported HTML directly. Native links avoid depending on a
// framework navigation runtime or server-backed route requests.
export default function SiteLink({ children, ...props }: ComponentProps<"a">) {
  return <a {...props}>{children}</a>;
}
