import { describe, expect, it, vi, beforeEach } from "vitest";
import { expandHomePrefix, resolvePaperclipInstanceId } from "./home.js";

describe("expandHomePrefix", () => {
  it("expands ~ to home directory", () => {
    const result = expandHomePrefix("~");
    expect(result).toBe(require("node:os").homedir());
  });

  it("expands ~/path to home/path", () => {
    const os = require("node:os");
    const result = expandHomePrefix("~/Documents");
    expect(result).toBe(`${os.homedir()}/Documents`);
  });

  it("returns plain path unchanged", () => {
    expect(expandHomePrefix("/usr/local/bin")).toBe("/usr/local/bin");
    expect(expandHomePrefix("relative/path")).toBe("relative/path");
  });

  it("does not expand ~user (only bare ~ and ~/)", () => {
    expect(expandHomePrefix("~otheruser/file")).toBe("~otheruser/file");
  });
});

describe("resolvePaperclipInstanceId", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns default when nothing is set", () => {
    vi.stubEnv("PAPERCLIP_INSTANCE_ID", undefined);
    expect(resolvePaperclipInstanceId()).toBe("default");
  });

  it("uses explicit override", () => {
    expect(resolvePaperclipInstanceId("production")).toBe("production");
  });

  it("uses env var when no override", () => {
    vi.stubEnv("PAPERCLIP_INSTANCE_ID", "staging");
    expect(resolvePaperclipInstanceId()).toBe("staging");
  });

  it("throws on invalid characters", () => {
    expect(() => resolvePaperclipInstanceId("bad id!")).toThrow(
      "Invalid instance id",
    );
    expect(() => resolvePaperclipInstanceId("path/traversal")).toThrow(
      "Invalid instance id",
    );
  });

  it("accepts valid characters: letters, numbers, _, -", () => {
    expect(resolvePaperclipInstanceId("my-prod_01")).toBe("my-prod_01");
  });
});
