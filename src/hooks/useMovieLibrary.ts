import { useMemo, useState } from "react";
import type { Library } from "../domain/movie";

export function useMovieLibrary(
  serverKey: string | undefined,
  libraries: Library[] | undefined,
) {
  const [choice, setChoice] = useState<{
    serverKey: string;
    id: string;
  } | null>(null);
  const saved = useMemo(() => {
    if (!serverKey) return "";
    try {
      return (
        localStorage.getItem(
          `trafirdis.library.${encodeURIComponent(serverKey)}`,
        ) || ""
      );
    } catch {
      return "";
    }
  }, [serverKey]);
  const requested = choice?.serverKey === serverKey ? choice?.id : saved;
  // Validate preferences against this account's current accessible libraries.
  const libraryId = serverKey
    ? libraries?.find((library) => library.id === requested)?.id ||
      libraries?.[0]?.id
    : undefined;
  const selectLibrary = (id: string) => {
    if (!serverKey || !libraries?.some((library) => library.id === id)) return;
    setChoice({ serverKey, id });
    try {
      localStorage.setItem(
        `trafirdis.library.${encodeURIComponent(serverKey)}`,
        id,
      );
    } catch {
      // Keep the current choice usable when browser storage is unavailable.
    }
  };
  return { libraryId, selectLibrary };
}
