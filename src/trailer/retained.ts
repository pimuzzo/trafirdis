import type { PlexClient } from "../plex/client";
import { playAttempt, type PlaybackControl } from "./player";
import type { PlaybackAttempt } from "./types";

const retentionMs = 30000;
const retainedLimit = 2;
const bufferLimitSeconds = 60;

export interface PlaybackEvents {
  resolved(): void;
  playing(): void;
  blocked(): void;
}

// An open playback owns its element and cancellation independently of a surface.
// Retaining that element keeps the browser's buffer attached to its MediaSource.
export class PreviewPlayback {
  readonly controller = new AbortController();
  readonly result: Promise<void>;
  control?: PlaybackControl;
  events?: PlaybackEvents;
  played = false;
  settled = false;
  onSettled?: () => void;
  private waiters = new Set<(error?: unknown) => void>();
  private failure?: unknown;
  constructor(
    readonly video: HTMLVideoElement,
    readonly attempt: PlaybackAttempt,
    client: PlexClient,
    events: PlaybackEvents,
    readonly epoch: number,
  ) {
    this.events = events;
    this.result = playAttempt(
      video,
      attempt,
      client,
      this.controller.signal,
      () => this.events?.resolved(),
      () => {
        this.played = true;
        this.events?.playing();
      },
      () => this.events?.blocked(),
      (control) => {
        this.control = control;
      },
    );
    void this.result.then(
      () => this.finish(),
      (error: unknown) => this.finish(error),
    );
    // A retained playback has no mounted consumer until it is reused or expired.
    void this.result.catch(() => {});
  }
  private finish(error?: unknown) {
    this.settled = true;
    this.failure = error;
    for (const waiter of this.waiters) waiter(error);
    this.waiters.clear();
    this.onSettled?.();
  }
  wait(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.settled)
      return this.failure ? Promise.reject(this.failure) : Promise.resolve();
    return new Promise((resolve, reject) => {
      const complete = (error?: unknown) => {
        this.waiters.delete(complete);
        signal.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve();
      };
      const abort = () =>
        complete(new DOMException("Preview cancelled", "AbortError"));
      this.waiters.add(complete);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  reusable(): boolean {
    if (
      this.attempt.kind !== "hls" ||
      !this.played ||
      this.settled ||
      this.controller.signal.aborted ||
      !this.control ||
      this.video.error
    )
      return false;
    const ranges = this.video.buffered;
    // Retain only short buffers containing the start. Native buffering is browser
    // controlled, so reject larger buffers rather than claiming a byte limit.
    let duration = 0;
    for (let i = 0; i < ranges.length; i++)
      duration += ranges.end(i) - ranges.start(i);
    return (
      ranges.length > 0 &&
      ranges.start(0) <= 0.05 &&
      ranges.end(0) >= 0.25 &&
      duration <= bufferLimitSeconds
    );
  }
  dispose() {
    this.events = undefined;
    this.controller.abort();
  }
}

export class RetainedPreviews {
  epoch = 0;
  private entries = new Map<
    string,
    {
      playback: PreviewPlayback;
      timer: ReturnType<typeof setTimeout>;
      expires: number;
    }
  >();
  has(id: string): boolean {
    const entry = this.entries.get(id);
    if (entry && entry.expires <= Date.now()) this.remove(id);
    return this.entries.has(id);
  }
  owns(video: HTMLVideoElement): boolean {
    return [...this.entries.values()].some(
      (entry) => entry.playback.video === video,
    );
  }
  take(id: string): PreviewPlayback | undefined {
    if (!this.has(id)) return;
    const entry = this.entries.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.entries.delete(id);
    entry.playback.onSettled = undefined;
    if (entry.playback.reusable()) return entry.playback;
    entry.playback.dispose();
  }
  retain(id: string, playback: PreviewPlayback): boolean {
    if (playback.epoch !== this.epoch || !playback.reusable()) return false;
    this.remove(id);
    playback.events = undefined;
    playback.control!.suspend();
    playback.video.remove();
    const timer = setTimeout(() => this.remove(id), retentionMs);
    this.entries.set(id, {
      playback,
      timer,
      expires: Date.now() + retentionMs,
    });
    while (this.entries.size > retainedLimit)
      this.remove(this.entries.keys().next().value!);
    playback.onSettled = () => this.removeIfCurrent(id, playback);
    return true;
  }
  private removeIfCurrent(id: string, playback: PreviewPlayback) {
    if (this.entries.get(id)?.playback === playback) this.remove(id);
  }
  remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.entries.delete(id);
    entry.playback.onSettled = undefined;
    entry.playback.dispose();
  }
  clear() {
    this.epoch++;
    for (const id of this.entries.keys()) this.remove(id);
  }
}
