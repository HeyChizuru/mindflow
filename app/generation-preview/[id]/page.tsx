import Link from "next/link";

type GenerationPreviewPageProps = PageProps<"/generation-preview/[id]">;

/** 阶段 B：生成预览占位（不调 ingest / 大纲） */
export default async function GenerationPreviewPage({ params }: GenerationPreviewPageProps) {
  const { id } = await params;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-gradient-to-b from-slate-50 to-slate-100 px-4 dark:from-slate-950 dark:to-slate-900">
      <p className="text-sm text-muted-foreground">生成预览（开发中）</p>
      <p className="font-mono text-xs text-muted-foreground/80 break-all text-center max-w-md">
        {id}
      </p>
      <Link
        href="/"
        className="text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        返回首页
      </Link>
    </div>
  );
}
