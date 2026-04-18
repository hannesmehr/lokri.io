"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Render Markdown with GFM (tables, strikethrough, task-lists, autolinks).
 * Deliberately minimalist — shares the Tailwind prose tokens so the preview
 * matches our typography system.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-neutral max-w-none text-[15px] leading-relaxed dark:prose-invert [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_h1]:mt-6 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:px-2 [&_td]:py-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
