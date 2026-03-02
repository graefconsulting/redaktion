import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { CalendarRange, Settings, ListPlus } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Health Rise Redaktionsplaner",
  description: "Redaktionsplaner App für Health Rise GmbH",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${inter.className} min-h-screen bg-neutral-50 flex`}>
        {/* Sidebar Nav */}
        <aside className="w-64 bg-white border-r flex flex-col hidden md:flex sticky top-0 h-screen">
          <div className="p-6">
            <img src="/logo.png" alt="Health Rise" className="max-h-10 w-auto mb-1" />
            <p className="text-sm text-neutral-500 font-medium">Redaktionsplaner</p>
          </div>
          <nav className="flex-1 px-4 space-y-2 mt-4">
            <Link href="/" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-neutral-100 text-neutral-900 transition-colors">
              <CalendarRange className="h-4 w-4 text-teal-600" />
              KW Planen
            </Link>
            <Link href="/uebersicht" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-neutral-100 text-neutral-600 transition-colors">
              <ListPlus className="h-4 w-4 text-teal-600" />
              Wochenübersicht
            </Link>
          </nav>
          <div className="p-4 border-t">
            <Link href="/einstellungen" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-neutral-100 text-neutral-600 transition-colors">
              <Settings className="h-4 w-4 text-teal-600" />
              Einstellungen
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-h-screen">
          <header className="h-16 bg-white border-b flex items-center px-6 md:hidden">
            <img src="/logo.png" alt="Health Rise" className="max-h-8 w-auto mr-3" />
            <h1 className="text-sm font-bold text-neutral-600">Redaktionsplaner</h1>
          </header>
          <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
