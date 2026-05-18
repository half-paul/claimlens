import { describe, expect, it } from "vitest";
import { getSourceSite, isAllowedSource, structureWikipediaHtml } from "../../lib/ingest";

describe("ingestion helpers", () => {
  it("allows subdomains of configured source domains", () => {
    expect(isAllowedSource(new URL("https://en.wikipedia.org/wiki/Alan_Turing"), ["wikipedia.org"])).toBe(true);
    expect(isAllowedSource(new URL("https://example.com/wiki/Alan_Turing"), ["wikipedia.org"])).toBe(false);
  });

  it("normalizes source site names", () => {
    expect(getSourceSite(new URL("https://www.wikipedia.org/"))).toBe("wikipedia.org");
    expect(getSourceSite(new URL("https://en.wikipedia.org/wiki/Test"))).toBe("en.wikipedia.org");
  });

  it("extracts sections, paragraphs, sentences, and stable offsets from article HTML", () => {
    const sections = structureWikipediaHtml(
      "<p>Ada Lovelace was an English mathematician. She worked on the Analytical Engine.</p>" +
        "<h2><span>Early life</span></h2>" +
        "<p>Her notes are historically significant. They contain what many describe as an early computer program.</p>" +
        "<h2><span>References</span></h2>" +
        "<p>This reference paragraph should not appear in the readable article.</p>"
    );

    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("Introduction");
    expect(sections[1].title).toBe("Early life");
    expect(sections[0].paragraphs[0].sentences).toHaveLength(2);
    expect(sections[0].paragraphs[0].start_offset).toBe(0);
    expect(sections[0].paragraphs[0].sentences[1].start_offset).toBeGreaterThan(0);
    expect(JSON.stringify(sections)).not.toContain("reference paragraph");
  });
});
