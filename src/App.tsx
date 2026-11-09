import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PlexClient } from "./plex/client";
import { ConnectionScreen } from "./components/ConnectionScreen";
import Catalog from "./components/Catalog";
function readToken() {
  try {
    return sessionStorage.getItem("trafirdis.token") || "";
  } catch {
    return "";
  }
}
export default function App() {
  const [token, setToken] = useState(readToken);
  const [sample, setSample] = useState(false);
  const queries = useQueryClient();
  const client = useMemo(() => (token ? new PlexClient(token) : null), [token]);
  const disconnect = () => {
    setToken("");
    setSample(false);
    try {
      sessionStorage.removeItem("trafirdis.token");
    } catch {
      /* The in-memory session still disconnects. */
    }
    queries.clear();
  };
  const connect = useCallback(
    (value: string) => {
      queries.clear();
      try {
        sessionStorage.setItem("trafirdis.token", value);
      } catch {
        /* In-memory use remains available when storage is blocked. */
      }
      setToken(value);
    },
    [queries],
  );
  if (!client && !sample)
    return (
      <ConnectionScreen onConnect={connect} onSample={() => setSample(true)} />
    );
  return (
    <Catalog
      key={sample ? "sample" : "plex"}
      client={client}
      onDisconnect={disconnect}
    />
  );
}
