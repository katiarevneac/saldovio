const PUBLIC_PATHS = ["/login", "/signup"];

export function isPathAuthorized({
  hasSession,
  pathname,
}: {
  hasSession: boolean;
  pathname: string;
}): boolean {
  if (PUBLIC_PATHS.includes(pathname)) {
    return true;
  }
  return hasSession;
}
