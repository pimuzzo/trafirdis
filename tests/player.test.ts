import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlexClient } from "../src/plex/client";
import { playAttempt } from "../src/trailer/player";
const attempt = {
  path: "/library/parts/2/file.mp4",
  kind: "direct" as const,
  source: "Plex trailer" as const,
};
describe("native video playback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });
  afterEach(() => vi.useRealTimers());
  it("marks resolution and playback separately, then releases the stream on end", async () => {
    const video = document.createElement("video");
    const resolved = vi.fn(),
      playing = vi.fn();
    const result = playAttempt(
      video,
      attempt,
      new PlexClient("x"),
      new AbortController().signal,
      resolved,
      playing,
    );
    video.dispatchEvent(new Event("loadedmetadata"));
    expect(resolved).toHaveBeenCalledOnce();
    expect(playing).not.toHaveBeenCalled();
    video.dispatchEvent(new Event("playing"));
    expect(playing).toHaveBeenCalledOnce();
    video.dispatchEvent(new Event("ended"));
    await result;
    expect(video.hasAttribute("src")).toBe(false);
    expect(video.loop).toBe(false);
    expect(video.playsInline).toBe(true);
  });
  it("keeps a blocked source ready for a direct user-gesture retry", async () => {
    vi.mocked(HTMLMediaElement.prototype.play)
      .mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"))
      .mockResolvedValue();
    const video = document.createElement("video");
    const controller = new AbortController();
    const blocked = vi.fn();
    const result = playAttempt(
      video,
      attempt,
      new PlexClient("x"),
      controller.signal,
      () => {},
      () => {},
      blocked,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(blocked).toHaveBeenCalledOnce();
    expect(video.hasAttribute("src")).toBe(true);
    await vi.advanceTimersByTimeAsync(15000);
    video.dispatchEvent(new Event("playing"));
    video.dispatchEvent(new Event("ended"));
    await result;
  });
  it("times out loading and releases resources without an endless retry", async () => {
    const video = document.createElement("video");
    const result = playAttempt(
      video,
      attempt,
      new PlexClient("x"),
      new AbortController().signal,
      () => {},
      () => {},
    );
    const check = expect(result).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(12000);
    await check;
    expect(video.hasAttribute("src")).toBe(false);
  });
  it("times out a network stall after initially successful playback", async () => {
    const video = document.createElement("video");
    const result = playAttempt(
      video,
      attempt,
      new PlexClient("x"),
      new AbortController().signal,
      () => {},
      () => {},
    );
    video.dispatchEvent(new Event("playing"));
    await vi.advanceTimersByTimeAsync(15000);
    video.dispatchEvent(new Event("waiting"));
    const check = expect(result).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(12000);
    await check;
  });
  it("cancels pending playback promptly and removes the media source", async () => {
    const video = document.createElement("video");
    const controller = new AbortController();
    const result = playAttempt(
      video,
      attempt,
      new PlexClient("x"),
      controller.signal,
      () => {},
      () => {},
    );
    const check = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await check;
    expect(video.hasAttribute("src")).toBe(false);
  });
});
