import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "赛点｜内部赛事竞猜",
  description: "2026–2027 内部策划赛竞猜系统 MVP",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
