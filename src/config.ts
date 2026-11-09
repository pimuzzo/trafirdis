// Runtime values are public configuration only. Authentication is entered in the UI.
export const serverLabel =
  window.__TRAFIRDIS_CONFIG__?.serverUrl || __PLEX_SERVER_LABEL__;

export const diagnosticsEnabled =
  import.meta.env.DEV ||
  (window.__TRAFIRDIS_CONFIG__?.diagnostics ?? __TRAFIRDIS_DIAGNOSTICS__);
