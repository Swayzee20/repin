import localFont from "next/font/local";
import type { CSSProperties, ReactNode } from "react";

import { colors, themeCssVars } from "../../lib/theme";

const fredoka = localFont({
  src: [{ path: "./fonts/fredoka-latin-700-normal.woff2", weight: "700", style: "normal" }],
  variable: "--font-fredoka",
  display: "swap",
});

const nunito = localFont({
  src: [
    { path: "./fonts/nunito-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/nunito-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/nunito-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/nunito-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/nunito-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-nunito",
  display: "swap",
});

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${fredoka.variable} ${nunito.variable}`}
      style={{
        ...themeCssVars(),
        "--rp-font-display": "var(--font-fredoka), Fredoka, sans-serif",
        "--rp-font-body": "var(--font-nunito), Nunito, ui-sans-serif, sans-serif",
        colorScheme: "light",
        minHeight: "100vh",
      } as CSSProperties}
    >
      <style>{`html, body { margin: 0; background: ${colors.background}; }`}</style>
      {children}
    </div>
  );
}
