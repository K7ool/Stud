import { cn } from "@/lib/utils"
import React, { useEffect, useRef, useState } from "react"

// Lazy-load shiki so its core (and the per-language/per-theme chunks it pulls
// in on demand) stay out of the initial critical bundle. `codeToHtml` is async
// anyway, so we can fetch it only when the first code block actually renders.
let shikiPromise: Promise<typeof import("shiki")> | null = null
function getShiki(): Promise<typeof import("shiki")> {
  if (!shikiPromise) {
    shikiPromise = import("shiki")
  }
  return shikiPromise
}

export type CodeBlockProps = {
  children?: React.ReactNode
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        "not-prose flex w-full flex-col overflow-clip border",
        "border-border bg-card text-card-foreground rounded-xl",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type CodeBlockCodeProps = {
  code: string
  language?: string
  theme?: string
  className?: string
} & React.HTMLProps<HTMLDivElement>

// Highlighting is expensive (shiki re-tokenizes the whole snippet) and, while
// the AI streams a script, the snippet grows one token at a time. We render the
// plain text immediately (fast perceived output) and debounce the highlight so
// it only runs once the snippet has been stable for a short time — avoiding
// re-tokenizing the entire (growing) code on every streamed token.
function CodeBlockCode({
  code,
  language = "tsx",
  theme = "github-light",
  className,
  ...props
}: CodeBlockCodeProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)
  const codeRef = useRef(code)

  useEffect(() => {
    codeRef.current = code

    const timer = setTimeout(async () => {
      const current = codeRef.current
      if (!current) {
        setHighlightedHtml("<pre><code></code></pre>")
        return
      }
      try {
        const shiki = await getShiki()
        const html = await shiki.codeToHtml(current, { lang: language, theme })
        // Only commit the result if the code hasn't changed since.
        if (codeRef.current === current) setHighlightedHtml(html)
      } catch {
        // Highlight failed — stay on the plain render and retry on the next
        // code change (highlightedHtml remains null).
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [code, language, theme])

  const classNames = cn(
    "w-full overflow-x-auto text-[13px] [&>pre]:px-4 [&>pre]:py-4",
    className
  )

  return highlightedHtml ? (
    <div
      className={classNames}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      {...props}
    />
  ) : (
    <div className={classNames} {...props}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>

function CodeBlockGroup({
  children,
  className,
  ...props
}: CodeBlockGroupProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { CodeBlockGroup, CodeBlockCode, CodeBlock }
