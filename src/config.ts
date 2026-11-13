// Runtime values are public configuration only. Authentication is entered in the UI.
export const diagnosticsEnabled =
  import.meta.env.DEV ||
  (window.__TRAFIRDIS_CONFIG__?.diagnostics ?? __TRAFIRDIS_DIAGNOSTICS__);
