import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PlexClient } from "./plex/client";
import { ConnectionScreen } from "./components/ConnectionScreen";
import Catalog from "./components/Catalog";
import {
  clearConnection,
  readConnection,
  restrictConnection,
  saveConnection,
  type PlexConnection,
} from "./plex/connection";
export default function App() {
  const [connection, setConnection] = useState(() => {
    const saved = readConnection();
    if (saved) restrictConnection(saved.base);
    return saved;
  });
  const [sample, setSample] = useState(false);
  const [reload, setReload] = useState(false);
  // Let Catalog's unmount effects release previews before resetting the CSP.
  useEffect(() => {
    if (reload) window.location.reload();
  }, [reload]);
  const queries = useQueryClient();
  const client = useMemo(
    () =>
      connection
        ? new PlexClient(
            connection.token,
            connection.base,
            undefined,
            undefined,
          )
        : null,
    [connection],
  );
  const disconnect = () => {
    setConnection(null);
    setSample(false);
    clearConnection();
    queries.clear();
    if (connection) setReload(true);
  };
  const connect = useCallback(
    (value: PlexConnection) => {
      queries.clear();
      saveConnection(value);
      restrictConnection(value.base);
      setConnection(value);
    },
    [queries],
  );
  const changeServer = () => {
    try {
      localStorage.removeItem("trafirdis.preferred-server");
    } catch {
      /* Choosing a server remains available without persistent storage. */
    }
    disconnect();
  };
  if (!client && !sample)
    return (
      <ConnectionScreen onConnect={connect} onSample={() => setSample(true)} />
    );
  return (
    <Catalog
      key={sample ? "sample" : "plex"}
      client={client}
      onDisconnect={disconnect}
      onChangeServer={changeServer}
    />
  );
}
