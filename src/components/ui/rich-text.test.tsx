import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RichText } from "./rich-text";

const MEDIA_ID = "0b6c3a52-6f6e-4a4b-9d2a-3c1f0e9d8a71";
const body = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Before" }] },
    {
      type: "figure",
      attrs: { mediaId: MEDIA_ID, alt: "The pill row", caption: "Above the transcript." },
    },
  ],
};

describe("RichText figures", () => {
  it("renders nothing for a figure unless the caller passes figures (Roadmap)", () => {
    const html = renderToStaticMarkup(<RichText body={body} />);
    expect(html).toContain("Before");
    expect(html).not.toContain("<figure");
  });

  it("renders the signed image with its size, alt text, and caption", () => {
    const figures = new Map([
      [MEDIA_ID, { url: "https://example.supabase.co/signed/x.png", width: 1280, height: 800 }],
    ]);
    const html = renderToStaticMarkup(<RichText body={body} figures={figures} />);
    expect(html).toContain('src="https://example.supabase.co/signed/x.png"');
    expect(html).toContain('width="1280"');
    expect(html).toContain('alt="The pill row"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("<figcaption");
  });

  it("shows the alt text in a placeholder when the image isn't available", () => {
    const html = renderToStaticMarkup(<RichText body={body} figures={new Map()} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("border-dashed");
    expect(html).toContain("The pill row");
  });
});
