'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';

export type ClassroomResizeControl = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onReset: () => void;
};

export function ClassroomResizeHandle({ axis, reverse = false, control }: {
  axis: 'horizontal' | 'vertical'; reverse?: boolean; control: ClassroomResizeControl;
}) {
  const { t } = useI18n();
  const drag = useRef<{ pointer: number; start: number; value: number; cleanup: () => void } | null>(null);
  useEffect(() => () => drag.current?.cleanup(), []);
  const horizontal = axis === 'horizontal';
  const change = (value: number) => control.onChange(Math.round(Math.max(control.min, Math.min(control.max, value))));
  const finish = () => { drag.current?.cleanup(); drag.current = null; };
  return <div className={cn('relative z-[70] hidden shrink-0 lg:block', horizontal ? 'w-0 self-stretch' : 'h-0 w-full')}>
    <div role="separator" tabIndex={0} aria-label={control.label}
      aria-orientation={horizontal ? 'vertical' : 'horizontal'} aria-valuemin={control.min}
      aria-valuemax={control.max} aria-valuenow={Math.round(control.value)}
      title={t('classroom.resizeHint')}
      className={cn('absolute touch-none select-none outline-none after:absolute after:bg-border hover:after:bg-primary focus-visible:after:bg-primary focus-visible:ring-2 focus-visible:ring-ring',
        horizontal ? 'inset-y-0 -left-1 w-2 cursor-col-resize after:inset-y-0 after:left-1 after:w-px' : 'inset-x-0 -top-1 h-2 cursor-row-resize after:inset-x-0 after:top-1 after:h-px')}
      onDoubleClick={control.onReset}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Home') { event.preventDefault(); control.onReset(); return; }
        const direction = horizontal ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 };
        const step = direction[event.key as keyof typeof direction];
        if (step) { event.preventDefault(); change(control.value + step * 10 * (reverse ? -1 : 1)); }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        finish();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        const body = document.body;
        const cursor = body.style.cursor;
        const selection = body.style.userSelect;
        const shell = event.currentTarget.closest('.classroom-shell');
        body.style.cursor = horizontal ? 'col-resize' : 'row-resize';
        body.style.userSelect = 'none';
        shell?.setAttribute('data-resizing', '');
        drag.current = { pointer: event.pointerId, start: horizontal ? event.clientX : event.clientY, value: control.value,
          cleanup: () => { body.style.cursor = cursor; body.style.userSelect = selection; shell?.removeAttribute('data-resizing'); } };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointer !== event.pointerId) return;
        const delta = (horizontal ? event.clientX : event.clientY) - current.start;
        change(current.value + delta * (reverse ? -1 : 1));
      }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    />
  </div>;
}
