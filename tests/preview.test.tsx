import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefObject } from "react";
import { usePreview } from "../src/hooks/usePreview";
import { TrailerService } from "../src/trailer/service";
import { PlexClient, PlexError } from "../src/plex/client";
import { playAttempt, PlaybackError } from "../src/trailer/player";
vi.mock("../src/trailer/player", () => ({
  playAttempt: vi.fn(),
  releaseVideo: vi.fn(),
  PlaybackError: class extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
const discovery = {
  metadataFound: true,
  candidates: [
    {
      id: "2",
      title: "Trailer",
      key: "/library/metadata/2",
      source: "Plex trailer" as const,
      parts: [],
    },
  ],
};
const pending = (
  _video: unknown,
  _attempt: unknown,
  _client: unknown,
  signal: AbortSignal,
) =>
  new Promise<void>((_resolve, reject) =>
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("Cancelled", "AbortError")),
      { once: true },
    ),
  );
describe("automatic preview lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(playAttempt).mockReset().mockImplementation(pending);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  function setup() {
    const service = new TrailerService(new PlexClient("x"));
    const discover = vi.spyOn(service, "discover").mockResolvedValue(discovery);
    vi.spyOn(service, "attempts").mockReturnValue([
      {
        path: "/library/parts/2/file.mp4",
        kind: "direct",
        source: "Plex trailer",
      },
    ]);
    const video = document.createElement("video");
    const ref = { current: video } as RefObject<HTMLVideoElement>;
    return { service, discover, ref };
  }
  it("waits 1.5 seconds and cancels rapid selections before any metadata or video request", async () => {
    const { service, discover, ref } = setup();
    const { rerender } = renderHook(
      ({ id }) => usePreview(ref, service, id, true, 0),
      { initialProps: { id: "A" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(1000));
    rerender({ id: "B" });
    await act(() => vi.advanceTimersByTimeAsync(1499));
    expect(discover).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(discover).toHaveBeenCalledWith("B", expect.any(AbortSignal));
    expect(playAttempt).toHaveBeenCalledTimes(1);
    expect(ref.current?.muted).toBe(true);
  });
  it("aborts the previous stream on selection and stops when hidden or unmounted", async () => {
    const { service, ref } = setup();
    const { rerender, unmount } = renderHook(
      ({ id, enabled }) => usePreview(ref, service, id, enabled, 0),
      { initialProps: { id: "A", enabled: true } },
    );
    await act(() => vi.advanceTimersByTimeAsync(1500));
    const first = vi.mocked(playAttempt).mock.calls[0][3];
    rerender({ id: "B", enabled: true });
    expect(first.aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(1500));
    const second = vi.mocked(playAttempt).mock.calls[1][3];
    rerender({ id: "B", enabled: false });
    expect(second.aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(playAttempt).toHaveBeenCalledTimes(2);
    unmount();
  });
  it("ignores an older metadata response that arrives after the selection changed", async () => {
    const { service, discover, ref } = setup();
    let finish: (v: typeof discovery) => void = () => {};
    discover.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { rerender } = renderHook(
      ({ id }) => usePreview(ref, service, id, true, 0),
      { initialProps: { id: "A" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(1500));
    rerender({ id: "B" });
    await act(async () => finish(discovery));
    expect(playAttempt).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(playAttempt).toHaveBeenCalledTimes(1);
  });
  it("synchronizes the mute control whenever the same movie restarts", async () => {
    const { service, ref } = setup();
    const onMuteChange = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => usePreview(ref, service, "A", enabled, 0, onMuteChange),
      { initialProps: { enabled: true } },
    );
    await act(() => vi.advanceTimersByTimeAsync(1500));
    ref.current!.muted = false;
    onMuteChange.mockClear();
    rerender({ enabled: false });
    expect(ref.current!.muted).toBe(true);
    expect(onMuteChange).toHaveBeenLastCalledWith(true);
    onMuteChange.mockClear();
    rerender({ enabled: true });
    expect(onMuteChange).toHaveBeenLastCalledWith(true);
  });
  it("tries Plex streaming after a direct playback failure and records actual playing events", async () => {
    const { service, ref } = setup();
    vi.spyOn(service, "attempts").mockReturnValue([
      { path: "/direct", kind: "direct", source: "Plex trailer" },
      { path: "/hls", kind: "hls", source: "Plex trailer" },
    ]);
    vi.mocked(playAttempt)
      .mockRejectedValueOnce(
        new PlaybackError("unsupported", "Unsupported codec"),
      )
      .mockImplementationOnce(async (_v, _a, _c, _s, resolved, playing) => {
        resolved();
        playing();
      });
    const { result } = renderHook(() => usePreview(ref, service, "A", true, 0));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(playAttempt).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({
      phase: "ended",
      urlResolved: true,
      playbackSucceeded: true,
      method: "Plex HLS",
    });
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(playAttempt).toHaveBeenCalledTimes(2);
  });
  it.each([400, 401])(
    "preserves decision HTTP %s and stops fallback on authentication failure",
    async (status) => {
      const { service, ref } = setup();
      vi.spyOn(service, "attempts").mockReturnValue([
        { path: "/first", kind: "hls", source: "Plex trailer" },
        { path: "/second", kind: "hls", source: "Plex trailer" },
      ]);
      vi.mocked(playAttempt).mockRejectedValue(
        new PlexError(
          status === 401 ? "auth" : "response",
          "Safe decision failure",
          status,
        ),
      );
      const { result } = renderHook(() =>
        usePreview(ref, service, "A", true, 0),
      );
      await act(() => vi.advanceTimersByTimeAsync(1500));
      expect(result.current).toMatchObject({
        phase: "error",
        failure: status === 401 ? "auth" : "response",
        httpStatus: status,
        reason: "Safe decision failure",
        playbackSucceeded: false,
      });
      expect(playAttempt).toHaveBeenCalledTimes(status === 401 ? 1 : 2);
    },
  );
  it("reports unavailable metadata without trying to load a video", async () => {
    const { service, discover, ref } = setup();
    discover.mockResolvedValue({
      metadataFound: false,
      candidates: [],
      reason: "No extras",
    });
    const { result } = renderHook(() => usePreview(ref, service, "A", true, 0));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current).toMatchObject({
      phase: "unavailable",
      reason: "No extras",
    });
    expect(playAttempt).not.toHaveBeenCalled();
  });
  it("clears autoplay failure once the same media actually starts", async () => {
    const { service, ref } = setup();
    vi.mocked(playAttempt).mockImplementationOnce(
      (video, attempt, client, signal, _resolved, playing, blocked) => {
        blocked?.();
        playing();
        return pending(video, attempt, client, signal);
      },
    );
    const { result } = renderHook(() => usePreview(ref, service, "A", true, 0));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current).toMatchObject({
      phase: "playing",
      playbackSucceeded: true,
    });
    expect(result.current.failure).toBeUndefined();
    expect(service.snapshot()[0].failure).toBeUndefined();
  });
  it("records the last candidate failure without inheriting an earlier codec error", async () => {
    const { service, ref } = setup();
    vi.spyOn(service, "attempts").mockReturnValue([
      { path: "/direct", kind: "direct", source: "Plex trailer" },
      { path: "/hls", kind: "hls", source: "Plex trailer" },
    ]);
    vi.mocked(playAttempt)
      .mockRejectedValueOnce(
        new PlaybackError("unsupported", "Unsupported codec"),
      )
      .mockRejectedValueOnce(new Error("private upstream detail"));
    const { result } = renderHook(() => usePreview(ref, service, "A", true, 0));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current).toMatchObject({
      phase: "error",
      failure: "unknown",
      reason: "The trailer stream could not be played.",
    });
  });
  it("reports discovery failures while leaving browsing independent", async () => {
    const { service, discover, ref } = setup();
    discover.mockRejectedValue(new Error("Unexpected private detail"));
    const { result } = renderHook(() => usePreview(ref, service, "A", true, 0));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current.phase).toBe("error");
    expect(result.current.reason).not.toContain("private detail");
  });
  it("keeps a popup mute choice through navigation and restarts", async () => {
    const { service, ref } = setup();
    const preference = { current: true };
    const notify = vi.fn();
    const { rerender } = renderHook(
      ({ id, enabled }) => {
        return usePreview(ref, service, id, enabled, 0, notify, 0, preference);
      },
      { initialProps: { id: "A", enabled: true } },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    const first = vi.mocked(playAttempt).mock.calls[0][3];
    preference.current = false;
    ref.current!.muted = false;
    rerender({ id: "A", enabled: true });
    expect(first.aborted).toBe(false);
    expect(playAttempt).toHaveBeenCalledOnce();
    rerender({ id: "B", enabled: true });
    expect(first.aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(ref.current!.muted).toBe(false);
    expect(notify).toHaveBeenLastCalledWith(false);
    rerender({ id: "B", enabled: false });
    rerender({ id: "B", enabled: true });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(ref.current!.muted).toBe(false);
    preference.current = true;
    rerender({ id: "C", enabled: true });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(ref.current!.muted).toBe(true);
    expect(notify).toHaveBeenLastCalledWith(true);
  });
  it("keeps blocked playback ready as metadata arrives", async () => {
    const { service, ref } = setup();
    vi.mocked(playAttempt).mockImplementationOnce(
      (video, attempt, client, signal, resolved, _playing, blocked) => {
        blocked?.();
        resolved();
        return pending(video, attempt, client, signal);
      },
    );
    const { result } = renderHook(() => usePreview(ref, service, "A", true, 0));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(result.current).toMatchObject({
      phase: "blocked",
      urlResolved: true,
      playbackSucceeded: false,
      failure: "autoplay",
    });
  });
});
