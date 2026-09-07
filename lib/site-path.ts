const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix an application path for project-site hosting while keeping local URLs clean. */
export function sitePath(path: string) {
  if (!basePath || path.startsWith("#") || /^(?:[a-z]+:)?\/\//i.test(path)) return path;
  if (path === "/") return `${basePath}/`;
  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}
