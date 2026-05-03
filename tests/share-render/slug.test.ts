import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/share-render/slug";

describe("slugify", () => {
  it("kebab-cases simple Spanish", () => {
    expect(slugify("Cómo cuidamos el agua")).toBe("como-cuidamos-el-agua");
  });

  it("strips accents on every vowel", () => {
    expect(slugify("áéíóú ñ")).toBe("aeiou-n");
  });

  it("trims and collapses repeating non-alpha", () => {
    expect(slugify("  hola--mundo!!  ")).toBe("hola-mundo");
  });

  it("falls back when input is empty", () => {
    expect(slugify("   ")).toBe("proyecto");
    expect(slugify("!!!")).toBe("proyecto");
  });

  it("caps length at 60 chars", () => {
    const long = "a".repeat(200);
    expect(slugify(long).length).toBe(60);
  });
});
