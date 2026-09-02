import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "赛点｜内部赛事竞猜",
  description: "2027年“策划杯”秋季赛竞猜系统",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
