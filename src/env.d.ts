/// <reference types="vite/client" />
declare const __PLEX_SERVER_LABEL__: string;
declare const __TRAFIRDIS_DIAGNOSTICS__: boolean;

interface Window {
  __TRAFIRDIS_CONFIG__?: { serverUrl?: string; diagnostics?: boolean };
}
