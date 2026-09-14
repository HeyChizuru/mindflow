"use client";
import { ArrowUpIcon } from "lucide-react";
import { motion } from "motion/react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils/cn";

export default function Home() {
  return (
    <div className="min-h-dvh w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center p-4 pt-16 md:p-8 md:pt-16 overflow-x-hidden">
      {/* ═══ 背景装饰 ═══ */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: "4s" }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: "6s" }}
        />
      </div>
      {/* 内容区域 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={cn(
          "relative z-20 w-full max-w-200 flex flex-col items-center justify-center min-h-[calc(100dvh-8rem)]",
        )}
      >
        {/* 头部 logo */}
        <motion.img src="/mindflow-logo.svg" alt="MindFlow"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-32 md:h-40 mb-2 -ml-2 md:-ml-3"
        />
        {/* 输入区 */}
        <motion.div className="w-full max-w-200 flex flex-col items-center justify-center">
          <InputGroup className="bg-background">
            <InputGroupTextarea
              aria-label="需求输入"
              placeholder="描述你想生成的内容…"
              className="min-h-24"
            />
            <InputGroupAddon align="block-end">
              <InputGroupButton
                variant="default"
                size="icon-sm"
                className="ml-auto"
                aria-label="发送"
              >
                <ArrowUpIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </motion.div>
      </motion.div>
    </div>
  );
}
