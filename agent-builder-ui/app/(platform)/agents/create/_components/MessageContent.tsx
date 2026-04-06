"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";
import { cn } from "@/lib/utils";

interface MessageContentProps {
  content: string;
  className?: string;
}

const MessageContent = React.memo(({ content, className }: MessageContentProps) => {
  const components = useMemo(
    () => ({
      pre: ({ children, ...props }: React.ComponentPropsWithoutRef<"pre"> & { children?: React.ReactNode }) => (
        <pre {...props} className="max-w-full overflow-x-auto bg-[#f5f3f7] rounded-lg p-3 my-3 text-xs text-[#3c3a3d]">
          {children}
        </pre>
      ),

      code: ({ children, className: codeClassName, node, ...props }: React.ComponentPropsWithoutRef<"code"> & { children?: React.ReactNode; node?: unknown }) => {
        const isBlock = codeClassName?.startsWith("hljs") || codeClassName?.includes("language-");
        if (!isBlock) {
          return (
            <code
              {...props}
              className="bg-[#f3f0f5] text-[#222022] px-1.5 py-0.5 rounded text-[13px] font-mono border border-[#e2e2e2]"
            >
              {children}
            </code>
          );
        }
        return (
          <code {...props} className={cn(codeClassName, "text-xs font-mono text-[#3c3a3d]")}>
            {children}
          </code>
        );
      },

      blockquote: ({ children, ...props }: React.ComponentPropsWithoutRef<"blockquote"> & { children?: React.ReactNode }) => (
        <blockquote
          {...props}
          className="border-l-4 border-[#ae00d0]/30 pl-4 py-2 my-3 bg-[#f9f3ff] rounded-r-lg italic text-[#3c3a3d]"
        >
          {children}
        </blockquote>
      ),

      table: ({ children, ...props }: React.ComponentPropsWithoutRef<"table"> & { children?: React.ReactNode }) => (
        <div className="overflow-x-auto my-4 w-full rounded-lg border border-border-default">
          <table {...props} className="min-w-full border-collapse text-sm">
            {children}
          </table>
        </div>
      ),

      thead: ({ children, ...props }: React.ComponentPropsWithoutRef<"thead"> & { children?: React.ReactNode }) => (
        <thead {...props} className="bg-[#f5f5f5]">
          {children}
        </thead>
      ),

      th: ({ children, ...props }: React.ComponentPropsWithoutRef<"th"> & { children?: React.ReactNode }) => (
        <th
          {...props}
          className="border-b border-border-default px-4 py-2.5 text-left font-satoshi-semibold text-text-primary text-xs uppercase tracking-wide"
        >
          {children}
        </th>
      ),

      td: ({ children, ...props }: React.ComponentPropsWithoutRef<"td"> & { children?: React.ReactNode }) => (
        <td
          {...props}
          className="border-b border-border-default px-4 py-2.5 text-text-primary"
        >
          {children}
        </td>
      ),

      img: ({ src, alt, ...props }: React.ComponentPropsWithoutRef<"img">) => (
        <img
          {...props}
          src={src}
          alt={alt || ""}
          className="rounded-md w-10 h-10 inline-block align-middle object-cover my-1"
        />
      ),

      a: ({ children, href, ...props }: React.ComponentPropsWithoutRef<"a"> & { children?: React.ReactNode }) => {
        // Detect image URLs and render as images
        const isImageUrl = href && /\.(png|jpg|jpeg|gif|svg|webp)(\?.*)?$/i.test(href);
        // Also detect storage/CDN image URLs that may not have extensions
        const isStorageImage = href && /storage\.googleapis\.com.*\/(chat-uploads|images|avatars)\//i.test(href);
        if (isImageUrl || isStorageImage) {
          return (
            <img
              src={href}
              alt={typeof children === "string" ? children : "image"}
              className="rounded-md w-10 h-10 inline-block align-middle object-cover"
            />
          );
        }
        return (
          <a
            {...props}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#ae00d0] hover:text-[#ae00d0]/80 underline underline-offset-2"
          >
            {children}
          </a>
        );
      },

      h1: ({ children, ...props }: React.ComponentPropsWithoutRef<"h1"> & { children?: React.ReactNode }) => (
        <h1 {...props} className="text-xl font-satoshi-bold mt-5 mb-3 first:mt-0 text-text-primary">
          {children}
        </h1>
      ),

      h2: ({ children, ...props }: React.ComponentPropsWithoutRef<"h2"> & { children?: React.ReactNode }) => (
        <h2 {...props} className="text-lg font-satoshi-bold mt-4 mb-2 first:mt-0 text-[#222022]">
          {children}
        </h2>
      ),

      h3: ({ children, ...props }: React.ComponentPropsWithoutRef<"h3"> & { children?: React.ReactNode }) => (
        <h3 {...props} className="text-[15px] font-satoshi-bold mt-3 mb-1.5 first:mt-0 text-[#222022]">
          {children}
        </h3>
      ),

      h4: ({ children, ...props }: React.ComponentPropsWithoutRef<"h4"> & { children?: React.ReactNode }) => (
        <h4 {...props} className="text-sm font-satoshi-semibold mt-3 mb-1.5 first:mt-0 text-text-primary">
          {children}
        </h4>
      ),

      p: ({ children, ...props }: React.ComponentPropsWithoutRef<"p"> & { children?: React.ReactNode }) => (
        <p {...props} className="leading-[1.6] my-1.5 first:mt-0 last:mb-0 text-[#3c3a3d]">
          {typeof children === "string"
            ? children.split(/(\s+)/).map((segment, i) =>
                /^\s+$/.test(segment) ? segment : (
                  <span
                    key={i}
                    className="typewriter-word"
                    style={{ animationDelay: `${i * 0.03}s` }}
                  >
                    {segment}
                  </span>
                )
              )
            : children}
        </p>
      ),

      ul: ({ children, ...props }: React.ComponentPropsWithoutRef<"ul"> & { children?: React.ReactNode }) => (
        <ul {...props} className="list-disc pl-5 my-1.5 space-y-1">
          {children}
        </ul>
      ),

      ol: ({ children, ...props }: React.ComponentPropsWithoutRef<"ol"> & { children?: React.ReactNode }) => (
        <ol {...props} className="list-decimal pl-5 my-1.5 space-y-1">
          {children}
        </ol>
      ),

      li: ({ children, ...props }: React.ComponentPropsWithoutRef<"li"> & { children?: React.ReactNode }) => (
        <li {...props} className="leading-[1.6] text-[#3c3a3d]">
          {children}
        </li>
      ),

      hr: (props: React.ComponentPropsWithoutRef<"hr">) => (
        <hr {...props} className="my-4 border-[#e2e2e2]" />
      ),

      strong: ({ children, ...props }: React.ComponentPropsWithoutRef<"strong"> & { children?: React.ReactNode }) => (
        <strong {...props} className="font-satoshi-bold text-[#222022]">
          {children}
        </strong>
      ),
    }),
    []
  );

  return (
    <div
      className={cn(
        "text-sm font-satoshi-regular prose prose-sm max-w-none min-w-0",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

MessageContent.displayName = "MessageContent";

export default MessageContent;
