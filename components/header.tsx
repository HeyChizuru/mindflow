'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';

export function Header({ currentSceneTitle }: { readonly currentSceneTitle: string }) {
  const { t } = useI18n();
  return <header className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-3 py-2 sm:px-6">
    <Button asChild variant="ghost" size="icon"><Link href="/" aria-label={t('generation.backToHome')}><ArrowLeft /></Link></Button>
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{t('classroom.currentScene')}</p>
      <h1 className="truncate text-base font-semibold sm:text-lg">{currentSceneTitle || t('classroom.noScene')}</h1>
    </div>
  </header>;
}
