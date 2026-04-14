// "use client";
// import React from "react";
// import Link from "next/link";
// import { usePathname } from "next/navigation";
// import { MessageCircle, LayoutDashboard, User } from "lucide-react";

// import { cn } from "@/lib/utils";
// import { Button } from "@/components/ui/button";
// import BackgroundPattern from "@/components/general/BackgroundPattern";
// import { Footer } from "@/components/general/FooterPattern";

// export default function Layout({ children }: { children: React.ReactNode }) {
//   return (
//     <div className="min-h-screen flex flex-col">
//       <header className="relative z-10">
//         <BackgroundPattern />
//         <div className="absolute inset-0 flex items-center justify-center">
//           <nav>
//             <NavButtons />
//           </nav>
//         </div>
//       </header>
//       <main className="flex-grow bg-background">
//         <div className="container mx-auto px-4 py-8">{children}</div>
//       </main>
//       <Footer name="Social Machines and Robotics Lab - NYUAD" />
//     </div>
//   );
// }

// function NavButtons() {
//   const pathname = usePathname();

//   const navItems = [
//     { href: "/app/chat", label: "Chatbot", icon: MessageCircle },
//     { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
//     { href: "/app/account", label: "Account", icon: User },
//   ];

//   return (
//     <div className="flex space-x-2 bg-background/80 backdrop-blur-sm p-2 rounded-xl shadow-lg">
//       {navItems.map((item) => (
//         <Button
//           key={item.href}
//           variant={pathname === item.href ? "default" : "ghost"}
//           className={cn(
//             "flex items-center space-x-2",
//             pathname === item.href && "pointer-events-none"
//           )}
//           asChild
//         >
//           <Link href={item.href}>
//             <item.icon className="w-4 h-4" />
//             <span className="hidden sm:inline">{item.label}</span>
//           </Link>
//         </Button>
//       ))}
//     </div>
//   );
// }

import type React from "react";
import type { Metadata } from "next";
import ClientLayoutWrapper from "@/components/general/ClientLayoutWrapper";

export const metadata: Metadata = {
  title: "Mental Health Chatbot",
  description: "A chatbot to help with mental health",
};

// Use a separate client component that wraps both BotContextProvider and ClientLayout
// to avoid hydration mismatches
export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClientLayoutWrapper>{children}</ClientLayoutWrapper>;
}
