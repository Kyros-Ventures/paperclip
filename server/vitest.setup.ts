/**
 * Server Test Setup
 * Ensures clean state between test files running in isolated forks.
 * Each fork gets its own PGlite process with pool: "forks" + singleFork.
 * Retries handle any remaining flakiness from DB state pollution.
 */

import { beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
});
