import { Fredoka, Nunito } from "next/font/google";
import type { CSSProperties, ReactNode } from "react";

import { colors, themeCssVars } from "../../lib/theme";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-fredoka",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-nunito",
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
