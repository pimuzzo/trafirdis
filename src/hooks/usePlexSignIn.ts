import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearSignInReturn,
  PlexSignInClient,
  readSignInReturn,
  savePendingSignIn,
  signInMessage,
  signInUrl,
  type PendingSignIn,
  type PlexResource,
} from "../plex/auth";
import { getClientIdentifier } from "../plex/device";
import { preferredServer, type PlexConnection } from "../plex/connection";
function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException("Sign-in cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, 1000);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
}
export function usePlexSignIn(onConnect: (connection: PlexConnection) => void) {
  const [initial] = useState(() => {
    try {
      return { pending: readSignInReturn(), error: "" };
    } catch (error) {
      return { pending: null, error: signInMessage(error) };
    }
  });
  const [status, setStatus] = useState<
    "idle" | "starting" | "finishing" | "choosing" | "connecting"
  >(initial.pending ? "finishing" : "idle");
  const [message, setMessage] = useState(initial.error);
  const [servers, setServers] = useState<PlexResource[]>([]);
  const active = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    active.current?.abort();
    active.current = null;
    clearSignInReturn();
    setStatus("idle");
    setMessage("");
    setServers([]);
  }, []);
  useEffect(() => {
    if (!initial.pending) return;
    const pending: PendingSignIn = initial.pending;
    const controller = new AbortController();
    active.current = controller;
    const complete = async () => {
      try {
        const client = new PlexSignInClient(pending.clientId);
        let token: string | null = null;
        while (!token) {
          controller.signal.throwIfAborted();
          token = await client.checkPin(pending, controller.signal);
          if (!token) await waitForPoll(controller.signal);
        }
        const available = await client.resources(token, controller.signal);
        token = null;
        if (controller.signal.aborted) return;
        clearSignInReturn();
        setServers(available);
        const preferred = available.find((s) => s.id === preferredServer());
        const selected =
          preferred || (available.length === 1 ? available[0] : undefined);
        if (selected) {
          setStatus("connecting");
          try {
            const connection = await client.connectServer(
              selected,
              controller.signal,
            );
            if (controller.signal.aborted) return;
            setServers([]);
            onConnect(connection);
          } catch (error) {
            if (controller.signal.aborted) return;
            setStatus("choosing");
            setMessage(signInMessage(error));
          }
        } else setStatus("choosing");
      } catch (error) {
        if (!controller.signal.aborted) {
          clearSignInReturn();
          setStatus("idle");
          setMessage(signInMessage(error));
        }
      }
    };
    void complete();
    return () => controller.abort();
  }, [initial, onConnect]);
  useEffect(() => () => active.current?.abort(), []);
  const choose = async (server: PlexResource) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setStatus("connecting");
    setMessage("");
    try {
      const connection = await new PlexSignInClient().connectServer(
        server,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setServers([]);
      onConnect(connection);
    } catch (error) {
      if (!controller.signal.aborted) {
        setStatus("choosing");
        setMessage(signInMessage(error));
      }
    }
  };
  const start = async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setStatus("starting");
    setMessage("");
    setServers([]);
    try {
      // A round-trip must be resumable before opening Plex's hosted sign-in.
      try {
        sessionStorage.setItem("trafirdis.storage-check", "1");
        sessionStorage.removeItem("trafirdis.storage-check");
      } catch {
        throw new Error("storage");
      }
      const clientId = getClientIdentifier();
      const client = new PlexSignInClient(clientId);
      const pin = await client.createPin(controller.signal);
      if (controller.signal.aborted) return;
      const state = Array.from(
        crypto.getRandomValues(new Uint8Array(24)),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      const callback = new URL(
        window.location.pathname,
        window.location.origin,
      );
      callback.searchParams.set("trafirdis_auth", state);
      savePendingSignIn({ ...pin, state, clientId });
      window.location.assign(signInUrl(pin, clientId, callback.href));
    } catch (error) {
      if (!controller.signal.aborted) {
        clearSignInReturn();
        setStatus("idle");
        setMessage(
          error instanceof Error && error.message === "storage"
            ? "Allow browser session storage to sign in with Plex, or use a token instead."
            : signInMessage(error),
        );
      }
    }
  };
  return {
    start,
    cancel,
    choose,
    servers,
    status,
    message,
    busy: status !== "idle",
  };
}
