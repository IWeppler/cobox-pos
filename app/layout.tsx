import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/shared/ui/sonner";
import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

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

  const posName = data?.posName;

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
      className={cn("h-full", "antialiased", "font-sans", inter.variable)}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,1..1000&display=swap"
          rel="stylesheet"
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
      </body>
    </html>
  );
}
