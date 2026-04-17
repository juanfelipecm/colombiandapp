import { describe, expect, it } from "vitest";
import { ArgError, parseArgs, parseGradoRange } from "@/scripts/dba/lib";

describe("parseArgs", () => {
  it("parses a full valid argv", () => {
    const args = parseArgs([
      "--pdf",
      "./data/x.pdf",
      "--materia",
      "matematicas",
      "--grado-range",
      "1-11",
    ]);
    expect(args).toEqual({
      pdf: "./data/x.pdf",
      materia: "matematicas",
      gradoRange: { min: 1, max: 11 },
      dryRun: false,
      fromSeed: false,
    });
  });

  it("allows --pdf to be omitted when --from-seed is passed", () => {
    const args = parseArgs([
      "--materia",
      "matematicas",
      "--grado-range",
      "1-11",
      "--from-seed",
    ]);
    expect(args.fromSeed).toBe(true);
    expect(args.pdf).toBeNull();
  });

  it("recognizes --dry-run", () => {
    const args = parseArgs([
      "--pdf",
      "p.pdf",
      "--materia",
      "lenguaje",
      "--grado-range",
      "1-5",
      "--dry-run",
    ]);
    expect(args.dryRun).toBe(true);
  });

  it("errors when --pdf is missing", () => {
    expect(() =>
      parseArgs(["--materia", "matematicas", "--grado-range", "1-11"]),
    ).toThrow(ArgError);
  });

  it("errors when --materia is missing", () => {
    expect(() => parseArgs(["--pdf", "p.pdf", "--grado-range", "1-11"])).toThrow(
      ArgError,
    );
  });

  it("errors on unknown materia slug", () => {
    expect(() =>
      parseArgs([
        "--pdf",
        "p.pdf",
        "--materia",
        "física",
        "--grado-range",
        "1-11",
      ]),
    ).toThrow(/must be one of/);
  });

  it("errors on malformed --grado-range", () => {
    expect(() =>
      parseArgs([
        "--pdf",
        "p.pdf",
        "--materia",
        "matematicas",
        "--grado-range",
        "foo",
      ]),
    ).toThrow(/grado-range must be in the form/);
  });

  it("errors on out-of-bounds grado-range", () => {
    expect(() =>
      parseArgs([
        "--pdf",
        "p.pdf",
        "--materia",
        "matematicas",
        "--grado-range",
        "5-12",
      ]),
    ).toThrow(/0 <= min <= max <= 11/);
  });

  it("errors on inverted grado-range", () => {
    expect(() => parseGradoRange("5-1")).toThrow(/min <= max/);
  });

  it("errors on positional args", () => {
    expect(() => parseArgs(["oops"])).toThrow(/Unexpected positional/);
  });
});
