import { describe, expect, it } from "vitest";
import { clampImageZoom } from "./imageZoom";

describe("clampImageZoom", () => {
  it("keeps zoom within the supported full-image range", () => {
    expect(clampImageZoom(-4)).toBe(1);
    expect(clampImageZoom(2.4)).toBe(2.4);
    expect(clampImageZoom(99)).toBe(5);
  });
});
