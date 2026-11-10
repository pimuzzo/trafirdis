import { test, expect, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ page }) => {
  // Keep existing playback fixtures deterministic; random selection has its own case.
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
});
const films = [
  {
    ratingKey: "1",
    key: "/library/metadata/1",
    type: "movie",
    title: "First Light",
    summary: "A quiet journey beyond the horizon.",
    year: 2024,
    duration: 6600000,
    audienceRating: 8.4,
    Genre: [{ tag: "Science Fiction" }, { tag: "Drama" }],
    addedAt: 3,
    thumb: "/library/metadata/1/thumb/1",
    art: "/library/metadata/1/art/1",
  },
  {
    ratingKey: "2",
    key: "/library/metadata/2",
    type: "movie",
    title: "Second Chance",
    summary: "A second beginning.",
    year: 2023,
    duration: 5100000,
    audienceRating: 7.2,
    Genre: [{ tag: "Drama" }],
    addedAt: 2,
    viewCount: 1,
  },
  {
    ratingKey: "3",
    key: "/library/metadata/3",
    type: "movie",
    title: "Third Shore",
    summary: "An ocean of possibilities.",
    year: 2024,
    duration: 8100000,
    audienceRating: 8.6,
    Genre: [{ tag: "Adventure" }],
    addedAt: 1,
  },
];
async function mockPlex(
  page: Page,
  options: {
    status?: number;
    empty?: boolean;
    noLibraries?: boolean;
    trailer?: "direct" | "hls" | "missing" | "broken" | "external";
    delayed?: boolean;
    allWatched?: boolean;
    libraries?: { key: string; title: string }[];
    decision?: "denied" | "malformed" | "auth";
  } = {},
) {
  const requests: { path: string; method: string; token?: string }[] = [];
  const decisions = new Map<string, string>();
  const signature = (url: URL) => {
    const params = new URLSearchParams(url.search);
    params.delete("X-Plex-Token");
    params.sort();
    return params.toString();
  };
  const fulfill = (route: Route, MediaContainer: unknown) =>
    route.fulfill({ json: { MediaContainer } });
  await page.route("http://127.0.0.1:5175/plex/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/plex/, "");
    requests.push({
      path,
      method: route.request().method(),
      token: route.request().headers()["x-plex-token"],
    });
    if (options.status)
      return route.fulfill({ status: options.status, body: "Invalid token" });
    if (path === "/")
      return fulfill(route, {
        friendlyName: "Test server",
        machineIdentifier: "test-machine",
        version: "1.43.0",
      });
    if (path === "/library/sections")
      return fulfill(route, {
        Directory: options.noLibraries
          ? []
          : (options.libraries || [{ key: "1", title: "Movies" }]).map(
              (library) => ({ ...library, type: "movie" }),
            ),
      });
    if (/^\/library\/sections\/[12]\/all$/.test(path))
      return fulfill(route, {
        totalSize: options.empty ? 0 : films.length,
        Metadata: options.empty
          ? []
          : options.allWatched
            ? films.map((film) => ({ ...film, viewCount: 1 }))
            : films,
      });
    if (path.startsWith("/photo/"))
      return route.fulfill({
        path: "public/sample/art-0.svg",
        contentType: "image/svg+xml",
      });
    if (/^\/library\/metadata\/\d+$/.test(path)) {
      const id = path.split("/").at(-1)!;
      const film = films.find((f) => f.ratingKey === id)!;
      if (options.delayed)
        await new Promise((resolve) => setTimeout(resolve, 100));
      return fulfill(route, {
        Metadata: [
          {
            ...film,
            Extras: {
              Metadata:
                options.trailer === "missing"
                  ? []
                  : [
                      {
                        ratingKey: `${id}00`,
                        key: `/library/metadata/${id}00`,
                        subtype: "trailer",
                        type: "clip",
                        Media:
                          options.trailer === "hls" ||
                          options.trailer === "external"
                            ? []
                            : [
                                {
                                  container: "webm",
                                  videoCodec: "vp8",
                                  audioCodec: "vorbis",
                                  Part: [
                                    {
                                      key: `/library/parts/${id}/trailer.webm`,
                                    },
                                  ],
                                },
                              ],
                      },
                    ],
            },
          },
        ],
      });
    }
    if (path.startsWith("/library/parts/"))
      return options.trailer === "broken"
        ? route.fulfill({ status: 404 })
        : route.fulfill({
            body: await readFile("tests/fixtures/preview.webm"),
            contentType: "video/webm",
          });
    if (path.endsWith("/decision")) {
      if (options.decision === "auth") return route.fulfill({ status: 401 });
      decisions.set(url.searchParams.get("session")!, signature(url));
      return fulfill(
        route,
        options.decision === "malformed"
          ? {}
          : {
              generalDecisionCode: options.decision === "denied" ? 2000 : 1001,
              transcodeDecisionCode:
                options.decision === "denied" ? 4005 : 1001,
            },
      );
    }
    if (path.endsWith("start.m3u8")) {
      if (decisions.get(url.searchParams.get("session")!) !== signature(url))
        return route.fulfill({ status: 400, body: "Session lacks decision" });
      if (options.trailer === "broken") return route.fulfill({ status: 404 });
      if (options.trailer === "external")
        return route.fulfill({
          body: "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6.0,\nhttps://outside.example/segment.ts\n#EXT-X-ENDLIST\n",
          contentType: "application/vnd.apple.mpegurl",
        });
      return route.fulfill({
        body: await readFile("tests/fixtures/preview.m3u8"),
        contentType: "application/vnd.apple.mpegurl",
      });
    }
    if (path.endsWith(".ts"))
      return route.fulfill({
        body: await readFile("tests/fixtures/segment-0.ts"),
        contentType: "video/mp2t",
      });
    if (path.endsWith("/stop")) {
      decisions.delete(url.searchParams.get("session")!);
      return route.fulfill({ status: 200, body: "" });
    }
    return route.fulfill({ status: 404 });
  });
  return requests;
}
function recentCards(page: Page) {
  return page
    .getByRole("region", { name: "Recently Added", exact: true })
    .locator("[data-movie]");
}
async function connect(page: Page, random?: number) {
  await page.goto("/");
  if (random !== undefined)
    await page.evaluate((value) => {
      Math.random = () => value;
    }, random);
  await page.mouse.move(0, 0);
  await page.getByText("Use a Plex token instead", { exact: true }).click();
  await page.getByLabel("Plex authentication token").fill("fixture-token");
  await page
    .getByRole("button", { name: "Connect my library", exact: true })
    .click();
}
test("Trafirdis identity, favicon and privacy notice are available without external requests", async ({
  page,
  request,
}) => {
  const external: string[] = [];
  page.on("request", (event) => {
    if (new URL(event.url()).origin !== "http://127.0.0.1:5175")
      external.push(event.url());
  });
  await page.goto("/");
  await expect(page).toHaveTitle("Trafirdis · Trailer-first discovery");
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute(
    "content",
    "Trafirdis",
  );
  await expect(
    page.getByText("Discover your next movie, one trailer at a time."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Privacy notice" }),
  ).toHaveAttribute("href", "/privacy.html");
  await expect
    .poll(() =>
      page
        .locator(".welcome-header .brand-mark")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/favicon.svg",
  );
  const favicon = await request.get("/favicon.svg");
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toContain("image/svg+xml");
  expect(await favicon.text()).toContain("Trafirdis");
  const privacy = await request.get("/privacy.html");
  expect(privacy.status()).toBe(200);
  expect(await privacy.text()).toContain("Privacy notice · Trafirdis");
  expect(external).toEqual([]);
});
test("Trafirdis reuses its browser session and keeps the device identity on disconnect", async ({
  page,
}) => {
  const identityHeaders: Record<string, string>[] = [];
  await mockPlex(page, { trailer: "missing" });
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/plex/" || path === "/plex/library/sections")
      identityHeaders.push(request.headers());
  });
  await page.addInitScript(() => {
    sessionStorage.setItem("trafirdis.token", "existing-session-token");
    localStorage.setItem("trafirdis.client-id", "existing-device-identifier");
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "First Light", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Trafirdis home" }),
  ).toBeVisible();
  expect(identityHeaders.length).toBeGreaterThanOrEqual(2);
  expect(
    identityHeaders.every(
      (headers) =>
        headers["x-plex-token"] === "existing-session-token" &&
        headers["x-plex-client-identifier"] === "existing-device-identifier" &&
        headers["x-plex-product"] === "Trafirdis",
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Connection settings" }).click();
  await page
    .getByRole("button", { name: "Disconnect and clear session" })
    .click();
  expect(
    await page.evaluate(() => sessionStorage.getItem("trafirdis.token")),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("trafirdis.client-id")),
  ).toBe("existing-device-identifier");
});
test("welcome and sample catalog are polished, usable, and entirely local", async ({
  page,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:5175") &&
      !request.url().startsWith("data:") &&
      !request.url().startsWith("blob:")
    )
      external.push(request.url());
  });
  await page.goto("/");
  await page.mouse.move(0, 0);
  await expect(
    page.getByRole("heading", { name: "Your library. A new perspective." }),
  ).toBeVisible();
  await page.screenshot({ path: "work/welcome-desktop.png" });
  await page
    .getByRole("button", { name: "Explore the sample library" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "The Quiet Orbit", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("YOU’RE EXPLORING THE SAMPLE LIBRARY"),
  ).toBeVisible();
  await page.screenshot({ path: "work/catalog-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "More info" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search movies")).toBeFocused();
  await page.keyboard.type("Paper Moons");
  await expect(
    recentCards(page).filter({ hasText: "Paper Moons" }),
  ).toBeVisible();
  await expect(recentCards(page)).toHaveCount(1);
  await page.getByLabel("Search movies").fill("no such title");
  await expect(
    page.getByRole("heading", { name: "No films match this combination" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("combines filters without additional Plex requests and supports keyboard navigation", async ({
  page,
}) => {
  const requests = await mockPlex(page, { trailer: "missing" });
  await connect(page);
  await expect(page.locator("[data-rail]")).toHaveCount(5);
  const cards = page
    .getByRole("region", { name: "Recently Added", exact: true })
    .locator("[data-movie]");
  await cards.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(cards.nth(1)).toBeFocused();
  await expect(page.locator(".hero h1")).toHaveText("First Light");
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Second Chance", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cards.nth(1)).toBeFocused();
  const before = requests.filter((r) => r.path.endsWith("/all")).length;
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Genre", { exact: true }).selectOption("Drama");
  await page.getByLabel("Release year").selectOption("2024");
  await page.getByLabel("Watch status").selectOption("unwatched");
  await page.getByLabel("Runtime").selectOption("medium");
  await page.getByLabel("Rating", { exact: true }).selectOption("8");
  await expect(recentCards(page)).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Recently Added", exact: true }),
  ).toContainText("First Light");
  expect(requests.filter((r) => r.path.endsWith("/all"))).toHaveLength(before);
});
test("plays a native trailer after the delay, muted and inline, and stops on hiding", async ({
  page,
}) => {
  const requests = await mockPlex(page, { trailer: "direct" });
  await connect(page);
  const preview = page.locator("[data-preview-phase]");
  await expect(preview).toHaveAttribute("data-preview-phase", "playing", {
    timeout: 10000,
  });
  const video = page.locator("video");
  expect(
    await video.evaluate((v) => ({
      muted: v.muted,
      inline: v.playsInline,
      loop: v.loop,
    })),
  ).toEqual({ muted: true, inline: true, loop: false });
  await expect(page.locator("video")).toHaveCount(1);
  await page.getByRole("button", { name: "Unmute preview" }).click();
  expect(await video.evaluate((v) => v.muted)).toBe(false);
  await page.getByRole("button", { name: "Connection settings" }).click();
  await expect(preview).toHaveAttribute("data-preview-phase", "paused");
  expect(await video.evaluate((v) => v.hasAttribute("src"))).toBe(false);
  await page.keyboard.press("Escape");
  expect(requests.every((r) => r.method === "GET")).toBe(true);
  expect(
    requests.some((r) => /timeline|scrobble|playQueues/.test(r.path)),
  ).toBe(false);
});
test("hero keeps audio and matching controls after pause, settings and visibility restarts", async ({
  page,
}) => {
  test.setTimeout(60000);
  await mockPlex(page, { trailer: "direct" });
  await connect(page);
  const preview = page.locator("[data-preview-phase]");
  const video = page.locator("video");
  const expectUnmuted = async () => {
    await expect(preview).toHaveAttribute("data-preview-phase", "playing");
    await expect(
      page.getByRole("button", { name: "Mute preview", exact: true }),
    ).toBeEnabled();
    expect(await video.evaluate((element) => element.muted)).toBe(false);
  };
  await expect(preview).toHaveAttribute("data-preview-phase", "playing");
  expect(await video.evaluate((element) => element.muted)).toBe(true);
  await page.getByRole("button", { name: "Unmute preview" }).click();
  await expectUnmuted();
  await page.getByRole("button", { name: "Pause preview" }).click();
  await expect(preview).toHaveAttribute("data-preview-phase", "paused");
  await page.getByRole("button", { name: "Play preview" }).click();
  await expectUnmuted();
  await page.getByRole("button", { name: "Connection settings" }).click();
  await expect(preview).toHaveAttribute("data-preview-phase", "paused");
  await page.keyboard.press("Escape");
  await expectUnmuted();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(preview).toHaveAttribute("data-preview-phase", "paused");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expectUnmuted();
});
test("poster focus does not replace the random featured movie or its preview", async ({
  page,
}) => {
  const requests = await mockPlex(page, { trailer: "direct" });
  await connect(page);
  await expect(
    page.getByRole("heading", { name: "First Light", exact: true }),
  ).toBeVisible();
  const cards = page
    .getByRole("region", { name: "Recently Added", exact: true })
    .locator("[data-movie]");
  await cards
    .nth(1)
    .evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
  await cards
    .nth(2)
    .evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
  await expect(page.locator("[data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "playing",
    { timeout: 10000 },
  );
  expect(
    requests
      .filter((r) => /^\/library\/metadata\//.test(r.path))
      .map((r) => r.path),
  ).toEqual(["/library/metadata/1"]);
  expect(
    requests
      .filter((r) => r.path.startsWith("/library/parts/"))
      .map((r) => r.path),
  ).toEqual(["/library/parts/1/trailer.webm"]);
});
test("plays Plex HLS through the lazy fallback in Chromium", async ({
  page,
}) => {
  const requests = await mockPlex(page, { trailer: "hls" });
  await connect(page);
  await expect(page.locator("[data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "playing",
    { timeout: 15000 },
  );
  expect(requests.some((r) => r.path.endsWith("start.m3u8"))).toBe(true);
  expect(requests.some((r) => r.path.endsWith(".ts"))).toBe(true);
  await page.getByRole("button", { name: "Pause preview" }).click();
  await expect(page.locator("[data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "paused",
  );
  await expect
    .poll(() => requests.some((r) => r.path.endsWith("/stop")))
    .toBe(true);
});
for (const surface of ["hero", "details"] as const) {
  test(`${surface} disables Play and shows status loading until media starts`, async ({
    page,
  }) => {
    await mockPlex(page, { trailer: "direct" });
    const id = surface === "hero" ? "1" : "2";
    let releaseMetadata!: () => void;
    let releaseMedia!: () => void;
    const metadataGate = new Promise<void>((resolve) => {
      releaseMetadata = resolve;
    });
    const mediaGate = new Promise<void>((resolve) => {
      releaseMedia = resolve;
    });
    let metadataRequests = 0;
    let mediaRequests = 0;
    await page.route(
      (url) => url.pathname === `/plex/library/metadata/${id}`,
      async (route) => {
        metadataRequests++;
        await metadataGate;
        await route.fallback();
      },
    );
    await page.route(
      (url) => url.pathname.startsWith(`/plex/library/parts/${id}/`),
      async (route) => {
        mediaRequests++;
        await mediaGate;
        await route.fallback();
      },
    );
    try {
      await connect(page);
      if (surface === "details") await recentCards(page).nth(1).click();
      const host = page.locator(
        surface === "hero" ? ".hero" : ".details-dialog",
      );
      const preview = host.locator("[data-preview-phase]");
      const play = host.getByRole("button", {
        name: "Play preview",
        exact: true,
      });
      await expect(preview).toHaveAttribute("data-preview-phase", "waiting");
      await expect(play).toBeDisabled();
      const status = host.locator(".preview-state");
      const spinner = status.locator(".preview-spinner");
      await expect(status).toHaveText("Finding your preview");
      await expect(spinner).toBeVisible();
      expect(
        await spinner.evaluate(
          (element) => getComputedStyle(element).animationName,
        ),
      ).toBe("preview-spin");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect
        .poll(() =>
          spinner.evaluate(
            (element) => getComputedStyle(element).animationName,
          ),
        )
        .toBe("none");
      await expect(preview).toHaveAttribute(
        "data-preview-phase",
        "discovering",
      );
      await expect(play).toBeDisabled();
      await play.evaluate((element: HTMLButtonElement) => element.click());
      expect(metadataRequests).toBe(1);
      expect(mediaRequests).toBe(0);
      releaseMetadata();
      await expect(preview).toHaveAttribute("data-preview-phase", "resolving");
      await expect.poll(() => mediaRequests).toBe(1);
      await expect(play).toBeDisabled();
      await expect(spinner).toBeVisible();
      await play.evaluate((element: HTMLButtonElement) => element.click());
      expect(metadataRequests).toBe(1);
      releaseMedia();
      await expect(preview).toHaveAttribute("data-preview-phase", "playing");
      await expect(spinner).toHaveCount(0);
      await expect(
        host.getByRole("button", { name: "Pause preview" }),
      ).toBeEnabled();
      await host.getByRole("button", { name: "Pause preview" }).click();
      await expect(preview).toHaveAttribute("data-preview-phase", "paused");
      await expect(play).toBeEnabled();
      await expect(spinner).toHaveCount(0);
      await play.click();
      await expect(preview).toHaveAttribute("data-preview-phase", "playing");
      await host.locator("video").evaluate((video) => {
        video.dispatchEvent(new Event("ended"));
      });
      await expect(preview).toHaveAttribute("data-preview-phase", "ended");
      const replay = host.getByRole("button", { name: "Replay preview" });
      await expect(replay).toBeEnabled();
      await expect(spinner).toHaveCount(0);
      await replay.click();
      await expect(preview).toHaveAttribute("data-preview-phase", "playing");
    } finally {
      releaseMetadata();
      releaseMedia();
    }
  });
}
test("missing trailers and playback failures leave the catalog usable", async ({
  page,
}) => {
  await mockPlex(page, { trailer: "missing" });
  await connect(page);
  await expect(page.getByText("No Plex preview available")).toBeVisible({
    timeout: 10000,
  });
  await expect(
    page.locator(".hero").getByRole("button", { name: "Play preview" }),
  ).toBeDisabled();
  await expect(page.locator(".hero .preview-spinner")).toHaveCount(0);
  await page.getByRole("button", { name: "More info" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("First Light");
  await expect(dialog).toContainText("No Plex preview available");
  await expect(
    dialog.getByRole("button", { name: "Play preview" }),
  ).toBeDisabled();
  await expect(dialog.locator(".preview-spinner")).toHaveCount(0);
  await page.keyboard.press("Escape");
});
test("failed direct and HLS streams fall back to artwork", async ({ page }) => {
  await mockPlex(page, { trailer: "broken" });
  await connect(page);
  await expect(page.locator("[data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "error",
    { timeout: 15000 },
  );
  expect(
    await page.locator("video").evaluate((v) => v.hasAttribute("src")),
  ).toBe(false);
  await expect(page.locator(".hero-background img")).toBeVisible();
  const retry = page
    .locator(".hero")
    .getByRole("button", { name: "Retry preview" });
  await expect(retry).toBeEnabled();
  await expect(page.locator(".hero .preview-spinner")).toHaveCount(0);
  await page.getByLabel("Search movies").fill("Third");
  await expect(
    recentCards(page).filter({ hasText: "Third Shore" }),
  ).toBeVisible();
  await page.route(
    (url) => url.pathname === "/plex/library/parts/1/trailer.webm",
    async (route) =>
      route.fulfill({
        body: await readFile("tests/fixtures/preview.webm"),
        contentType: "video/webm",
      }),
  );
  await retry.click();
  await expect(page.locator(".hero [data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "playing",
  );
  await expect(page.locator(".hero .preview-spinner")).toHaveCount(0);
});
test("does not send a token to external HLS playlist resources", async ({
  page,
}) => {
  let leaks = 0;
  await page.route("https://outside.example/**", (route) => {
    leaks++;
    return route.abort();
  });
  await mockPlex(page, { trailer: "external" });
  await connect(page);
  await expect(page.locator("[data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "error",
    { timeout: 15000 },
  );
  expect(leaks).toBe(0);
});
test("diagnostics inspect a bounded sample without video requests and export only observations", async ({
  page,
}) => {
  await mockPlex(page, { trailer: "missing" });
  await connect(page);
  await expect(page.getByText("No Plex preview available")).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Connection settings" }).click();
  await page.getByRole("button", { name: "Trailer diagnostics" }).click();
  await expect(page.getByRole("dialog")).toContainText("ADVANCED DIAGNOSTICS");
  await page.getByRole("button", { name: "Inspect sample metadata" }).click();
  await expect(
    page.getByRole("cell", { name: "Missing", exact: true }),
  ).toHaveCount(3);
  await expect(page.getByRole("dialog")).not.toContainText("fixture-token");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report" }).click();
  const content = await readFile((await (await downloaded).path())!, "utf8");
  const report = JSON.parse(content);
  expect(report.checks).toHaveLength(3);
  expect(
    report.checks.every(
      (check: { metadataFound: boolean; playbackSucceeded: null }) =>
        check.metadataFound === false && check.playbackSucceeded === null,
    ),
  ).toBe(true);
  expect(content).not.toMatch(
    /fixture-token|First Light|https?:\/\/|X-Plex-Token/,
  );
});
test("diagnostics distinguish a failed metadata request from a missing trailer", async ({
  page,
}) => {
  await mockPlex(page, { trailer: "missing" });
  await page.route("**/plex/library/metadata/2?*", (route) =>
    route.fulfill({ status: 503, body: "private-response-fixture-token" }),
  );
  await connect(page);
  await page.getByRole("button", { name: "Connection settings" }).click();
  await page.getByRole("button", { name: "Trailer diagnostics" }).click();
  await page.getByRole("button", { name: "Inspect sample metadata" }).click();
  const row = page.getByRole("row").filter({ hasText: "Second Chance" });
  await expect(row).toContainText("Metadata request failed");
  await expect(
    row.getByRole("cell", { name: "Request failed", exact: true }),
  ).toBeVisible();
  await expect(row).toContainText("HTTP 503");
  await expect(
    page.getByRole("cell", { name: "Missing", exact: true }),
  ).toHaveCount(2);
  await expect(page.getByRole("dialog")).not.toContainText("private-response");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report" }).click();
  const content = await readFile((await (await downloaded).path())!, "utf8");
  expect(
    JSON.parse(content).checks.find(
      (check: { movieId: string }) => check.movieId === "2",
    ),
  ).toMatchObject({
    metadataFound: null,
    failure: "response",
    httpStatus: 503,
  });
  expect(content).not.toContain("fixture-token");
});
test("diagnostics report failed playback without classifying it as missing metadata", async ({
  page,
}) => {
  await mockPlex(page, { trailer: "broken" });
  await connect(page);
  await expect(page.locator("[data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "error",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "Connection settings" }).click();
  await page.getByRole("button", { name: "Trailer diagnostics" }).click();
  const row = page.getByRole("row").filter({ hasText: "First Light" });
  await expect(row).toContainText("Playback failed");
  await expect(
    row.getByRole("cell", { name: "Found", exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole("cell", { name: "Failed", exact: true }),
  ).toBeVisible();
});
test("diagnostics can test a searched movie outside the current catalog filters", async ({
  page,
}) => {
  const requests = await mockPlex(page, { trailer: "direct" });
  await connect(page);
  await page.getByLabel("Search movies").fill("First Light");
  await page.getByRole("button", { name: "Connection settings" }).click();
  await page.getByRole("button", { name: "Trailer diagnostics" }).click();
  await page.getByLabel("Find a movie to inspect").fill("Third Shore");
  await page.getByRole("button", { name: "Inspect sample metadata" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Metadata found; playback not verified",
  );
  expect(
    requests.some((request) => request.path.startsWith("/library/parts/3/")),
  ).toBe(false);
  await page.getByRole("button", { name: "Test preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Third Shore", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Search movies")).toHaveValue("");
  await expect(page.locator("[data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "playing",
    { timeout: 10000 },
  );
  await page.getByRole("button", { name: "Connection settings" }).click();
  await page.getByRole("button", { name: "Trailer diagnostics" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Third Shore" }),
  ).toContainText("Playback verified");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report" }).click();
  const report = JSON.parse(
    await readFile((await (await downloaded).path())!, "utf8"),
  );
  expect(report.checks[0]).toMatchObject({
    movieId: "3",
    metadataFound: true,
    urlResolved: true,
    playbackSucceeded: true,
    method: "Native direct play",
  });
});
test("cancelling diagnostics stops the sample and ignores a late metadata response", async ({
  page,
}) => {
  await mockPlex(page, { trailer: "missing" });
  await connect(page);
  await expect(page.getByText("No Plex preview available")).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Connection settings" }).click();
  await page.getByRole("button", { name: "Trailer diagnostics" }).click();
  const extraRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/\/library\/metadata\/[23]\?/.test(request.url()))
      extraRequests.push(request.url());
  });
  let release: () => void = () => {};
  let started: () => void = () => {};
  let handled: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  const completed = new Promise<void>((resolve) => {
    handled = resolve;
  });
  await page.route("**/plex/library/metadata/1?*", async (route) => {
    started();
    await pending;
    await route
      .fulfill({ json: { MediaContainer: { Metadata: [] } } })
      .catch(() => {});
    handled();
  });
  await page.getByRole("button", { name: "Inspect sample metadata" }).click();
  await requested;
  await expect(
    page.getByRole("button", { name: "Cancel inspection" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel inspection" }).click();
  await expect(page.getByRole("dialog")).toContainText("Inspection cancelled");
  await expect(
    page.getByRole("button", { name: "Inspect sample metadata" }),
  ).toBeEnabled();
  release();
  await completed;
  expect(extraRequests).toEqual([]);
  expect(errors).toEqual([]);
});
test("invalid tokens are recoverable and disconnect clears session storage", async ({
  page,
}) => {
  await mockPlex(page, { status: 401 });
  await connect(page);
  await expect(page.getByRole("alert")).toContainText(
    "Plex rejected the token",
  );
  await page.getByRole("button", { name: "Update connection" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in with Plex", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("trafirdis.token")),
  ).toBeNull();
});
test("handles a missing or empty movie library", async ({ page }) => {
  await mockPlex(page, { noLibraries: true });
  await connect(page);
  await expect(
    page.getByRole("heading", { name: "No movie libraries found" }),
  ).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: "Connection settings" }).click();
  await page
    .getByRole("button", { name: "Disconnect and clear session" })
    .click();
  await mockPlex(page, { empty: true });
  await connect(page);
  await expect(
    page.getByRole("heading", { name: "Your movie library is empty" }),
  ).toBeVisible();
});
test("small screens have no horizontal overflow and dialogs stay usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.mouse.move(0, 0);
  await page
    .getByRole("button", { name: "Explore the sample library" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "The Quiet Orbit", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const surprise = page.getByRole("button", { name: "Surprise me" });
  await expect(surprise).toBeVisible();
  const bounds = await surprise.boundingBox();
  const heroBounds = await page.locator(".hero").boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    heroBounds!.y + heroBounds!.height,
  );
  await page.screenshot({ path: "work/catalog-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "More info" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Close The Quiet Orbit details" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("lower rail focus stays quiet and opens a trailer only in details", async ({
  page,
}) => {
  const requests = await mockPlex(page, { trailer: "direct" });
  await connect(page);
  await expect(page.locator(".hero [data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "playing",
  );
  const rail = page.getByRole("region", { name: "Drama", exact: true });
  await rail.scrollIntoViewIfNeeded();
  const card = rail.locator('[data-movie="2"]');
  await card.focus();
  await expect(page.locator(".hero [data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "paused",
  );
  await page.waitForTimeout(1700);
  await expect(page.locator("video")).toHaveCount(1);
  expect(
    await page.locator("video").evaluate((video) => video.hasAttribute("src")),
  ).toBe(false);
  expect(
    requests.some((request) => request.path === "/library/metadata/2"),
  ).toBe(false);
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Second Chance", exact: true }),
  ).toBeVisible();
  await expect(dialog.locator("[data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "playing",
  );
  await expect(page.locator("video")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(
    await page
      .locator(".hero video")
      .evaluate((video) => video.hasAttribute("src")),
  ).toBe(false);
});

test("details navigation stays in the opening category and restores focus and page position", async ({
  page,
}) => {
  await mockPlex(page, { trailer: "missing" });
  await connect(page);
  const opener = page
    .getByRole("region", { name: "Drama", exact: true })
    .locator('[data-movie="2"]');
  await opener.scrollIntoViewIfNeeded();
  await opener.focus();
  const position = await page.evaluate(() => scrollY);
  await opener.click();
  const dialog = page.locator(".details-dialog");
  await expect(dialog.locator(".details-context")).toContainText("Drama");
  await expect(dialog.getByRole("status")).toContainText("2 of 2");
  await expect(
    dialog.getByRole("button", { name: "Next movie" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Previous movie" }).click();
  await expect(
    dialog.getByRole("heading", { name: "First Light", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Previous movie" }),
  ).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await expect(
    dialog.getByRole("heading", { name: "Second Chance", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("status")).toContainText("2 of 2");
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(position);
});

test("filtered categories define the dialog sequence and a single result disables both directions", async ({
  page,
}) => {
  await mockPlex(page, { trailer: "missing" });
  await connect(page);
  await page.getByLabel("Search movies").fill("Second");
  await recentCards(page).click();
  const dialog = page.locator(".details-dialog");
  await expect(dialog.locator(".details-context")).toContainText(
    "Recently Added",
  );
  await expect(dialog.getByRole("status")).toContainText("1 of 1");
  await expect(
    dialog.getByRole("button", { name: "Previous movie" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Next movie" }),
  ).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await expect(
    dialog.getByRole("heading", { name: "Second Chance", exact: true }),
  ).toBeVisible();
  await dialog.locator(".dialog-close").click();
  await expect(page.getByLabel("Search movies")).toHaveValue("Second");
  await expect(recentCards(page)).toHaveCount(1);
});

test("rapid dialog navigation cancels intermediate previews and keeps one player", async ({
  page,
}) => {
  const requests = await mockPlex(page, { trailer: "direct", delayed: true });
  await connect(page);
  await page
    .getByRole("region", { name: "Recently Added", exact: true })
    .locator('[data-movie="1"]')
    .click();
  const dialog = page.locator(".details-dialog");
  const start = requests.length;
  await dialog.getByRole("button", { name: "Next movie" }).click();
  await dialog.getByRole("button", { name: "Next movie" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Third Shore", exact: true }),
  ).toBeVisible();
  await expect(dialog.locator("[data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "playing",
    { timeout: 10000 },
  );
  await expect(page.locator("video")).toHaveCount(1);
  expect(
    requests
      .slice(start)
      .filter((r) => r.path.startsWith("/library/parts/"))
      .map((r) => r.path),
  ).toEqual(["/library/parts/3/trailer.webm"]);
  expect(await dialog.locator("video").evaluate((video) => video.muted)).toBe(
    true,
  );
  await dialog.locator(".dialog-close").click();
  await expect(dialog).toHaveCount(0);
});

test.describe("tablet category navigation", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  test("swipes details without hijacking vertical scrolling or the trailer surface", async ({
    page,
  }) => {
    await mockPlex(page, { trailer: "missing" });
    await connect(page);
    await page
      .getByRole("region", { name: "Drama", exact: true })
      .locator('[data-movie="2"]')
      .click();
    const dialog = page.locator(".details-dialog");
    const gesture = async (selector: string, dx: number, dy: number) => {
      await dialog.locator(selector).evaluate(
        (element, { dx, dy }) => {
          const touch = (x: number, y: number) =>
            new Touch({
              identifier: 1,
              target: element,
              clientX: x,
              clientY: y,
            });
          element.dispatchEvent(
            new TouchEvent("touchstart", {
              bubbles: true,
              touches: [touch(150, 500)],
            }),
          );
          element.dispatchEvent(
            new TouchEvent("touchend", {
              bubbles: true,
              changedTouches: [touch(150 + dx, 500 + dy)],
            }),
          );
        },
        { dx, dy },
      );
    };
    await gesture(".details-visual", 100, 0);
    await expect(dialog.getByRole("status")).toContainText("2 of 2");
    await gesture(".details-copy", 20, 120);
    await expect(dialog.getByRole("status")).toContainText("2 of 2");
    await gesture(".details-copy", 110, 5);
    await expect(
      dialog.getByRole("heading", { name: "First Light", exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole("status")).toContainText("1 of 2");
    await gesture(".details-copy", -110, 5);
    await expect(
      dialog.getByRole("heading", { name: "Second Chance", exact: true }),
    ).toBeVisible();
    const next = await dialog
      .getByRole("button", { name: "Next movie" })
      .boundingBox();
    expect(next?.width).toBeGreaterThanOrEqual(44);
    expect(next?.height).toBeGreaterThanOrEqual(44);
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "work/category-navigation-tablet.png" });
    await dialog.locator(".dialog-close").click();
    await expect(dialog).toHaveCount(0);
  });
});

test("movie library survives reload and falls back when the saved section is no longer accessible", async ({
  page,
}) => {
  const options = {
    trailer: "missing" as const,
    libraries: [
      { key: "1", title: "Movies" },
      { key: "2", title: "Archive" },
    ],
  };
  const requests = await mockPlex(page, options);
  await connect(page);
  await page.getByLabel("Movie library", { exact: true }).selectOption("2");
  await expect
    .poll(() =>
      requests.some((request) => request.path === "/library/sections/2/all"),
    )
    .toBe(true);
  requests.length = 0;
  await page.reload();
  await expect(page.getByLabel("Movie library", { exact: true })).toHaveValue(
    "2",
  );
  await expect
    .poll(() =>
      requests.some((request) => request.path === "/library/sections/2/all"),
    )
    .toBe(true);
  expect(
    requests.some((request) => request.path === "/library/sections/1/all"),
  ).toBe(false);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("trafirdis.library.test-machine"),
    ),
  ).toBe("2");
  options.libraries = [{ key: "1", title: "Movies" }];
  requests.length = 0;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "First Light", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Movie library", { exact: true })).toHaveCount(
    0,
  );
  expect(
    requests.some((request) => request.path === "/library/sections/2/all"),
  ).toBe(false);
});

test("hero is randomly chosen and stays stable through hover, filters and details navigation", async ({
  page,
}) => {
  await mockPlex(page, { trailer: "missing" });
  await connect(page, 0.99);
  const hero = page.locator(".hero");
  await expect(
    hero.getByRole("heading", { name: "Third Shore", exact: true }),
  ).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    navigation.getByRole("button", { name: "My library", exact: true }),
  ).toHaveCount(0);
  await expect(
    navigation.getByRole("button", { name: "Discover", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Drama", exact: true })
    .locator('[data-movie="2"]')
    .hover();
  await expect(hero.locator("h1")).toHaveText("Third Shore");
  await page.getByLabel("Search movies").fill("First Light");
  await expect(recentCards(page)).toHaveCount(1);
  await expect(hero.locator("h1")).toHaveText("Third Shore");
  // The featured film can be outside the current filtered results.
  await hero.getByRole("button", { name: "More info" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Third Shore", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Previous movie" })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Second Chance", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(hero.locator("h1")).toHaveText("Third Shore");
  await page.reload();
  await expect(hero.locator("h1")).toHaveText("First Light");
});

test("Unwatched preserves categories, skips watched neighbors and combines with search", async ({
  page,
}) => {
  await mockPlex(page, { trailer: "missing" });
  await connect(page);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Unwatched", exact: true })
    .click();
  await expect(recentCards(page)).toHaveCount(2);
  await expect(
    page.getByRole("region", { name: "Unwatched Movies", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Drama", exact: true })
      .locator("[data-movie]"),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("region", { name: "Adventure", exact: true })
      .locator("[data-movie]"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Science Fiction", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-rail] [data-movie="2"]')).toHaveCount(0);
  await recentCards(page).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".details-context")).toContainText(
    "Recently Added",
  );
  await expect(dialog.getByRole("status")).toContainText("1 of 2");
  await dialog.getByRole("button", { name: "Next movie" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Third Shore", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Next movie" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByLabel("Search movies").fill("First");
  await expect(recentCards(page)).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Drama", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Science Fiction", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Watch status").selectOption("watched");
  await page.getByLabel("Search movies").fill("");
  await expect(recentCards(page)).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Drama", exact: true }),
  ).toContainText("Second Chance");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Discover", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Unwatched Movies", exact: true }),
  ).toBeVisible();
});

test("Surprise me preserves audio choices and replaces the old stream on one player", async ({
  page,
}) => {
  test.setTimeout(60000);
  await mockPlex(page, { trailer: "direct" });
  await connect(page);
  const hero = page.locator(".hero");
  const video = hero.locator("video");
  const preview = hero.locator("[data-preview-phase]");
  const playing = async (muted: boolean) => {
    await expect(preview).toHaveAttribute("data-preview-phase", "playing");
    expect(await video.evaluate((element) => element.muted)).toBe(muted);
    await expect(
      hero.getByRole("button", {
        name: muted ? "Unmute preview" : "Mute preview",
        exact: true,
      }),
    ).toBeEnabled();
  };
  await playing(true);
  const original = await video.elementHandle();
  const originalSource = await video.getAttribute("src");
  const surprise = hero.getByRole("button", { name: "Surprise me" });
  await surprise.click();
  await expect(hero.locator("h1")).toHaveText("Third Shore");
  await playing(true);
  expect(await video.getAttribute("src")).not.toBe(originalSource);
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
  await hero.getByRole("button", { name: "Unmute preview" }).click();
  await playing(false);
  await surprise.click();
  await expect(hero.locator("h1")).toHaveText("First Light");
  await playing(false);
  expect(await video.getAttribute("src")).toBe(originalSource);
  await hero.getByRole("button", { name: "Mute preview", exact: true }).click();
  await surprise.click();
  await expect(hero.locator("h1")).toHaveText("Third Shore");
  await playing(true);
  await expect(page.locator("video")).toHaveCount(1);
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(surprise).toBeFocused();
});

test("hero keeps unmuted audio ready when Surprise me autoplay is blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    let blocked = false;
    HTMLMediaElement.prototype.play = function () {
      if (!this.muted && this.src.includes("/library/parts/3/") && !blocked) {
        blocked = true;
        return Promise.reject(new DOMException("Blocked", "NotAllowedError"));
      }
      return original.call(this);
    };
  });
  const requests = await mockPlex(page, { trailer: "direct" });
  await connect(page);
  const hero = page.locator(".hero");
  const video = hero.locator("video");
  const preview = hero.locator("[data-preview-phase]");
  await expect(preview).toHaveAttribute("data-preview-phase", "playing");
  await hero.getByRole("button", { name: "Unmute preview" }).click();
  await hero.getByRole("button", { name: "Surprise me" }).click();
  await expect(hero.locator("h1")).toHaveText("Third Shore");
  await expect(preview).toHaveAttribute("data-preview-phase", "blocked");
  expect(await video.evaluate((element) => element.muted)).toBe(false);
  const source = await video.getAttribute("src");
  await hero.getByRole("button", { name: "Play preview" }).click();
  await expect(preview).toHaveAttribute("data-preview-phase", "playing");
  expect(await video.getAttribute("src")).toBe(source);
  expect(await video.evaluate((element) => element.muted)).toBe(false);
  await expect(
    hero.getByRole("button", { name: "Mute preview", exact: true }),
  ).toBeEnabled();
  expect(
    requests.filter((request) => request.path === "/library/metadata/3"),
  ).toHaveLength(1);
});

test("Surprise me falls back when all films are watched", async ({ page }) => {
  await mockPlex(page, { trailer: "missing", allWatched: true });
  await connect(page);
  const hero = page.locator(".hero");
  await expect(hero.locator("h1")).toHaveText("First Light");
  await hero.getByRole("button", { name: "Surprise me" }).click();
  await expect(hero.locator("h1")).toHaveText("Second Chance");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Unwatched", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No films match this combination" }),
  ).toBeVisible();
  await expect(hero.locator("h1")).toHaveText("Second Chance");
});

test("details retain audio while navigating and reset on close", async ({
  page,
}) => {
  test.setTimeout(60000);
  await mockPlex(page, { trailer: "direct" });
  await connect(page);
  await recentCards(page).first().click();
  const dialog = page.locator(".details-dialog");
  const video = dialog.locator("video");
  const preview = dialog.locator("[data-preview-phase]");
  const playing = async () => {
    await expect(preview).toHaveAttribute("data-preview-phase", "playing", {
      timeout: 10000,
    });
  };
  await playing();
  const original = await video.elementHandle();
  await dialog.getByRole("button", { name: "Unmute preview" }).click();
  expect(await video.evaluate((v) => v.muted)).toBe(false);
  await dialog.getByRole("button", { name: "Next movie" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Second Chance", exact: true }),
  ).toBeVisible();
  await playing();
  expect(await video.evaluate((v) => v.muted)).toBe(false);
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(
    dialog.getByRole("button", { name: "Mute preview", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Previous movie" }).click();
  await expect(
    dialog.getByRole("heading", { name: "First Light", exact: true }),
  ).toBeVisible();
  await playing();
  expect(await video.evaluate((v) => v.muted)).toBe(false);
  await dialog.getByRole("button", { name: "Pause preview" }).click();
  await expect(preview).toHaveAttribute("data-preview-phase", "paused");
  await dialog.getByRole("button", { name: "Play preview" }).click();
  await playing();
  expect(await video.evaluate((v) => v.muted)).toBe(false);
  await dialog
    .getByRole("button", { name: "Mute preview", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Next movie" }).click();
  await playing();
  expect(await video.evaluate((v) => v.muted)).toBe(true);
  await expect(page.locator("video")).toHaveCount(1);
  await page.keyboard.press("Escape");
  expect(await page.locator(".hero video").evaluate((v) => v.muted)).toBe(true);
  await recentCards(page).first().click();
  await playing();
  expect(await video.evaluate((v) => v.muted)).toBe(true);
});

test("blocked unmuted trailers resume with Play", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    let blocked = false;
    HTMLMediaElement.prototype.play = function () {
      if (!this.muted && this.src.includes("/library/parts/2/") && !blocked) {
        blocked = true;
        return Promise.reject(new DOMException("Blocked", "NotAllowedError"));
      }
      return original.call(this);
    };
  });
  const requests = await mockPlex(page, { trailer: "direct" });
  await connect(page);
  await recentCards(page).first().click();
  const dialog = page.locator(".details-dialog");
  const preview = dialog.locator("[data-preview-phase]");
  const video = dialog.locator("video");
  await expect(preview).toHaveAttribute("data-preview-phase", "playing");
  await dialog.getByRole("button", { name: "Unmute preview" }).click();
  await dialog.getByRole("button", { name: "Next movie" }).click();
  await expect(preview).toHaveAttribute("data-preview-phase", "blocked");
  expect(await video.evaluate((v) => v.muted)).toBe(false);
  const source = await video.getAttribute("src");
  await dialog.getByRole("button", { name: "Play preview" }).click();
  await expect(preview).toHaveAttribute("data-preview-phase", "playing");
  expect(await video.getAttribute("src")).toBe(source);
  expect(await video.evaluate((v) => v.muted)).toBe(false);
  expect(
    requests.filter((request) => request.path === "/library/metadata/2"),
  ).toHaveLength(1);
});

test("renegotiates HLS after repeated popup reopen and hero scroll return", async ({
  page,
}) => {
  test.setTimeout(60000);
  const events: { path: string; session: string | null }[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/\/(decision|start\.m3u8|stop)$/.test(url.pathname))
      events.push({
        path: url.pathname,
        session: url.searchParams.get("session"),
      });
  });
  const requests = await mockPlex(page, { trailer: "hls" });
  await connect(page);
  const hero = page.locator(".hero");
  const playing = async (host: ReturnType<Page["locator"]>) => {
    await expect(host.locator("[data-preview-phase]")).toHaveAttribute(
      "data-preview-phase",
      "playing",
    );
    await expect(page.locator("video")).toHaveCount(1);
  };
  await playing(hero);
  for (let i = 0; i < 2; i++) {
    await hero.getByRole("button", { name: "More info" }).click();
    await playing(page.getByRole("dialog"));
    await page.keyboard.press("Escape");
    await playing(hero);
  }
  await hero.getByRole("button", { name: "Unmute preview" }).click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(hero.locator("[data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "paused",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await playing(hero);
  expect(await hero.locator("video").evaluate((video) => video.muted)).toBe(
    false,
  );
  const starts = events.filter((event) => event.path.endsWith("start.m3u8"));
  expect(
    new Set(starts.map((event) => event.session)).size,
  ).toBeGreaterThanOrEqual(6);
  for (const start of starts) {
    const position = events.indexOf(start);
    expect(
      events
        .slice(0, position)
        .some(
          (event) =>
            event.path.endsWith("/decision") && event.session === start.session,
        ),
    ).toBe(true);
  }
  // Restarts do not depend on invalidating the metadata cache.
  expect(
    requests.filter((request) => request.path === "/library/metadata/1"),
  ).toHaveLength(1);
  expect(
    requests.some((request) =>
      /timeline|scrobble|playQueues/.test(request.path),
    ),
  ).toBe(false);
});

for (const decision of ["denied", "malformed", "auth"] as const) {
  test(`does not load HLS after a ${decision} playback decision`, async ({
    page,
  }) => {
    const requests = await mockPlex(page, { trailer: "hls", decision });
    await connect(page);
    await expect(page.locator(".hero [data-preview-phase]")).toHaveAttribute(
      "data-preview-phase",
      "error",
    );
    expect(requests.some((request) => request.path.endsWith("/decision"))).toBe(
      true,
    );
    expect(
      requests.some((request) => request.path.endsWith("start.m3u8")),
    ).toBe(false);
    await expect(
      page.getByRole("button", { name: "Retry preview" }),
    ).toBeEnabled();
  });
}
