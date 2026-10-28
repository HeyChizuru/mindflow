import type { Metadata } from "next";
import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { cn } from "@/lib/utils/cn";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ModelSettingsDialog } from "@/components/model-settings-dialog";

const inter = localFont({
  src: '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-sans',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: "MindFlow",
  description:
    "AI knowledge-base driven interactive classroom generation system.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "font-sans", inter.variable)}
      suppressHydrationWarning
    >
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} min-h-full flex flex-col font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          {children}
          <ModelSettingsDialog />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
