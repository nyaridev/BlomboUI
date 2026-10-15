/**
 * A Civitai description, from the server's parsed blocks (shared/richtext.ts). Everything is
 * rendered as React elements: no outside markup reaches the page, links open in the browser,
 * and images (already behind Blombo's proxy) are blurred on NSFW models until clicked.
 */
import { Veil } from "@client/ui";
import type { RichBlock, RichInline } from "@shared/richtext";
import { Fragment } from "react";

function Runs({ runs }: { runs: RichInline[] }) {
  return (
    <>
      {runs.map((r, i) => {
        let node: React.ReactNode = r.text;
        if (r.code)
          node = <code className="rounded-xs bg-field px-1 font-mono text-[0.92em]">{node}</code>;
        if (r.i) node = <em>{node}</em>;
        if (r.b) node = <strong className="font-semibold text-fg">{node}</strong>;
        if (r.href)
          node = (
            <a
              href={r.href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent-ink underline decoration-accent-ink/40 underline-offset-2 hover:decoration-accent-ink"
            >
              {node}
            </a>
          );
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}

export function RichText({ blocks, blurImages }: { blocks: RichBlock[]; blurImages: boolean }) {
  if (!blocks.length) return <p className="text-sm text-fg-3">No description.</p>;
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-fg-2">
      {blocks.map((b, i) => {
        const key = `${b.t}-${i}`;
        switch (b.t) {
          case "p":
            return (
              <p key={key} className="whitespace-pre-line">
                <Runs runs={b.c} />
              </p>
            );
          case "h":
            return (
              <h4
                key={key}
                className={
                  b.level <= 2
                    ? "pt-2 text-base font-semibold text-balance text-fg"
                    : "pt-1 text-sm font-semibold text-fg"
                }
              >
                <Runs runs={b.c} />
              </h4>
            );
          case "list": {
            const List = b.ordered ? "ol" : "ul";
            return (
              <List
                key={key}
                className={b.ordered ? "list-decimal pl-5" : "list-disc pl-5 marker:text-fg-4"}
              >
                {b.items.map((item, j) => (
                  <li key={j} className="whitespace-pre-line">
                    <Runs runs={item} />
                  </li>
                ))}
              </List>
            );
          }
          case "quote":
            return (
              <blockquote key={key} className="border-l-2 border-line-strong pl-3 text-fg-3">
                <Runs runs={b.c} />
              </blockquote>
            );
          case "pre":
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-md border border-line bg-sunken p-3 font-mono text-xs text-fg-2"
              >
                {b.text}
              </pre>
            );
          case "hr":
            return <hr key={key} className="border-line" />;
          case "img":
            return (
              <div key={key} className="max-w-md overflow-hidden rounded-md border border-line">
                <Veil active={blurImages} compact>
                  <img src={b.src} alt={b.alt} loading="lazy" className="block w-full" />
                </Veil>
              </div>
            );
        }
        return null;
      })}
    </div>
  );
}
