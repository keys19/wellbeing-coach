// src/app/(private)/dashboard/helpers.ts

export function cleanMessageContent(content: string) {
  return content.replace(/isContinued/g, "").trim();
}

export function extractHighlightsFromMessages(messages: any[]) {
  return messages.slice(0, 2).map((msg) => ({
    date: new Date().toDateString(),
    content: cleanMessageContent(msg.content),
  }));
}

export function calculateEmotionalWellbeing(messages: any[]) {
  return 70;
}
