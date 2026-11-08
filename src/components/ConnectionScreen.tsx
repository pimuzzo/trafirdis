import { usePlexSignIn } from "../hooks/usePlexSignIn";
import { serverLabel } from "../config";
import { useState } from "react";
import { Brand, Icon } from "./Icon";
export function ConnectionScreen({
  onConnect,
  onSample,
}: {
  onConnect: (token: string) => void;
  onSample: () => void;
}) {
  const [token, setToken] = useState("");
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
          <p>
            Somewhere in your collection is your next favorite film. Let’s find
            it.
          </p>
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
          <div className="server-label">
            <span className="status-dot" />
            {serverLabel}
          </div>
          <button
            className="button primary"
            onClick={() => void login.start()}
            disabled={login.busy}
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
              Checking your Plex authorization and connecting to your server…
            </p>
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
            Sign in on Plex’s official website. Plexplore never sees your
            password. Server access stays in this browser session.
          </p>
          <details
            className="manual-login"
            onToggle={(event) => {
              if (event.currentTarget.open) login.cancel();
            }}
          >
            <summary>Use a Plex token instead</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (token.trim()) {
                  login.cancel();
                  onConnect(token.trim());
                }
              }}
            >
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
              <button className="button primary" type="submit">
                Connect my library
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
