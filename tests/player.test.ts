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
    video.dispatchEvent(new Event("loadedmetadata"));
    video.dispatchEvent(new Event("waiting"));
    await vi.advanceTimersByTimeAsync(15000);
    expect(video.hasAttribute("src")).toBe(true);
    video.dispatchEvent(new Event("play"));
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
  it("times out a stalled manual retry after autoplay denial", async () => {
    vi.mocked(HTMLMediaElement.prototype.play)
      .mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"))
      .mockResolvedValue();
    const video = document.createElement("video");
    const blocked = vi.fn();
    const result = playAttempt(
      video,
      attempt,
      new PlexClient("x"),
      new AbortController().signal,
      () => {},
      () => {},
      blocked,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(blocked).toHaveBeenCalledOnce();
    video.dispatchEvent(new Event("play"));
    const check = expect(result).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(12000);
    await check;
    expect(video.hasAttribute("src")).toBe(false);
  });
});

describe("HLS decision lifecycle", () => {
  const hlsAttempt = {
    kind: "hls" as const,
    source: "Plex trailer" as const,
    session: "preview-one",
    path: "/video/:/transcode/universal/start.m3u8?session=preview-one&path=%2Flibrary%2Fmetadata%2F200",
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue(
      "probably",
    );
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });
  afterEach(() => vi.useRealTimers());
  function setup() {
    const client = new PlexClient("x");
    const stop = vi.spyOn(client, "stopPreviewSession").mockResolvedValue();
    const video = document.createElement("video");
    const controller = new AbortController();
    const resolved = vi.fn(),
      playing = vi.fn();
    const run = () =>
      playAttempt(
        video,
        hlsAttempt,
        client,
        controller.signal,
        resolved,
        playing,
      );
    return { client, stop, video, controller, resolved, playing, run };
  }
  it("waits for approval without marking the source resolved or playback successful", async () => {
    const { client, video, resolved, playing, controller, stop, run } = setup();
    let approve!: () => void;
    vi.spyOn(client, "preparePreview").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          approve = resolve;
        }),
    );
    const result = run();
    expect(video.hasAttribute("src")).toBe(false);
    expect(resolved).not.toHaveBeenCalled();
    expect(playing).not.toHaveBeenCalled();
    approve();
    await Promise.resolve();
    expect(video.src).toContain("start.m3u8");
    expect(resolved).not.toHaveBeenCalled();
    video.dispatchEvent(new Event("loadedmetadata"));
    expect(resolved).toHaveBeenCalledOnce();
    expect(playing).not.toHaveBeenCalled();
    video.dispatchEvent(new Event("playing"));
    expect(playing).toHaveBeenCalledOnce();
    const check = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await check;
    expect(stop).toHaveBeenCalledExactlyOnceWith("preview-one");
  });
  it("never starts a stream when the decision fails", async () => {
    const { client, video, stop, run } = setup();
    vi.spyOn(client, "preparePreview").mockRejectedValue(
      new Error("Decision denied"),
    );
    await expect(run()).rejects.toThrow("Decision denied");
    expect(video.hasAttribute("src")).toBe(false);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledOnce();
  });
  it.each(["cancel", "timeout"])(
    "ignores a late decision after %s and releases its request",
    async (mode) => {
      const { client, video, controller, stop, run } = setup();
      let approve!: () => void;
      let signal!: AbortSignal;
      vi.spyOn(client, "preparePreview").mockImplementation((_path, input) => {
        signal = input;
        return new Promise<void>((resolve) => {
          approve = resolve;
        });
      });
      const result = run();
      const check = expect(result).rejects.toMatchObject(
        mode === "cancel" ? { name: "AbortError" } : { code: "timeout" },
      );
      if (mode === "cancel") controller.abort();
      else await vi.advanceTimersByTimeAsync(12000);
      await check;
      expect(signal.aborted).toBe(true);
      approve();
      await Promise.resolve();
      expect(video.hasAttribute("src")).toBe(false);
      expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
      expect(stop).toHaveBeenCalledExactlyOnceWith("preview-one");
    },
  );
});
