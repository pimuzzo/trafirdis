import { useEffect, useState } from "react";
import { emptyFilters } from "../domain/movie";

const storageKey = "trafirdis.catalog-view";

export function useCatalogFilters() {
  const [filters, setFilters] = useState(() => {
    try {
      if (localStorage.getItem(storageKey) === "unwatched")
        return { ...emptyFilters, watched: "unwatched" };
    } catch {
      // Browsing remains available when storage is blocked.
    }
    return emptyFilters;
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        filters.watched === "unwatched" ? "unwatched" : "discover",
      );
    } catch {
      // Keep the current view in memory when persistence is unavailable.
    }
  }, [filters.watched]);
  return [filters, setFilters] as const;
}
