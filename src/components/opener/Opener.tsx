"use client";
// import { Button } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import Link from "next/link";

import { useEffect, useState } from "react";

export default function Opener() {
  const [currentPhrase, setCurrentPhrase] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [loopNum, setLoopNum] = useState(0);
  const [typingSpeed, setTypingSpeed] = useState(150);

  useEffect(() => {
    const phrases = [
      "find clarity.",
      "embrace calm.",
      "navigate challenges.",
      "reclaim your peace.",
      "take the next step.",
    ];
    let timer: NodeJS.Timeout;

    const handleTyping = () => {
      const i = loopNum % phrases.length;
      const fullPhrase = phrases[i];

      setCurrentPhrase((prev) =>
        isDeleting
          ? fullPhrase.substring(0, prev.length - 1)
          : fullPhrase.substring(0, prev.length + 1)
      );

      setTypingSpeed(isDeleting ? 50 : 150);

      if (!isDeleting && currentPhrase === fullPhrase) {
        setIsDeleting(true);
        setTypingSpeed(1000); // Pause at end of word
      } else if (isDeleting && currentPhrase === "") {
        setIsDeleting(false);
        setLoopNum(loopNum + 1);
        setTypingSpeed(500); // Pause before starting new word
      }
    };

    // eslint-disable-next-line prefer-const
    timer = setTimeout(handleTyping, typingSpeed);

    return () => clearTimeout(timer);
  }, [currentPhrase, isDeleting, loopNum, typingSpeed]);

  return (
    <main className="animated-gradient overflow-auto scrollbar-hide h-screen w-screen flex flex-col xl:flex-row items-center justify-center gap-10">
      <div className="fixed pl-8">
        <div className="absolute left-0 top-7 bottom-0 w-0.5 bg-white"></div>
        <h1 className="text-5xl font-bold text-white transition-colors duration-700 my-6 max-w-[1000px] drop-shadow-lg">
          Welcome to GROW.
        </h1>

        <div className="flex text-xl md:text-2xl space-x-2">
          <p className="text-white drop-shadow-lg">
            Your Wellbeing companion, ready to help you
          </p>
          <p className="text-white drop-shadow-lg font-medium whitespace-nowrap italic">
            {currentPhrase}
            <span className="animate-blink">|</span>
          </p>
        </div>

        <div className="flex mt-7 space-x-3">
          <Button
            variant="outline"
            size="lg"
            className="drop-shadow-lg transition-opacity duration-150 hover:opacity-90 active:opacity-70"
            asChild
          >
            <Link href="/sign-in"> Get Started</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
