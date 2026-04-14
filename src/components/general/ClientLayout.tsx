"use client";
import type React from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircle, LayoutDashboard, User } from "lucide-react";
import { useState, useEffect, useTransition } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import BackgroundPattern from "@/components/general/BackgroundPattern";
import { Footer } from "@/components/general/FooterPattern";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Track navigation state
  const [isNavigating, setIsNavigating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Reset navigation state when pathname changes
  const pathname = usePathname();
  useEffect(() => {
    setIsNavigating(false);
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="relative z-10">
        <BackgroundPattern />
        <div className="absolute inset-0 flex items-center justify-center">
          <nav>
            <NavButtons
              onNavigate={(href) => {
                setIsNavigating(true);
                // Use React transitions for better UX
                startTransition(() => {
                  router.push(href);
                });
              }}
            />
          </nav>
        </div>
      </header>
      <main className="flex-grow bg-background relative">
        {/* Loading overlay during navigation */}
        {(isNavigating || isPending) && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        <div className="container mx-auto px-4 py-8">{children}</div>
      </main>
      <Footer name="Social Machines and Robotics Lab - NYUAD" />
      <Toaster />
    </div>
  );
}

function NavButtons({ onNavigate }: { onNavigate: (href: string) => void }) {
  const pathname = usePathname();

  const navItems = [
    { href: "/app/chat", label: "Chatbot", icon: MessageCircle },
    { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/app/account", label: "Account", icon: User },
  ];

  return (
    <div className="flex space-x-2 bg-background/80 backdrop-blur-sm p-2 rounded-xl shadow-lg">
      {navItems.map((item) => (
        <Button
          key={item.href}
          variant={pathname === item.href ? "default" : "ghost"}
          className={cn(
            "flex items-center space-x-2",
            pathname === item.href && "pointer-events-none"
          )}
          onClick={
            pathname !== item.href ? () => onNavigate(item.href) : undefined
          }
        >
          <item.icon className="w-4 h-4" />
          <span className="hidden sm:inline">{item.label}</span>
        </Button>
      ))}
    </div>
  );
}
