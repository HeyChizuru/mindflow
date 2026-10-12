"use client";

import { FileText, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/hooks/use-i18n";
import { cn } from "@/lib/utils";

const MAX_PDF_BYTES = 50 * 1024 * 1024;

type GenerationToolbarProps = {
  pdfFile: File | null;
  onPdfFileChange: (file: File | null) => void;
  onPdfError: (message: string | null) => void;
};

/** 阶段 A：PDF 上传，图标与 pill 样式对齐 OpenMAIC 底栏 */
export function GenerationToolbar({
  pdfFile,
  onPdfFileChange,
  onPdfError,
}: GenerationToolbarProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const pillCls =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer select-none whitespace-nowrap border";
  const pillMuted = cn(
    pillCls,
    "border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60",
  );
  const pillActive = cn(
    pillCls,
    "border-violet-200/60 dark:border-violet-700/50 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
  );

  const handleFileSelect = (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      onPdfError("请上传 PDF 文件");
      return;
    }
    if (file.size === 0) {
      onPdfError("PDF 文件不能为空");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      onPdfError(t("upload.fileTooLarge"));
      return;
    }
    onPdfError(null);
    onPdfFileChange(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFileSelect(file);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 min-h-8">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={pdfFile ? pillActive : pillMuted}>
            {pdfFile ? (
              <>
                <Paperclip className="size-3.5 shrink-0" />
                <span className="max-w-[120px] truncate">{pdfFile.name}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="rounded-full p-0.5 hover:bg-violet-200/60 dark:hover:bg-violet-800/40"
                  aria-label="移除 PDF"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPdfFileChange(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onPdfFileChange(null);
                    }
                  }}
                >
                  <X className="size-3" />
                </span>
              </>
            ) : (
              <Paperclip className="size-3.5" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleInputChange}
          />
          {pdfFile ? (
            <div className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
                  <FileText className="size-5 text-violet-600 dark:text-violet-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{pdfFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="w-full text-left text-xs text-destructive hover:underline"
                onClick={() => onPdfFileChange(null)}
              >
                {t("toolbar.removePdf")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={cn(
                "flex w-full flex-col items-center gap-2 border-0 bg-transparent p-6 text-center transition-colors",
                isDragging && "bg-muted/60",
              )}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFileSelect(f);
              }}
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <FileText className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">{t("toolbar.pdfUpload")}</p>
              <p className="text-xs text-muted-foreground">{t("upload.pdfSizeLimit")}</p>
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
