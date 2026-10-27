'use client';

import { useEffect, useRef, useState } from 'react';

const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });

/** A short display queue, independent of network chunks and server completion. */
export function useChatTypewriter(text: string, identity: string | undefined, completed: boolean) {
  const [frame, setFrame] = useState(() => ({ identity, text: completed || !identity ? text : '' }));
  const progress = useRef({ identity, text: frame.text });
  useEffect(() => {
    if (!identity) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const boundaries = [...segmenter.segment(text)].map((part) => part.index + part.segment.length);
    // Hold the trailing grapheme while streaming: the next chunk may complete an emoji/surrogate pair.
    const limit = completed ? boundaries.length : Math.max(0, boundaries.length - 1);
    const previous = progress.current;
    const offset = previous.identity === identity && text.startsWith(previous.text) ? previous.text.length : 0;
    let cursor = boundaries.findIndex((end) => end > offset);
    if (cursor < 0) cursor = boundaries.length;
    let animation = 0, last = 0;
    const tick = (now: number) => {
      if (last && now - last < 16 && !media.matches) { animation = requestAnimationFrame(tick); return; }
      const elapsed = Math.min(50, last ? now - last : 16);
      last = now;
      const speed = Math.max(60, Math.min(720, (limit - cursor) / 2));
      const step = Math.max(1, Math.floor(elapsed * speed / 1000));
      cursor = media.matches ? limit : Math.min(limit, cursor + step);
      const visible = text.slice(0, boundaries[cursor - 1] ?? 0);
      progress.current = { identity, text: visible };
      setFrame((current) => current.identity === identity && current.text === visible ? current : { identity, text: visible });
      if (cursor < limit) animation = requestAnimationFrame(tick);
    };
    const motionChanged = () => { cancelAnimationFrame(animation); animation = requestAnimationFrame(tick); };
    animation = requestAnimationFrame(tick);
    media.addEventListener('change', motionChanged);
    return () => { cancelAnimationFrame(animation); media.removeEventListener('change', motionChanged); };
  }, [text, identity, completed]);
  const visible = !identity ? text : frame.identity === identity && text.startsWith(frame.text) ? frame.text : '';
  return { text: visible, typing: visible !== text };
}
