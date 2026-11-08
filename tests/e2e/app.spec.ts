import { test, expect, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
  } = {},
) {
  const requests: { path: string; method: string; token?: string }[] = [];
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
          : [{ key: "1", title: "Movies", type: "movie" }],
      });
    if (path === "/library/sections/1/all")
      return fulfill(route, {
        totalSize: options.empty ? 0 : films.length,
        Metadata: options.empty ? [] : films,
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
    if (path.endsWith("start.m3u8")) {
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
    if (path.endsWith("/stop")) return route.fulfill({ status: 200, body: "" });
    return route.fulfill({ status: 404 });
  });
  return requests;
}
async function connect(page: Page) {
  await page.goto("/");
  await page.mouse.move(0, 0);
  await page.getByText("Use a Plex token instead", { exact: true }).click();
  await page.getByLabel("Plex authentication token").fill("fixture-token");
  await page
    .getByRole("button", { name: "Connect my library", exact: true })
    .click();
}
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
    page.getByRole("heading", { name: "Paper Moons", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".movie-grid [data-movie]")).toHaveCount(1);
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
  await expect(
    page.getByRole("heading", { name: "Second Chance", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
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
  await expect(page.locator(".movie-grid [data-movie]")).toHaveCount(1);
  await expect(page.locator(".movie-grid")).toContainText("First Light");
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
test("mute controls match the video after pause, settings and tab visibility restarts", async ({
  page,
}) => {
  test.setTimeout(60000);
  await mockPlex(page, { trailer: "direct" });
  await connect(page);
  const preview = page.locator("[data-preview-phase]");
  const video = page.locator("video");
  const unmute = async () => {
    await expect(preview).toHaveAttribute("data-preview-phase", "playing");
    await expect(
      page.getByRole("button", { name: "Unmute preview" }),
    ).toBeEnabled();
    expect(await video.evaluate((element) => element.muted)).toBe(true);
    await page.getByRole("button", { name: "Unmute preview" }).click();
    await expect(
      page.getByRole("button", { name: "Mute preview", exact: true }),
    ).toBeEnabled();
    expect(await video.evaluate((element) => element.muted)).toBe(false);
  };
  await unmute();
  await page.getByRole("button", { name: "Pause preview" }).click();
  await expect(preview).toHaveAttribute("data-preview-phase", "paused");
  await page.getByRole("button", { name: "Play preview" }).click();
  await unmute();
  await page.getByRole("button", { name: "Connection settings" }).click();
  await expect(preview).toHaveAttribute("data-preview-phase", "paused");
  await page.keyboard.press("Escape");
  await unmute();
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
  await unmute();
});
test("rapid selection cancels pending previews and only loads the final selected film", async ({
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
  ).toEqual(["/library/metadata/3"]);
  expect(
    requests
      .filter((r) => r.path.startsWith("/library/parts/"))
      .map((r) => r.path),
  ).toEqual(["/library/parts/3/trailer.webm"]);
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
test("missing trailers and playback failures leave the catalog usable", async ({
  page,
}) => {
  await mockPlex(page, { trailer: "missing" });
  await connect(page);
  await expect(page.getByText("No Plex preview available")).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "More info" }).click();
  await expect(page.getByRole("dialog")).toContainText("First Light");
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
  await page.getByLabel("Search movies").fill("Third");
  await expect(
    page.getByRole("heading", { name: "Third Shore", exact: true }),
  ).toBeVisible();
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
test("diagnostics separate discovered metadata from playback and remain development-only", async ({
  page,
}) => {
  await mockPlex(page, { trailer: "missing" });
  await connect(page);
  await expect(page.getByText("No Plex preview available")).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Connection settings" }).click();
  await page.getByRole("button", { name: "Trailer diagnostics" }).click();
  await expect(page.getByRole("dialog")).toContainText("DEVELOPMENT ONLY");
  await page.getByRole("button", { name: "Inspect sample metadata" }).click();
  await expect(
    page.getByRole("cell", { name: "Missing", exact: true }),
  ).toHaveCount(3);
  await expect(page.getByRole("dialog")).not.toContainText("fixture-token");
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
    await page.evaluate(() => sessionStorage.getItem("plexplore.token")),
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
  await page.screenshot({ path: "work/catalog-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "More info" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Close The Quiet Orbit details" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("lower rails keep the selected preview visible with only one video element", async ({
  page,
}) => {
  await mockPlex(page, { trailer: "direct" });
  await connect(page);
  const rail = page.getByRole("region", { name: "Drama", exact: true });
  await rail.scrollIntoViewIfNeeded();
  await rail
    .locator('[data-movie="2"]')
    .evaluate((element) =>
      (element as HTMLElement).focus({ preventScroll: true }),
    );
  const dock = page.getByRole("complementary", {
    name: "Selected movie preview",
  });
  await expect(dock).toBeVisible();
  await expect(
    dock.getByRole("heading", { name: "Second Chance" }),
  ).toBeVisible();
  await expect(dock.locator("[data-preview-phase]")).toHaveAttribute(
    "data-preview-phase",
    "playing",
    { timeout: 10000 },
  );
  await expect(page.locator("video")).toHaveCount(1);
  await dock
    .getByRole("button", { name: "Dismiss selected movie preview" })
    .click();
  await expect(dock).toHaveCount(0);
  expect(
    await page.locator("video").evaluate((video) => video.hasAttribute("src")),
  ).toBe(false);
});
