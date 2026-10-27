'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Answers and temporary previews are content, never HTML, embedded media, or executable code. */
export function ChatMarkdown({ children, streaming = false }: { children: string; streaming?: boolean }) {
  return <div className="chat-markdown min-w-0 text-sm leading-7 [overflow-wrap:anywhere] data-[streaming=true]:[&>p:nth-last-child(2)]:inline" data-streaming={streaming}>
    <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
      a: ({ href, children }) => href
        ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
        : <span>{children}</span>,
      img: ({ alt }) => <span>{alt}</span>,
      table: ({ children }) => <div className="classroom-scroll max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="回答中的表格"><table>{children}</table></div>,
      pre: ({ children }) => <pre className="classroom-scroll" tabIndex={0}>{children}</pre>,
    }}>{children}</Markdown>
    {streaming && <span data-stream-cursor aria-hidden="true" className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-current motion-safe:animate-pulse" />}
  </div>;
}
