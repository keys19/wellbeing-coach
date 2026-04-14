"use client";

// import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClerk } from "@clerk/nextjs";

export default function SignoutButton() {
  const { signOut } = useClerk();

  const handleSignOut = async () => {
    // Clear all chat-related localStorage items
    localStorage.removeItem("cached_chat_messages");
    localStorage.removeItem("cached_session_id");
    localStorage.removeItem("cached_bot_preferences");

    // Use the Clerk signOut method
    await signOut();
  };

  return (
    <Button
      variant="default"
      className="bg-black hover:bg-black/90"
      onClick={handleSignOut}
    >
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </Button>
  );
}
