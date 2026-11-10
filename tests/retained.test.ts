import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlexClient } from "../src/plex/client";
import { playAttempt } from "../src/trailer/player";
import { PreviewPlayback, RetainedPreviews } from "../src/trailer/retained";
vi.mock("../src/trailer/player", () => ({ playAttempt: vi.fn() }));

describe("bounded retained preview sessions", () => {
  const leases: PreviewPlayback[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(playAttempt)
      .mockReset()
      .mockImplementation(
        (
          video,
          _attempt,
          _client,
          signal,
          _resolved,
          playing,
          _blocked,
          ready,
        ) => {
          ready?.({
            suspend: vi.fn(() => {
              video.muted = true;
            }),
            restart: vi.fn(() => true),
          });
          playing();
          return new Promise<void>((_resolve, reject) =>
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Cancelled", "AbortError")),
              { once: true },
            ),
          );
        },
      );
  });
  afterEach(() => {
    for (const lease of leases) lease.dispose();
    leases.length = 0;
    document.body.replaceChildren();
    vi.useRealTimers();
  });
  function lease(pool: RetainedPreviews, session: string, start = 0, end = 6) {
    const video = document.createElement("video");
    document.body.append(video);
    Object.defineProperty(video, "buffered", {
      configurable: true,
      value: {
        length: 1,
        start: () => start,
        end: () => end,
      },
    });
    const playback = new PreviewPlayback(
      video,
      {
        path: `/video/:/transcode/universal/start.m3u8?session=${session}`,
        kind: "hls",
        source: "Plex trailer",
        session,
      },
      new PlexClient("x"),
      { resolved: vi.fn(), playing: vi.fn(), blocked: vi.fn() },
      pool.epoch,
    );
    leases.push(playback);
    return playback;
  }
  it("keeps the existing element/source, mutes and suspends it, then takes it only once", () => {
    const pool = new RetainedPreviews();
    const a = lease(pool, "A");
    const events = a.events!;
    a.video.src = "http://localhost/existing-buffer";
    expect(pool.retain("1", a)).toBe(true);
    expect(a.control?.suspend).toHaveBeenCalledOnce();
    expect(a.video.muted).toBe(true);
    expect(a.video.isConnected).toBe(false);
    expect(a.events).toBeUndefined();
    vi.mocked(playAttempt).mock.calls[0][5]();
    expect(events.playing).toHaveBeenCalledOnce();
    expect(pool.take("1")).toBe(a);
    expect(a.video.src).toBe("http://localhost/existing-buffer");
    expect(pool.take("1")).toBeUndefined();
    expect(a.controller.signal.aborted).toBe(false);
  });
  it("cancels an obsolete surface wait without aborting its retained playback", async () => {
    const pool = new RetainedPreviews();
    const a = lease(pool, "A");
    const first = new AbortController();
    const firstWait = expect(a.wait(first.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    first.abort();
    await firstWait;
    expect(a.controller.signal.aborted).toBe(false);
    pool.retain("1", a);
    const taken = pool.take("1")!;
    const second = new AbortController();
    const secondWait = expect(taken.wait(second.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    taken.dispose();
    await secondWait;
  });
  it("expires an unused buffer after 30 seconds and aborts its session", async () => {
    const pool = new RetainedPreviews();
    const a = lease(pool, "A");
    pool.retain("1", a);
    await vi.advanceTimersByTimeAsync(29999);
    expect(pool.has("1")).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(pool.take("1")).toBeUndefined();
    expect(a.controller.signal.aborted).toBe(true);
  });
  it("evicts the oldest of more than two retained sessions", () => {
    const pool = new RetainedPreviews();
    const a = lease(pool, "A"),
      b = lease(pool, "B"),
      c = lease(pool, "C");
    pool.retain("1", a);
    pool.retain("2", b);
    pool.retain("3", c);
    expect(pool.has("1")).toBe(false);
    expect(a.controller.signal.aborted).toBe(true);
    expect(pool.has("2")).toBe(true);
    expect(pool.has("3")).toBe(true);
    pool.clear();
    expect(b.controller.signal.aborted).toBe(true);
    expect(c.controller.signal.aborted).toBe(true);
  });
  it.each([
    [1, 6],
    [0, 0.1],
    [0, 61],
  ])(
    "rejects a missing start or oversized/insufficient buffer %s–%s",
    (start, end) => {
      const pool = new RetainedPreviews();
      expect(pool.retain("1", lease(pool, "A", start, end))).toBe(false);
    },
  );
  it("does not retain direct, unverified, errored or settled playback", () => {
    const pool = new RetainedPreviews();
    const a = lease(pool, "A");
    a.played = false;
    expect(pool.retain("1", a)).toBe(false);
    a.played = true;
    a.settled = true;
    expect(pool.retain("1", a)).toBe(false);
    a.settled = false;
    a.attempt.kind = "direct";
    expect(pool.retain("1", a)).toBe(false);
    a.attempt.kind = "hls";
    Object.defineProperty(a.video, "error", { value: { code: 2 } });
    expect(pool.retain("1", a)).toBe(false);
  });
  it("drops a retained buffer that became unusable and prevents late re-insertion after clear", () => {
    const pool = new RetainedPreviews();
    const a = lease(pool, "A");
    pool.retain("1", a);
    Object.defineProperty(a.video, "buffered", { value: { length: 0 } });
    expect(pool.take("1")).toBeUndefined();
    expect(a.controller.signal.aborted).toBe(true);
    const b = lease(pool, "B");
    pool.clear();
    expect(pool.retain("2", b)).toBe(false);
  });
  it("cannot remove a replacement entry when an older cancelled session settles", async () => {
    const pool = new RetainedPreviews();
    const a = lease(pool, "A"),
      b = lease(pool, "B");
    pool.retain("1", a);
    pool.retain("1", b);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(pool.take("1")).toBe(b);
    expect(b.controller.signal.aborted).toBe(false);
  });
});
