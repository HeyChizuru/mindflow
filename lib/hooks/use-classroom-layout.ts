'use client';

import { useEffect, useState, type CSSProperties, type RefObject } from 'react';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function useClassroomLayout(shell: RefObject<HTMLDivElement | null>, learningArea: RefObject<HTMLElement | null>, sidebarOpen: boolean, chatOpen: boolean) {
  const [bounds, setBounds] = useState({ width: 0, height: 0, viewportWidth: 0, viewportHeight: 0 });
  const [preferred, setPreferred] = useState<{ sidebar?: number; chat?: number; caption?: number }>({});
  useEffect(() => {
    const measure = () => {
      const next = { width: shell.current?.clientWidth ?? 0, height: learningArea.current?.clientHeight ?? 0,
        viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
      setBounds(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    if (shell.current) observer.observe(shell.current);
    if (learningArea.current) observer.observe(learningArea.current);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [shell, learningArea]);

  // At the smallest desktop width both panels can still coexist with a 480px centre.
  const budget = Math.max(0, bounds.width - 480);
  const sidebarMin = Math.min(220, budget * (chatOpen ? 220 / 520 : 1));
  const chatMin = Math.min(300, budget * (sidebarOpen ? 300 / 520 : 1));
  const sidebarDefault = bounds.viewportWidth >= 1280 ? 288 : 256;
  const chatDefault = Math.min(448, bounds.viewportWidth * 0.36);
  const sidebar = clamp(preferred.sidebar ?? sidebarDefault, sidebarMin, Math.min(400, budget - (chatOpen ? chatMin : 0)));
  const chat = clamp(preferred.chat ?? chatDefault, chatMin, Math.min(640, budget - (sidebarOpen ? sidebar : 0)));
  const sidebarMax = Math.max(sidebarMin, Math.min(400, budget - (chatOpen ? chat : 0)));
  const chatMax = Math.max(chatMin, Math.min(640, budget - (sidebarOpen ? sidebar : 0)));
  const captionMax = Math.max(0, Math.floor(bounds.height * 0.4));
  const captionMin = Math.min(100, captionMax);
  const caption = clamp(preferred.caption ?? Math.min(bounds.viewportHeight * 0.3, clamp(bounds.viewportHeight * 0.18, 128, 176)), captionMin, captionMax);
  const control = (key: keyof typeof preferred, value: number, min: number, max: number) => ({ value, min, max,
    onChange: (size: number) => setPreferred(previous => ({ ...previous, [key]: size })),
    onReset: () => setPreferred(previous => ({ ...previous, [key]: undefined })),
  });
  return {
    style: { '--classroom-sidebar-width': `${sidebar}px`, '--classroom-chat-width': `${chat}px`,
      '--classroom-caption-height': `${caption}px` } as CSSProperties,
    sidebar: control('sidebar', sidebar, sidebarMin, sidebarMax),
    chat: control('chat', chat, chatMin, chatMax),
    caption: control('caption', caption, captionMin, captionMax),
  };
}
