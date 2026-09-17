import type { Metadata } from "next";
import { ReactNode } from "react";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sổ Thu Chi",
  description: "Hệ thống quản lý sổ thu chi nội bộ",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
