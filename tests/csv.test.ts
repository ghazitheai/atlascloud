import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/lib/csv";

describe("CSV parsing", () => {
  it("parses UTF-8 BOMs, escaped quotes, commas and multiline cells", () => {
    expect(
      parseCsv(
        '\uFEFFsku,name,category\r\nP-1,"Paper, A4","Office ""supplies"""\r\nP-2,"Line one\nLine two",Paper',
      ),
    ).toEqual([
      { sku: "P-1", name: "Paper, A4", category: 'Office "supplies"' },
      { sku: "P-2", name: "Line one\nLine two", category: "Paper" },
    ]);
  });

  it("normalizes headers and ignores blank records", () => {
    expect(parseCsv(" SKU ,Name\r\nA-1,First\r\n,,\r\n")).toEqual([
      { sku: "A-1", name: "First" },
    ]);
  });

  it("rejects duplicate headers, malformed rows and unclosed quotes", () => {
    expect(() => parseCsv("sku,SKU\nA-1,A-1")).toThrow("duplicate");
    expect(() => parseCsv("sku,name\nA-1")).toThrow("row 2");
    expect(() => parseCsv('sku,name\nA-1,"unfinished')).toThrow(
      "unclosed quoted field",
    );
  });
});
