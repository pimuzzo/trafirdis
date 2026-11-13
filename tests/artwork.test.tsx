import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Artwork } from "../src/components/Artwork";
import type { Movie } from "../src/domain/movie";

afterEach(cleanup);
const movie = (id: string): Movie => ({
  id,
  key: `/library/metadata/${id}`,
  title: `Film ${id}`,
  summary: "",
  duration: 0,
  genres: [],
  watched: false,
  viewOffset: 0,
  addedAt: 0,
  art: `/art-${id}.svg`,
});

describe("artwork identity", () => {
  it("replaces a loaded image immediately on movie change and ignores stale events", () => {
    const first = movie("1"),
      second = movie("2");
    const { container, rerender } = render(
      <Artwork movie={first} client={null} kind="art" />,
    );
    const old = container.querySelector("img")!;
    fireEvent.load(old);
    expect(old.getAttribute("aria-busy")).toBe("false");
    rerender(<Artwork movie={second} client={null} kind="art" />);
    const current = container.querySelector("img")!;
    expect(current).not.toBe(old);
    expect(old.isConnected).toBe(false);
    expect(current.getAttribute("src")).toBe(second.art);
    expect(current.classList.contains("is-loading")).toBe(true);
    fireEvent.load(old);
    fireEvent.error(old);
    expect(current.getAttribute("aria-busy")).toBe("true");
    fireEvent.load(current);
    expect(current.classList.contains("is-loading")).toBe(false);
  });

  it("isolates loading and failures when the source changes for the same movie", () => {
    const first = movie("1");
    const { container, rerender } = render(
      <Artwork movie={first} client={null} kind="art" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector(".artwork-fallback")?.textContent).toContain(
      first.title,
    );
    rerender(
      <Artwork
        movie={{ ...first, art: "/updated.svg" }}
        client={null}
        kind="art"
      />,
    );
    const image = container.querySelector("img")!;
    expect(image.getAttribute("src")).toBe("/updated.svg");
    expect(image.getAttribute("aria-busy")).toBe("true");
    fireEvent.load(image);
    expect(image.getAttribute("aria-busy")).toBe("false");
  });
});
