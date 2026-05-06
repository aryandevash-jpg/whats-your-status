import { isValidHttpUrl } from "./httpUrl.js";

describe("isValidHttpUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isValidHttpUrl("https://example.com/path")).toBe(true);
    expect(isValidHttpUrl("http://localhost:3000")).toBe(true);
  });

  it("rejects non-http(s) schemes and invalid strings", () => {
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
    expect(isValidHttpUrl("not-a-url")).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
  });
});
