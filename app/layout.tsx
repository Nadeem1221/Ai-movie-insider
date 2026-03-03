import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "AI Movie Insight Builder",
  description:
    "Enter an IMDb ID and get smart insights on movie metadata, cast, and audience sentiment."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="main-shell">{children}</main>
      </body>
    </html>
  );
}
