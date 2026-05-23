import { describe, expect, it } from "vitest";
import { normalizeHostnameInput, parseHostnameCsv } from "./hostnames.js";

describe("normalizeHostnameInput", () => {
  it("trims and lowercases a plain hostname", () => {
    expect(normalizeHostnameInput("  Example.COM  ")).toBe("example.com");
  });

  it("strips protocol and path from a URL", () => {
    expect(normalizeHostnameInput("https://api.example.com/v1/status")).toBe(
      "api.example.com",
    );
  });

  it("strips http:// prefix", () => {
    expect(normalizeHostnameInput("http://localhost:3100")).toBe("localhost");
  });

  it("preserves subdomains", () => {
    expect(normalizeHostnameInput("board.staging.example.com")).toBe(
      "board.staging.example.com",
    );
  });

  it("throws on empty input", () => {
    expect(() => normalizeHostnameInput("")).toThrow("Hostname is required");
    expect(() => normalizeHostnameInput("   ")).toThrow("Hostname is required");
  });

  it("throws on invalid input", () => {
    expect(() => normalizeHostnameInput("not a hostname!!!")).toThrow(
      "Invalid hostname",
    );
  });
});

describe("parseHostnameCsv", () => {
  it("parses a comma-separated list", () => {
    expect(parseHostnameCsv("a.com, b.com, c.com")).toEqual([
      "a.com",
      "b.com",
      "c.com",
    ]);
  });

  it("deduplicates entries", () => {
    expect(parseHostnameCsv("a.com, A.COM, a.com")).toEqual(["a.com"]);
  });

  it("returns empty array for empty input", () => {
    expect(parseHostnameCsv("")).toEqual([]);
    expect(parseHostnameCsv("   ")).toEqual([]);
  });

  it("handles single entry", () => {
    expect(parseHostnameCsv("example.com")).toEqual(["example.com"]);
  });

  it("strips protocols from each entry", () => {
    expect(parseHostnameCsv("https://a.com, http://b.com")).toEqual([
      "a.com",
      "b.com",
    ]);
  });
});
