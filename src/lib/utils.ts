import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function scrollToBottom(force: boolean = false) {
  if (typeof window === "undefined") return;

  const chatContainer = document.getElementById("chat-container");
  if (!chatContainer) return;

  const shouldScroll =
    force ||
    chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 100;

  if (shouldScroll) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}
