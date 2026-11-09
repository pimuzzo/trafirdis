import { test, expect, type Page } from "@playwright/test";

async function hostedSignIn(
  page: Page,
  mode: "success" | "expired" | "pending" | "no-access" | "offline" = "success",
) {
  const calls: {
    url: string;
    token?: string;
    client?: string;
    method: string;
  }[] = [];
  let polls = 0;
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
  await page.route(
    (url) => url.hostname === "plex.tv" || url.hostname === "clients.plex.tv",
    async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers });
        return;
      }
      calls.push({
        url: request.url(),
        method: request.method(),
        token: request.headers()["x-plex-token"],
        client: request.headers()["x-plex-client-identifier"],
      });
      if (mode === "offline") {
        await route.abort("failed");
        return;
      }
      if (url.pathname === "/api/v2/pins" && request.method() === "POST") {
        await route.fulfill({
          headers,
          json: { id: 123, code: "synthetic-strong-pin", expiresIn: 600 },
        });
        return;
      }
      if (url.pathname === "/api/v2/pins/123") {
        polls++;
        await route.fulfill({
          status: mode === "expired" ? 404 : 200,
          headers,
          json: {
            authToken:
              mode === "pending" || polls === 1
                ? null
                : "synthetic-account-token",
          },
        });
        return;
      }
      if (url.pathname === "/api/v2/resources") {
        await route.fulfill({
          headers,
          json:
            mode === "no-access"
              ? []
              : [
                  {
                    clientIdentifier: "server-fixture",
                    provides: "server",
                    accessToken: "synthetic-server-token",
                    connections: [{ uri: "https://outside.example" }],
                  },
                ],
        });
        return;
      }
      await route.fulfill({ status: 404, headers });
    },
  );
  await page.route("https://app.plex.tv/auth**", async (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><title>Plex authorization fixture</title><script>const parameters=new URLSearchParams(location.hash.slice(2));location.replace(parameters.get("forwardUrl"));</script>',
    }),
  );
  await page.route("http://127.0.0.1:5175/plex/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    calls.push({
      url: request.url(),
      method: request.method(),
      token: request.headers()["x-plex-token"],
      client: request.headers()["x-plex-client-identifier"],
    });
    const path = url.pathname.slice("/plex".length);
    if (path === "/identity") {
      await route.fulfill({
        json: { MediaContainer: { machineIdentifier: "server-fixture" } },
      });
      return;
    }
    if (request.headers()["x-plex-token"] !== "synthetic-server-token") {
      await route.fulfill({ status: 401 });
      return;
    }
    if (path === "/") {
      await route.fulfill({
        json: {
          MediaContainer: {
            machineIdentifier: "server-fixture",
            friendlyName: "Plex fixture",
          },
        },
      });
      return;
    }
    if (path === "/library/sections") {
      await route.fulfill({
        json: {
          MediaContainer: {
            Directory: [{ key: "1", title: "Movies", type: "movie" }],
          },
        },
      });
      return;
    }
    if (path === "/library/sections/1/all") {
      await route.fulfill({
        json: {
          MediaContainer: {
            totalSize: 1,
            Metadata: [
              {
                ratingKey: "1",
                key: "/library/metadata/1",
                type: "movie",
                title: "Authorized First Light",
                Genre: [{ tag: "Drama" }],
              },
            ],
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { MediaContainer: { Metadata: [] } } });
  });
  return calls;
}
test("Plex sign-in returns to the app and stores only the verified server-specific token", async ({
  page,
}) => {
  const calls = await hostedSignIn(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Plex", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Authorized First Light", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  expect(
    await page.evaluate(() => sessionStorage.getItem("trafirdis.token")),
  ).toBe("synthetic-server-token");
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("trafirdis.pending-sign-in"),
    ),
  ).toBeNull();
  expect(new URL(page.url()).searchParams.has("trafirdis_auth")).toBe(false);
  expect(
    calls
      .filter((c) => new URL(c.url).origin === "http://127.0.0.1:5175")
      .every((c) => c.token !== "synthetic-account-token"),
  ).toBe(true);
  expect(
    calls.find((c) => new URL(c.url).pathname === "/plex/identity")?.token,
  ).toBeUndefined();
  expect(
    calls.filter((c) => new URL(c.url).pathname === "/api/v2/pins"),
  ).toHaveLength(1);
  expect(
    calls.every(
      (c) =>
        !c.url.includes("synthetic-account-token") &&
        !c.url.includes("synthetic-server-token") &&
        !c.url.includes("outside.example"),
    ),
  ).toBe(true);
  const client = await page.evaluate(() =>
    localStorage.getItem("trafirdis.client-id"),
  );
  expect(client).toBeTruthy();
  expect(calls.every((c) => c.client === client)).toBe(true);
  await page.getByRole("button", { name: "Connection settings" }).click();
  await page
    .getByRole("button", { name: "Disconnect and clear session" })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in with Plex", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("trafirdis.token")),
  ).toBeNull();
});
test("expired authorization stays recoverable without accepting a token", async ({
  page,
}) => {
  await hostedSignIn(page, "expired");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Plex", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("expired");
  expect(
    await page.evaluate(() => sessionStorage.getItem("trafirdis.token")),
  ).toBeNull();
  await expect(
    page.getByRole("button", { name: "Sign in with Plex", exact: true }),
  ).toBeEnabled();
});
test("account access must match the configured Plex server", async ({
  page,
}) => {
  await hostedSignIn(page, "no-access");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Plex", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("does not have access", {
    timeout: 15000,
  });
  expect(
    await page.evaluate(() => sessionStorage.getItem("trafirdis.token")),
  ).toBeNull();
});
test("cancel stops pending sign-in polling and leaves manual and sample access usable", async ({
  page,
}) => {
  const calls = await hostedSignIn(page, "pending");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Plex", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel sign-in" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel sign-in" }).click();
  const count = calls.length;
  await page.waitForTimeout(1200);
  expect(calls).toHaveLength(count);
  expect(
    await page.evaluate(() => sessionStorage.getItem("trafirdis.token")),
  ).toBeNull();
  await page.getByText("Use a Plex token instead", { exact: true }).click();
  await expect(page.getByLabel("Plex authentication token")).toBeVisible();
  await page
    .getByRole("button", { name: "Explore the sample library" })
    .click();
  await expect(
    page.getByText("YOU’RE EXPLORING THE SAMPLE LIBRARY"),
  ).toBeVisible();
});
test("forged return state never makes a cloud request or accepts credentials", async ({
  page,
}) => {
  let calls = 0;
  await page.route(
    (url) => url.hostname === "plex.tv" || url.hostname === "clients.plex.tv",
    (route) => {
      calls++;
      return route.abort();
    },
  );
  await page.addInitScript(() => {
    localStorage.setItem("trafirdis.client-id", "device-fixture");
    sessionStorage.setItem(
      "trafirdis.pending-sign-in",
      JSON.stringify({
        id: "123",
        code: "strong-pin",
        clientId: "device-fixture",
        state: "correct",
        expiresAt: Date.now() + 600000,
      }),
    );
  });
  await page.goto("/?trafirdis_auth=forged");
  await expect(page.getByRole("alert")).toContainText("could not be verified");
  expect(calls).toBe(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem("trafirdis.token")),
  ).toBeNull();
});
test("Plex cloud outages do not block sample browsing", async ({ page }) => {
  await hostedSignIn(page, "offline");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Plex", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Cannot reach Plex sign-in",
  );
  await page
    .getByRole("button", { name: "Explore the sample library" })
    .click();
  await expect(
    page.getByText("YOU’RE EXPLORING THE SAMPLE LIBRARY"),
  ).toBeVisible();
});
