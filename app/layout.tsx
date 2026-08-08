import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/shared/ui/sonner";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { Geist_Mono, Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { InstalacionPwaListener } from "@/shared/components/instalacion-pwa-listener";
import { ClientErrorReporter } from "@/shared/components/client-error-reporter";


const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal"],
  variable: "--font-mono",
});

const geist = Geist({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
  style: ["normal"],
  variable: "--font-sans",
});

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase
    .from("configuracion_pos")
    .select("posName")
    .limit(1)
    .single();

  // Fuera de un negocio (login, recuperar contraseña, landing) no hay
  // configuración que leer: ahí la marca es la de la plataforma, no la de un
  // comercio. Sin este fallback el título salía "undefined | Gestión POS".
  const posName = data?.posName || "Comerz";

  return {
    title: `${posName} | Gestión POS`,
    description: "Sistema de gestión y punto de venta web",
    appleWebApp: {
      capable: true,
      title: posName,
      statusBarStyle: "black-translucent",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={cn(
        "h-full",
        "antialiased",
        "font-sans",
        geist.variable,
        geistMono.variable,
      )}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
        <ClientErrorReporter />
        <InstalacionPwaListener />
        <Analytics/>
        <SpeedInsights/>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-PGP6P5VS3Y"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-PGP6P5VS3Y');
          `}
        </Script>
      </body>
    </html>
  );
}
