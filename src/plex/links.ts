// Matches Python PlexAPI's getWebURL / _buildWebURL. No token is included.
export function plexLink(machineIdentifier: string | undefined, key: string) {
  if (!machineIdentifier) return "https://app.plex.tv/desktop/";
  return `https://app.plex.tv/desktop/#!/server/${encodeURIComponent(machineIdentifier)}/details?${new URLSearchParams({ key })}`;
}
