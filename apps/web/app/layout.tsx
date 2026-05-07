import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";

export const metadata: Metadata = {
  title: "Thai Horoscope Mock MVP",
  description: "Mock end-to-end MVP flow for Thai horoscope platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            Thai Horoscope
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/onboarding">Onboarding</Link>
            <Link href="/today">วันนี้</Link>
            <Link href="/weekly">สัปดาห์</Link>
            <Link href="/monthly">เดือน</Link>
            <Link href="/yearly">ปี</Link>
            <Link href="/subscribe">แพ็กเกจ</Link>
            <Link href="/account">บัญชี</Link>
            <Link href="/settings/notifications">ตั้งค่า</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
