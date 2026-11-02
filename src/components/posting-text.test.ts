import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PostingText } from "./posting-text";

// Required children are passed in props for React.createElement's TypeScript overload.
// eslint-disable-next-line react/no-children-prop
const render = (children: string) => renderToStaticMarkup(createElement(PostingText, { children }));

describe("PostingText SSR", () => {
  it("renders headings, nested lists, emphasis and paragraphs without a browser", () => {
    const html = render("## Requirements\n\nFirst paragraph.\n\n- **TypeScript**\n  - *React*\n\n1. Apply\n2. Interview\n\n> Remote role");
    expect(html).toContain("<h2>Requirements</h2>");
    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<strong>TypeScript</strong>");
    expect(html).toContain("<em>React</em>");
    expect(html.match(/<ul>/g)).toHaveLength(2);
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote>");
  });

  it("renders safe links and never emits media, raw HTML or executable attributes", () => {
    const html = render('[Apply](https://example.com) ![Logo](https://example.com/logo.png)\n\n[Unsafe](javascript:alert%281%29)\n\n<img src="https://example.com/tracker" onerror="alert(1)">\n\n<script>alert(1)</script>');
    expect(html).toContain("Apply");
    expect(html).toContain("Unsafe");
    expect(html).not.toMatch(/<(?:img|script|iframe|video|audio)\b/);
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">Apply</a>');
    expect(html).not.toContain("logo.png");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
  });

  it("preserves plain text line breaks and escapes ordinary special characters", () => {
    expect(render("First line\nSecond line\n\nSalary > 100 & benefits")).toContain("<p>First line\nSecond line</p>");
    expect(render("Salary > 100 & benefits")).toContain("Salary &gt; 100 &amp; benefits");
  });
});
