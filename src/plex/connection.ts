export interface PlexConnection {
  token: string;
  base: string;
  machineIdentifier?: string;
}

export function serverOrigin(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !/^([a-z\d](?:[a-z\d.-]*[a-z\d])?|\[[a-f\d:]+\])$/i.test(url.hostname) ||
    (window.location.protocol === "https:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    /[\s\\]/.test(value)
  )
    throw new Error(
      "Use a server HTTP(S) origin without credentials or a path. HTTPS is required when Trafirdis uses HTTPS.",
    );
  return url.origin;
}

export function readConnection(): PlexConnection | null {
  try {
    const token = sessionStorage.getItem("trafirdis.token");
    if (!token) return null;
    const raw = sessionStorage.getItem("trafirdis.server");
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value.base !== "string") return null;
    const base = serverOrigin(value.base);
    return {
      token,
      base,
      machineIdentifier:
        typeof value.machineIdentifier === "string"
          ? value.machineIdentifier
          : undefined,
    };
  } catch {
    return null;
  }
}

export function saveConnection(connection: PlexConnection) {
  try {
    // Store the destination before the credential; never reuse an old destination.
    sessionStorage.removeItem("trafirdis.token");
    sessionStorage.setItem(
      "trafirdis.server",
      JSON.stringify({
        base: connection.base,
        machineIdentifier: connection.machineIdentifier,
      }),
    );
    sessionStorage.setItem("trafirdis.token", connection.token);
  } catch {
    /* The connection remains available in memory. */
  }
  if (connection.machineIdentifier) {
    try {
      localStorage.setItem(
        "trafirdis.preferred-server",
        connection.machineIdentifier,
      );
    } catch {
      /* Remembering the server is optional. */
    }
  }
}

export function clearConnection() {
  try {
    sessionStorage.removeItem("trafirdis.token");
    sessionStorage.removeItem("trafirdis.server");
  } catch {
    /* The in-memory connection is cleared by App. */
  }
}

export function preferredServer(): string | null {
  try {
    return localStorage.getItem("trafirdis.preferred-server");
  } catch {
    return null;
  }
}

// The initial policy permits discovery probes. Before rendering authenticated
// media, add a stricter policy for the selected origin. CSP also checks redirects.
// Policies cannot be relaxed in place: disconnect reloads the connection.
export function restrictConnection(base: string) {
  if (document.querySelector("meta[data-trafirdis-connection]")) return;
  const origin = serverOrigin(base);
  const policy = document.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.dataset.trafirdisConnection = "true";
  policy.content = `connect-src 'self' ${origin}${import.meta.env.DEV ? " ws://127.0.0.1:* ws://localhost:*" : ""}; media-src 'self' blob: ${origin}; img-src 'self' data: ${origin};`;
  document.head.append(policy);
}
