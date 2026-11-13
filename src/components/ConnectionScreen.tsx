import { usePlexSignIn } from "../hooks/usePlexSignIn";
import { useEffect, useRef, useState } from "react";
import { Brand, Icon } from "./Icon";
import { PlexClient, errorMessage } from "../plex/client";
import { serverOrigin, type PlexConnection } from "../plex/connection";
export function ConnectionScreen({
  onConnect,
  onSample,
}: {
  onConnect: (connection: PlexConnection) => void;
  onSample: () => void;
}) {
  const [token, setToken] = useState("");
  const [address, setAddress] = useState("");
  const [manualError, setManualError] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const manual = useRef<AbortController | null>(null);
  useEffect(() => () => manual.current?.abort(), []);
  const login = usePlexSignIn(onConnect);
  return (
    <div className="welcome">
      <img className="welcome-art" src="/sample/orbit-wide.svg" alt="" />
      <header className="welcome-header">
        <Brand />
        <span className="eyebrow">A DIFFERENT WAY TO DISCOVER</span>
      </header>
      <main className="welcome-main">
        <div className="welcome-copy">
          <span className="eyebrow accent">YOUR COLLECTION. REDISCOVERED.</span>
          <h1>
            Your library.
            <br />A new perspective.
          </h1>
          <p>Discover your next movie, one trailer at a time.</p>
          <div className="welcome-features">
            <span>
              <Icon name="film" />
              Your films, beautifully presented
            </span>
            <span>
              <Icon name="play" />
              Plex trailers, right at your fingertips
            </span>
            <span>
              <Icon name="check" />
              Your library stays yours
            </span>
          </div>
        </div>
        <section className="connection-card" aria-labelledby="connect-heading">
          <span className="connection-symbol">
            <Icon name="film" size={26} />
          </span>
          <h2 id="connect-heading">A great watch starts here.</h2>
          <p>
            Connect your Plex library and make movie night a little more
            inspired.
          </p>
          {login.servers.length > 0 ? (
            <div className="server-choices" aria-labelledby="server-heading">
              <h3 id="server-heading">Choose your Plex server</h3>
              {login.servers.map((server) => (
                <button
                  key={server.id}
                  className="button secondary server-choice"
                  disabled={login.status === "connecting"}
                  onClick={() => void login.choose(server)}
                >
                  <span>
                    {server.name}
                    <small>
                      {server.owned ? "Your server" : "Shared with you"}
                    </small>
                  </span>
                  <Icon name="arrow" size={17} />
                </button>
              ))}
              {login.status === "connecting" && (
                <p role="status">Connecting to your Plex server…</p>
              )}
            </div>
          ) : (
            <>
              <button
                className="button primary"
                onClick={() => void login.start()}
                disabled={login.busy || manualBusy}
              >
                {login.status === "starting"
                  ? "Opening Plex…"
                  : login.status === "finishing"
                    ? "Completing sign-in…"
                    : "Sign in with Plex"}
                <Icon name="external" size={17} />
              </button>
              {login.status === "finishing" && (
                <p className="sign-in-progress" role="status">
                  Checking your Plex authorization and connecting to your
                  server…
                </p>
              )}
            </>
          )}
          {login.message && (
            <p className="sign-in-error" role="alert">
              {login.message}
            </p>
          )}
          {login.busy && (
            <button className="text-button" onClick={login.cancel}>
              Cancel sign-in
            </button>
          )}
          <p className="privacy-note">
            Sign in on Plex’s official website. Trafirdis never sees your
            password. Server access stays in this browser session.{" "}
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
              Privacy notice
            </a>
          </p>
          <details
            className="manual-login"
            onToggle={(event) => {
              if (event.currentTarget.open) login.cancel();
              else {
                manual.current?.abort();
                setManualBusy(false);
              }
            }}
          >
            <summary>Use a Plex token instead</summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!token.trim() || manualBusy) return;
                login.cancel();
                setManualError("");
                let base;
                try {
                  base = serverOrigin(address);
                } catch {
                  setManualError(
                    "Enter a server HTTP(S) origin, such as https://your-server.plex.direct:32400. HTTPS is required when Trafirdis uses HTTPS.",
                  );
                  return;
                }
                const controller = new AbortController();
                manual.current = controller;
                setManualBusy(true);
                try {
                  const server = await new PlexClient(
                    token.trim(),
                    base,
                    undefined,
                    undefined,
                  ).server(controller.signal);
                  if (!controller.signal.aborted)
                    onConnect({
                      token: token.trim(),
                      base,
                      machineIdentifier: server.machineIdentifier,
                    });
                } catch (error) {
                  if (!controller.signal.aborted)
                    setManualError(errorMessage(error));
                } finally {
                  if (!controller.signal.aborted) setManualBusy(false);
                }
              }}
            >
              <>
                <label htmlFor="server-address">Plex server address</label>
                <input
                  id="server-address"
                  type="url"
                  placeholder="https://your-server.plex.direct:32400"
                  autoComplete="off"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                />
              </>
              <label htmlFor="token">Plex authentication token</label>
              <input
                id="token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="Enter your Plex token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
              {manualError && (
                <p className="sign-in-error" role="alert">
                  {manualError}
                </p>
              )}
              <button
                className="button primary"
                type="submit"
                disabled={manualBusy}
              >
                {manualBusy ? "Connecting…" : "Connect my library"}
                <Icon name="arrow" size={17} />
              </button>
            </form>
          </details>
          <div className="divider">
            <span>Take a look around first</span>
          </div>
          <button
            className="button secondary"
            onClick={() => {
              login.cancel();
              manual.current?.abort();
              onSample();
            }}
          >
            Explore the sample library
            <Icon name="arrow" size={16} />
          </button>
          <small>Fictional films. No Plex connection required.</small>
        </section>
      </main>
      <footer className="welcome-footer">
        <span>MADE FOR THE LOVE OF FILM</span>
        <span>Your media. Your server. Your next discovery.</span>
      </footer>
    </div>
  );
}
