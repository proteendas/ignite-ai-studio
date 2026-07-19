import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'IgniteAI Studio',
  description: 'Spark intelligence from any document.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Dark-mode-first: html starts with `dark`. ThemeToggle re-applies the user's
  // stored preference on mount. The inline script avoids a light->dark flash for
  // users who chose light previously.
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('igniteai-theme');if(t==='light'){document.documentElement.classList.remove('dark');}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-base text-content antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
