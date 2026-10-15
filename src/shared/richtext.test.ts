import { describe, expect, it } from "vitest";
import { blocksToText, decodeEntities, htmlToBlocks, safeHref } from "./richtext.ts";

describe("htmlToBlocks", () => {
  it("keeps paragraphs, headings and inline styles as plain runs", () => {
    const blocks = htmlToBlocks(
      '<p>Use <strong>low</strong> <em>weights</em> &amp; <code>clip skip 2</code>.</p><h3 id="x"><span style="color:red">Update!</span></h3>',
    );
    expect(blocks).toEqual([
      {
        t: "p",
        c: [
          { text: "Use " },
          { text: "low", b: true },
          { text: " " },
          { text: "weights", i: true },
          { text: " & " },
          { text: "clip skip 2", code: true },
          { text: "." },
        ],
      },
      { t: "h", level: 3, c: [{ text: "Update!" }] },
    ]);
  });

  it("drops scripts, styles, event handlers and unsafe links", () => {
    const blocks = htmlToBlocks(
      '<p onclick="steal()">Hi<script>alert(1)</script><style>p{}</style> <a href="javascript:alert(1)">there</a> <a href="/models/12">model</a></p><iframe src="https://x"></iframe>',
    );
    expect(blocks).toEqual([
      {
        t: "p",
        c: [{ text: "Hi there " }, { text: "model", href: "https://civitai.com/models/12" }],
      },
    ]);
    expect(JSON.stringify(blocks)).not.toMatch(/alert|steal|onclick/);
  });

  it("turns lists, quotes, code and rules into blocks", () => {
    const blocks = htmlToBlocks(
      "<ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul><blockquote><p>quoted</p></blockquote><pre><code>a  b\nc</code></pre><hr><ol><li>first</li></ol>",
    );
    expect(blocks).toEqual([
      {
        t: "list",
        ordered: false,
        items: [[{ text: "one" }], [{ text: "two" }], [{ text: "nested" }]],
      },
      { t: "quote", c: [{ text: "quoted" }] },
      { t: "pre", text: "a  b\nc" },
      { t: "hr" },
      { t: "list", ordered: true, items: [[{ text: "first" }]] },
    ]);
  });

  it("keeps line breaks and collapses other whitespace", () => {
    const [p] = htmlToBlocks("<p>line   one<br>\n  line two</p>");
    expect(p).toEqual({ t: "p", c: [{ text: "line one\nline two" }] });
  });

  it("keeps image sources for the server to filter", () => {
    expect(
      htmlToBlocks('<p><img src="https://image.civitai.com/a/b/width=525/1.jpeg" alt="x"></p>'),
    ).toEqual([{ t: "img", src: "https://image.civitai.com/a/b/width=525/1.jpeg", alt: "x" }]);
  });

  it("survives broken markup", () => {
    expect(blocksToText(htmlToBlocks("<p>a < b <b>bold<p>next"))).toBe("a < b bold\n\nnext");
    expect(htmlToBlocks("")).toEqual([]);
  });
});

describe("helpers", () => {
  it("decodes entities", () => {
    expect(decodeEntities("&lt;3 &#39;x&#x27; &nbsp;&unknown;")).toBe("<3 'x'  &unknown;");
  });

  it("allows only http(s) links", () => {
    expect(safeHref("https://a.b/c", "https://civitai.com")).toBe("https://a.b/c");
    expect(safeHref("data:text/html,x", "https://civitai.com")).toBeNull();
    expect(safeHref("  JAVASCRIPT:alert(1)", "https://civitai.com")).toBeNull();
  });
});
