/// <reference types="vite/client" />
declare const __TRAFIRDIS_DIAGNOSTICS__: boolean;

interface Window {
  __TRAFIRDIS_CONFIG__?: { diagnostics?: boolean };
}
