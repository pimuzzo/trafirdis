/// <reference types="vite/client" />
declare const __PLEX_SERVER_LABEL__: string;
declare const __PLEXPLORE_DIAGNOSTICS__: boolean;

interface Window {
  __PLEXPLORE_CONFIG__?: { serverUrl?: string; diagnostics?: boolean };
}
