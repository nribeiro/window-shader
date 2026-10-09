import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5178",
    channel: "chrome",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    command:
      process.env.JANELA_TEST_PREVIEW === "1"
        ? "npm run preview -- --port 5178 --strictPort"
        : "npm run dev -- --port 5178 --strictPort",
    url: "http://127.0.0.1:5178",
    reuseExistingServer: true,
  },
  reporter: "list",
});
