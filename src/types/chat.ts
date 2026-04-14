export interface ChatMessage {
    id: string;
    role: "user" | "system" | "assistant" | "data" | "tool";
    content: string;
    messageIndex?: number;
    createdAt?: string | Date;
     meta?: {
    kind?: string;
    tool?: string;
    inferred?: string;
  };
} 