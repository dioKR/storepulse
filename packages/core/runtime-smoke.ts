import { fetchAll, MockConnector } from "./src/index.ts";

const target = {
  key: "runtime-smoke-ios",
  name: "Runtime smoke",
  platform: "ios" as const,
  storeId: "1234567890",
};

const [status] = await fetchAll(
  [
    new MockConnector({
      [target.key]: [{ channel: "production", version: "1.0.0", build: "1", state: "live" }],
    }),
  ],
  [target],
);

if (status.channels[0]?.version !== "1.0.0") {
  throw new Error("Runtime smoke test did not return the expected status.");
}

console.log("@storepulse/core runtime smoke test passed.");
