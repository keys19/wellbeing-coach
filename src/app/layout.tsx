import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "../styles/globals.css";



const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mental Health Chatbot",
  description: "Take care of your mental health with our chatbot.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider 
  afterSignInUrl="/app/dashboard"
  afterSignUpUrl="/app/dashboard"
  >
      <html lang="en">
        <head>
          <script
  dangerouslySetInnerHTML={{
    __html: `
      /* Ensure there's always welcome message cached */
      try {
        const cachedMessages = localStorage.getItem("cached_chat_messages");
        if (!cachedMessages || cachedMessages === "[]") {
          const welcomeMessage = [
            {
              id: "init",
              role: "system",
              content: "Start"
            },
            {
              id: "welcome-" + Date.now(),
              role: "assistant",
              content: "Hello there! I'm your mental health coach. How are you feeling today? I'm here to help you with productivity techniques and emotional support."
            }
          ];
          localStorage.setItem("cached_chat_messages", JSON.stringify(welcomeMessage));
          console.log("Added default welcome message to localStorage");
        }
      } catch (e) {
        console.error("Error setting default message:", e);
      }
    `,
  }}
/>

        </head>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          {children}
          
        </body>
      </html>
    </ClerkProvider>
  );
}
