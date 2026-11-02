import Markdown from "react-markdown";

import { cn } from "@/lib/cn";

// Text formatting and links only: images omitted, raw HTML ignored.
const ELEMENTS = ["a", "p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "strong", "em", "blockquote", "pre", "code", "hr"];

/** Synchronous rendering works both on the server and in interactive posting views. */
export function PostingText({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "text-sm leading-[1.65] break-words [&>*+*]:mt-3 [&_p]:whitespace-pre-wrap",
        "[&_h1]:text-lg [&_h2]:text-base [&_h3]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold",
        "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_li+li]:mt-1 [&_li>ul]:mt-1 [&_li>ol]:mt-1",
        "[&_a]:underline [&_a]:underline-offset-2 [&_a]:text-primary [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_blockquote]:text-muted [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_code]:font-mono [&_hr]:border-line",
        className,
      )}
    >
      <Markdown
        allowedElements={ELEMENTS}
        unwrapDisallowed
        skipHtml
        components={{
          a: ({ children, href }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <>{children}</>,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
