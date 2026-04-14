

"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { useDashboardSync } from "@/hooks/useDashboardSync";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowRight,
  Clock,
  Target,
  User,
  BrainCircuit,
  LineChart as LineChartIcon,
  CheckCircle,
  MessageCircle,
  Circle,
  CalendarDays,
  ExternalLink,
  CircleHelp
} from "lucide-react";
import { JsonValue } from "@prisma/client/runtime/library";
import { cn } from "@/lib/utils";
import TabSyncRefresh from "./TabSyncRefresh";
import { InfoPopover } from "./InfoPopover";
import { analyzeCommunicationStyle } from "@/lib/communication-style";
import { extractThemes } from "@/lib/extract-themes";
import GettingStartedDialog from "./GettingStartedDialog";
import type { Message } from "ai";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

import DashboardSkeleton from "./DashboardSkeleton";


interface UserProfile {
  id?: string;
  userId?: string;
  age?: number | null;
  gender?: string | null;
  collegeYear?: string | null;
  major?: string | null;
  openMindedness?: number | null;
  conscientiousness?: number | null;
  extraversion?: number | null;
  agreeableness?: number | null;
  neuroticism?: number | null;
  emotionalAwareness?: string | null;
  copingStrategies?: string | null;
  motivationType?: string | null;
  challenges?: Record<string, unknown> | JsonValue | null;
  goals?:
    | {
        mental_health_goals?: Array<{
          description: string;
          measures: string;
          timeframe: string;
          steps: string[];
          obstacles: string[];
          completed: boolean;
          progress?: number;
          lastUpdated?: string;
          calendarEventId?: string;
          calendarEventLink?: string;
        }>;
      }
    | JsonValue
    | null;
  commStyle?: Record<string, unknown> | JsonValue | null;
  feedback?: Record<string, unknown> | JsonValue | null;
  hideWelcomeDialog?: boolean | null;
  createdAt?: Date;
  updatedAt?: Date;
  calendarPreferredWindow?: PreferredWindow | null;
  timeZone?: string | null;
  bevs?: {
    startedAt?: string | null;
    completedAt?: string | null;
    currentStep?: "intro" | "collect_values" | "collect_scores" | "confirm" | "done" | null;
    domainIndex?: number | null;
    domains?: Array<{
      domain: "Work/Studies" | "Relationships" | "Personal Growth/Health" | "Leisure";
      valuesText?: string | null;
      examples?: string[] | null;
    }>;
    assessments?: Array<{
      at: string;
      scores: Partial<{
        "Work/Studies": number;
        "Relationships": number;
        "Personal Growth/Health": number;
        "Leisure": number;
      }>;
    }>;
  } | null;
}

interface MentalHealthGoal {
  description: string;
  measures: string;
  timeframe: string;
  steps: string[];
  obstacles: string[];
  completed: boolean;
  progress?: number;
  lastUpdated?: string;
  calendarEventId?: string;
  calendarEventLink?: string;
  calendarCheckins?: CalendarCheckin[] | null;
}

type PreferredWindow = "morning" | "afternoon" | "evening" | "night";
const BEVS_DOMAINS = ["Work/Studies", "Relationships", "Personal Growth/Health", "Leisure"] as const;
type BevsDomain = typeof BEVS_DOMAINS[number];

function getLatestBevsScores(profile: UserProfile | null): { domain: BevsDomain; score: number }[] {
  const a = profile?.bevs?.assessments;
  if (!a || a.length === 0) {  
    return BEVS_DOMAINS.map((d) => ({ domain: d, score: 0 }));
  }

  //get timestamps
  const getTs = (item: any, idx: number) => {
    const raw = item?.at;
    if (typeof raw === "string") {
      const s = raw.trim().toLowerCase();
      if (s === "now" || s === "today") {
        const timestamp = Date.now();
        
        return timestamp;
      }
      const t = Date.parse(raw);
      if (!Number.isNaN(t)) {
        
        return t;
      }
    }
    // fallback: stable increasing timestamp by index
    return idx;
  };

  let latest = a[0];
  let latestTs = getTs(latest, 0);
  
  for (let i = 1; i < a.length; i++) {
    const ts = getTs(a[i], i);
    
    if (ts >= latestTs) {
      latest = a[i];
      latestTs = ts;
      
    }
  }

  const scores = (latest as any)?.scores || {};

  // normalizing keys 
  const norm = (k: string) => {
    const s = k.toLowerCase().replace(/\s|_|-|\/|\\|\.|,/g, "");
    if (s.includes("work") || s.includes("study") || s.includes("studies")) return "workstudies";
    if (s.includes("relation")) return "relationships";
    if (s.includes("personal") || s.includes("growth") || s.includes("health")) return "personalgrowthhealth";
    if (s.includes("leisure") || s.includes("fun") || s.includes("recreation")) return "leisure";
    return s;
  };

  const pickScore = (obj: Record<string, any>, domain: BevsDomain) => {
    if (!obj) {
      return undefined;
    }
    
    // direct hit first
    if (Object.prototype.hasOwnProperty.call(obj, domain)) {
      const directScore = (obj as any)[domain];
      return directScore;
    }
    
    // then try normalized match
    const target = norm(domain);
    for (const [k, v] of Object.entries(obj)) {
      const normalizedKey = norm(k);
      
      if (normalizedKey === target) {
        
        return v as any;
      }
    }
    
    
    return undefined;
  };

  const result = BEVS_DOMAINS.map((d) => {
    const raw = pickScore(scores as any, d);
    
    
    // Handle MongoDB NumberInt objects
    let numericValue;
    if (raw && typeof raw === 'object' && raw.$numberInt !== undefined) {
      numericValue = Number(raw.$numberInt);
      
    } else {
      numericValue = Number(raw);
      
    }
    
    const clamped = Number.isFinite(numericValue) ? Math.max(0, Math.min(7, numericValue)) : 0;
    
    
    return { domain: d, score: clamped };
  });

  // console.log(" Final BEVS scores result:", result);
  return result;
}

function getLowestBevsDomain(scores: { domain: BevsDomain; score: number }[]): BevsDomain | null {
  const nonZero = scores.filter(s => s.score > 0);
  if (nonZero.length === 0) return null;
  return nonZero.reduce((min, cur) => (cur.score < min.score ? cur : min)).domain;
}

function getHighestBevsDomain(scores: { domain: string; score: number }[]) {
  if (!scores || scores.length === 0) return null;
  const valid = scores.filter(s => s.score > 0);
  if (!valid.length) return null;
  return valid.reduce((a, b) => (a.score > b.score ? a : b)).domain;
}

function getEffectiveBevsCompletedISO(profile: UserProfile | null): string | null {
  if (!profile?.bevs) return null;

  const toTs = (raw: any, idxFallback: number) => {
    if (typeof raw === "string") {
      const s = raw.trim().toLowerCase();
      if (s === "now" || s === "today") return Date.now();
      const t = Date.parse(raw);
      if (!Number.isNaN(t)) return t;
    }
    return idxFallback; 
  };

  // 1) try bevs.completedAt
  let bestTs = Number.NEGATIVE_INFINITY;
  if (profile.bevs.completedAt) {
    const t = Date.parse(profile.bevs.completedAt);
    if (!Number.isNaN(t)) bestTs = t;
  }

  // 2) compare with latest assessment.at
  const a = profile.bevs.assessments;
  if (Array.isArray(a) && a.length > 0) {
    let latestTs = toTs(a[0]?.at, 0);
    for (let i = 1; i < a.length; i++) {
      const ts = toTs(a[i]?.at, i);
      if (ts >= latestTs) latestTs = ts;
    }
    if (latestTs > bestTs) bestTs = latestTs;
  }

  if (!Number.isFinite(bestTs) || bestTs === Number.NEGATIVE_INFINITY) return null;
  return new Date(bestTs).toISOString();
}

function formatBevsCompletedDate(profile: UserProfile | null): string | null {
  const iso = getEffectiveBevsCompletedISO(profile);
  if (!iso) return null;
  const d = new Date(iso);
  // Matches “6/10/2024” style
  return d.toLocaleDateString("en-US", { year: "numeric", month: "numeric", day: "numeric" });
}

interface CalendarCheckin {
  type?: "mid" | "final";
  id?: string;        // Google event id
  link?: string;      // htmlLink from Google
  when?: string;      // ISO datetime for start
  window?: PreferredWindow;
}

interface Session {
  id: string;
  createdAt: Date | string;
  userId: string;
  currentPhase?: string;
}

function loadCachedSessionAndMessages() {
  if (typeof window === "undefined") return { session: null, messages: [] };

  const cachedSessionId = localStorage.getItem("cached_session_id");
  const cachedMessages = localStorage.getItem("cached_chat_messages");

  let session: Session | null = null;
  let messages = [];
  if (cachedSessionId) {
    session = {
      id: cachedSessionId,
      createdAt: new Date(), 
      userId: "local",
      currentPhase: localStorage.getItem("cached_chat_phase") || "introduction",
    };
  }
  if (cachedMessages) {
    try {
      messages = JSON.parse(cachedMessages);
    } catch {
      messages = [];
    }
  }
  return { session, messages };
}

type Tab = 'overview' | 'goals' | 'insights'
function BevsDartboard({ scores, userProfile }: { scores: { domain: BevsDomain; score: number }[], userProfile: UserProfile | null }) {
    if (!scores || scores.length === 0) {
    return (
      <div className="flex items-center justify-center h-[320px] text-sm text-muted-foreground">
        Complete your BEVS check-in to see values alignment here.
      </div>
    );
  }

    const data = scores.map(s => ({
    domain: s.domain,
    value: Math.max(0, Math.min(7, Number(s.score) || 0)),
  }));

  const anyScore = data.some(d => d.value > 0);

  return (
        <div className="h-[320px] sm:h-[360px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="85%">
          <PolarGrid gridType="circle" />
          <PolarAngleAxis dataKey="domain" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis angle={90} domain={[0, 7]} tick={{ fontSize: 11 }} tickCount={8} />
          <Radar
            name="Values alignment"
            dataKey="value"
            stroke="#6366f1"
            fill="#6366f1"
            fillOpacity={anyScore ? 0.3 : 0.15}
          />
          {/* <Tooltip
            formatter={(v: any) => [`Score: ${v}/7`, "Values alignment"]}
            cursor={{ strokeDasharray: "3 3" }}
          /> */}
          <Tooltip
  formatter={(v: any, _name: string, props: any) => {
    const domain = props.payload.domain;
    const valueText = userProfile?.bevs?.domains?.find(
      (d) => d.domain === domain
    )?.valuesText;
    return [
      `Score: ${v}/7${valueText ? `, Value: ${valueText}` : ""}`,
      "Values alignment",
    ];
  }}
  cursor={{ strokeDasharray: "3 3" }}
/>
        </RadarChart>
      </ResponsiveContainer>
      {/* <div className="mt-2 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>The closer your score, the more your actions reflect your values. Strength shows where you’re already living in line with your values, and Suggested Focus highlights an area you could bring more attention to.</span>
        
      </div> */}
    </div>
  );
}

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [currentDate, setCurrentDate] = useState("");
  const [latestSession, setLatestSession] = useState<Session | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [sessionMessages, setSessionMessages] = useState<
    { role: string; content: string; createdAt: string | Date }[]
  >([]);
  const [isLoadingSessionMessages, setIsLoadingSessionMessages] =
    useState(false);
  const [recentHighlights, setRecentHighlights] = useState<
    { date: string; content: string; rawDate?: string }[]
  >([]);
  const [communicationStyle, setCommunicationStyle] = useState<{
    tone: string;
    length: string;
    emotional_style: string;
    thinking_style: string;
  } | null>(null);
  const [isAnalyzingComm, setIsAnalyzingComm] = useState(false);
  const [keyThemes, setKeyThemes] = useState<string[]>([]);
  const [previousMessageCount, setPreviousMessageCount] = useState(0);
  const [commAnalysisError, setCommAnalysisError] = useState<string | null>(
    null
  );
  const [dailyWellbeing, setDailyWellbeing] = useState<
    { date: string; wellbeing: number | string }[]
  >([]);
  const [selectedTab, setSelectedTab] = useState<Tab>('overview')
  const [activeTab, setActiveTab] = useState<'overview' | 'goals' | 'insights'>('overview')
  const [month, setMonth] = useState('')
  const [goalCalendarEvents, setGoalCalendarEvents] = useState<Record<number, string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("goalCalendarEvents");
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });
  const analyzeRunRef = useRef(0);
  const [openHelp, setOpenHelp] = useState(false);

  // Helper to persist communication style to DB
  async function saveCommStyleToDB(comm: any) {
    if (!user?.id) return;
    try {
      // Prefer PUT to update profile with commStyle; adjust to your API if needed.
      const res = await fetch("/api/user-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          update: { commStyle: comm },
        }),
      });
      if (!res.ok) {
        console.error("Failed to save commStyle to DB:", res.status, res.statusText);
        return false;
      }
      return true;
    } catch (e) {
      console.error("saveCommStyleToDB error:", e);
      return false;
    }
  }

const { refreshData } = useDashboardSync(user?.id);

  const handleRefresh = useCallback(async () => {
    const data = await refreshData();
    if (data) {
      if (data.profile) setUserProfile(data.profile);
      if (data.session !== undefined) setLatestSession(data.session);
      if (data.messages) setSessionMessages(data.messages);
    }
  }, [refreshData]);


  useEffect(() => {
    const current = new Date()
    const monthName = current.toLocaleString('default', { month: 'long' })
    setMonth(monthName)
  }, [])
  
  // for formatting current date
  useEffect(() => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    setCurrentDate(now.toLocaleDateString("en-US", options));
  }, []);

  //redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !user) {
      router.push("/sign-in");
    }
  }, [isLoaded, user, router]);

  // fetch user profile from database
  useEffect(() => {
  async function fetchUserProfile() {
    if (isLoaded && user) {
      try {
        setIsLoadingProfile(true);
        const response = await fetch(`/api/user-profile?userId=${user.id}`);
        if (response.ok) {
          const data = await response.json();
          setUserProfile(data.profile);
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      } finally {
        setIsLoadingProfile(false);
      }
    }
  }
  fetchUserProfile();
}, [isLoaded, user]);

  // fetch latest session data
  useEffect(() => {
    async function fetchLatestSession() {
      if (isLoaded && user) {
        try {
          setIsLoadingSession(true);
          const response = await fetch(`/api/sessions?getLatest=true`);
          if (response.ok) {
          const data = await response.json();
          if (data.latestSession) {
            setLatestSession(data.latestSession);
          } else {
            // no session yet → don't keep the skeleton up
            setLatestSession(null);
            setIsLoadingSessionMessages(false);
          }
        }
        } catch (error) {
          console.error("Error fetching latest session:", error);
        } finally {
          setIsLoadingSession(false);
        }
      } else if (isLoaded && !user) {
        setIsLoadingSession(false);
      }
    }

    fetchLatestSession();
  }, [isLoaded, user]);

  // fetch messages for latest session
  useEffect(() => {
  async function fetchSessionMessages() {
    if (
      latestSession &&
      latestSession.id &&
      !latestSession.id.startsWith("temp-") // <-- skip temp sessions
    ) {
      try {
        setIsLoadingSessionMessages(true);
        

        const response = await fetch(
          `/api/sessions/${latestSession.id}/messages`
        );

        if (response.ok) {
          const data = await response.json();

          if (data.messages && Array.isArray(data.messages)) {
            setSessionMessages(data.messages);

            // Generate highlights from messages
            const extractedHighlights = extractHighlightsFromMessages(
              data.messages,
              latestSession
            );
            setRecentHighlights(extractedHighlights);
          } else {
            
          }
        } else {
          console.error(
            `Error fetching messages: ${response.status} ${response.statusText}`
          );
        }
      } catch (error) {
        console.error("Error fetching session messages:", error);
      } finally {
        setIsLoadingSessionMessages(false);
      }
    }
  }

  if (
    !isLoadingSession &&
    latestSession &&
    !latestSession.id.startsWith("temp-") // <-- skip temp sessions
  ) {
    fetchSessionMessages();
  }
}, [latestSession, isLoadingSession]);


  //process messages to extract highlights and analyze communication style whenever they change
  useEffect(() => {
    if (sessionMessages && sessionMessages.length > 0 && latestSession) {

      const extractedHighlights = extractHighlightsFromMessages(
        sessionMessages,
        latestSession
      );

      const processedHighlights = extractedHighlights.map((highlight) => {
        if (!highlight.rawDate && latestSession.createdAt) {
          // If no rawDate but we have session.createdAt, use that
          const date =
            typeof latestSession.createdAt === "string"
              ? latestSession.createdAt
              : latestSession.createdAt instanceof Date
              ? latestSession.createdAt.toISOString()
              : new Date().toISOString();

          return {
            ...highlight,
            rawDate: date,
          };
        }
        return highlight;
      });

      setRecentHighlights(processedHighlights);

      // analyzeConversation(sessionMessages);
    }
  }, [sessionMessages, latestSession]);

  
  useEffect(() => {
    // Only proceed if we have messages but no communication style yet or message count has changed significantly
    const shouldAnalyze =
      sessionMessages &&
      sessionMessages.length >= 3 &&
      (!communicationStyle ||
        // re-analyze if we have at least 5 more messages than last time
        sessionMessages.length > previousMessageCount + 5);

    if (shouldAnalyze && !isAnalyzingComm) {
      analyzeConversation(sessionMessages);
    }

    // Update the previous message count reference
    setPreviousMessageCount(sessionMessages?.length || 0);
  }, [sessionMessages, communicationStyle, isAnalyzingComm]);

  useEffect(() => {
  // If we finished checking for a session and there isn't one,
  // make sure messages are not considered "loading".
  if (!isLoadingSession && !latestSession) {
    setIsLoadingSessionMessages(false);
  }
}, [isLoadingSession, latestSession]);
// compute daily emotional wellbeing scores from date
  function computeDailyEmotionalWellbeing(
  messages: { role: string; content: string; createdAt: string | Date }[],
  scoreFn: (
    msgs: { role: string; content: string; createdAt: string | Date }[]
  ) => number | string
): { date: string; wellbeing: number }[] {
  if (!messages || messages.length === 0) return [];

  // Group messages by YYYY-MM-DD
  const byDay = new Map<string, typeof messages>();

  for (const m of messages) {
    const d = typeof m.createdAt === "string" ? new Date(m.createdAt) : m.createdAt;
    if (!d || Number.isNaN(d.getTime())) continue;

    const key =
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const arr = byDay.get(key) || [];
    arr.push(m);
    byDay.set(key, arr);
  }

  // Score each day using your scorer
  return Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, msgs]) => {
      const raw = scoreFn(msgs);
      const val = typeof raw === "number" ? raw : 70; // fallback if "N/A"
      return { date, wellbeing: Math.round(val) };
    });
}

  useEffect(() => {
  if (sessionMessages && sessionMessages.length > 0) {
    const result = computeDailyEmotionalWellbeing(
      sessionMessages,
      calculateEmotionalWellbeing
    );
    setDailyWellbeing(result);
  }
}, [sessionMessages]);
  
  function cleanMessageContent(content: string): string {
    if (!content) return "";

    content = content.replace(/,?\\isContinued\\(false\\)/g, "");
    content = content.replace(/,?isContinued\(false\)/g, "");
    content = content.replace(/,?"isContinued":false/g, "");
    content = content.replace(/,?isContinuedfalse\.?/g, ""); // Plain text "isContinuedfalse"
    content = content.replace(/\?isContinuedfalse/g, ""); // With question mark
    content = content.replace(/\\{/g, "{");
    content = content.replace(/\\}/g, "}");

    // remove entire JSON objects containing isContinued
    content = content.replace(/\{[^{}]*isContinued[^{}]*\}/g, "");

    // cleanup any leftover commas, braces, or backslashes
    content = content.replace(/,+\s*([},])/g, "$1");
    content = content.replace(/\\+([^\\])/g, "$1");

    // remove any trailing punctuation that might have been left after removing JSON
    content = content.replace(/[.,;:}]+$/, "");

    // trim extra whitespace
    content = content.trim();

    // Ensure the sentence ends with punctuation if it doesn't already
    if (content && !content.match(/[.!?]$/)) {
      content += ".";
    }

    return content;
  }

  function getUniqueHighlightDates(
    messages: { createdAt?: string | Date }[],
    count: number,
    sessionDate: Date 
  ): Date[] {

    const dates = messages
      .filter((msg) => msg.createdAt)
      .map((msg) => {
        if (typeof msg.createdAt === "string") {
          return new Date(msg.createdAt);
        } else if (msg.createdAt instanceof Date) {
          return msg.createdAt;
        }
        return null;
      })
      .filter(Boolean) as Date[];


    if (dates.length < count) {
      const baseDate = sessionDate;
      for (let i = dates.length; i < count; i++) {
        const daysAgo = i * 2; // Spread them out by 2 days each
        const newDate = new Date(baseDate);
        newDate.setDate(newDate.getDate() - daysAgo);
        dates.push(newDate);
      }
    }


    return dates.sort((a, b) => b.getTime() - a.getTime()).slice(0, count);
  }


  function extractHighlightsFromMessages(
    messages: {
      role: string;
      content: string;
      createdAt?: string | Date;
      id?: string;
    }[],
    session?: Session | null
  ) {
    if (!messages || messages.length === 0) return [];

    let sessionDate = new Date();
    if (session?.createdAt) {
      if (typeof session.createdAt === "string") {
        sessionDate = new Date(session.createdAt);
      } else if (session.createdAt instanceof Date) {
        sessionDate = session.createdAt;
      }
    }

    if (messages.length > 0) {
      console.log(
        "Message date check - first 3 messages:",
        messages.slice(0, 3).map((msg) => ({
          messageId: msg.id,
          hasCreatedAt: !!msg.createdAt,
          createdAtType: typeof msg.createdAt,
          createdAtValue: msg.createdAt,
        }))
      );
    }

    const highlights: { date: string; content: string; rawDate?: string }[] =
      [];

    // Create a copy of messages to avoid mutation and get only assistant messages
    // const assistantMessages = messages
    //   .filter((msg) => msg.role === "assistant")
    //   .map((msg) => ({ ...msg }));

    const assistantMessages = messages
      .filter((msg) => msg.role === "user")
      .map((msg) => ({ ...msg }));

    //impactful messages with specific keywords that indicate coaching value
    const impactfulKeywords = [
      "recommend",
      "suggest",
      "technique",
      "strategy",
      "practice",
      "progress",
      "improvement",
      "breakthrough",
      "achievement",
      "identified",
      "discovered",
      "learned",
      "realized",
      "goal",
      "plan",
      "action step",
      "next step",
      "milestone",
    ];

    // Score each message based on length and keyword presence
    const scoredMessages = assistantMessages.map((msg) => {
      // Skip very short messages or empty messages
      if (!msg.content || msg.content.length < 30) return { ...msg, score: 0 };

      // Calculate base score from length (longer messages have more content but cap at reasonable length)
      const lengthScore = Math.min(msg.content.length / 200, 3);

      // Count keyword occurrences
      let keywordScore = 0;
      const lowerContent = msg.content.toLowerCase();
      impactfulKeywords.forEach((keyword) => {
        if (lowerContent.includes(keyword)) {
          keywordScore += 1;
        }
      });

      // Bonus for messages with timestamps
      const timestampBonus = msg.createdAt ? 1 : 0;

      return {
        ...msg,
        score: lengthScore + keywordScore + timestampBonus,
      };
    });

    // Sort by score descending
    const rankedMessages = scoredMessages
      .filter((msg) => msg.score > 0)
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    // Take top 3 or fewer if not enough
    const topMessages = rankedMessages.slice(0, 3);

    // Generate unique dates for the highlights using session date
    const uniqueDates = getUniqueHighlightDates(
      topMessages,
      topMessages.length,
      sessionDate // Pass session date to function
    );

    // Format each message as a highlight
    topMessages.forEach((msg, index) => {
      // Try to use message createdAt first, then fall back to unique date
      let dateToUse = uniqueDates[index];

      // If the message has a valid createdAt, use that instead
      if (msg.createdAt) {
        if (typeof msg.createdAt === "string") {
          dateToUse = new Date(msg.createdAt);
        } else if (msg.createdAt instanceof Date) {
          dateToUse = msg.createdAt;
        }
      }

      // Extract an impactful sentence and clean it
      const content = cleanMessageContent(
        msg.content
          // Remove phase markers
          .replace(/\[(?:Phase|PHASE) \d+\]/g, "")
          .replace(
            /\[(?:ONGOING|EXPLORATION|ACTION_PLANNING|GOAL_SETTING|INTRODUCTION)_PHASE\]/g,
            ""
          )
          // Remove JSON
          .replace(/```json[\s\S]*?```/g, "")
          // Remove profile summaries
          .replace(
            /Here's what I know about you so far:[\s\S]*?(Let's|Now|I'll|Moving)/i,
            "$1"
          )
          .replace(
            /Based on our conversation, I've learned that:[\s\S]*?(Let's|Now|I'll|Moving)/i,
            "$1"
          )
          .replace(
            /Based on our conversation so far,[\s\S]*?(Let's|Now|I'll|Moving)/i,
            "$1"
          )
      );

      // Split into sentences
      const sentences = content.split(/[.!?]\s+/);

      // Look for sentences with keywords (impactful sentences)
      const impactfulSentences = sentences.filter((sentence) => {
        if (sentence.length < 20 || sentence.length > 150) return false;

        // Check for coaching-related keywords
        return impactfulKeywords.some((keyword) =>
          sentence.toLowerCase().includes(keyword)
        );
      });

      // Select best sentence or fall back to first reasonable sentence
      let highlightContent = "";
      if (impactfulSentences.length > 0) {
        // Get the first impactful sentence
        highlightContent = impactfulSentences[0].trim();
      } else {
        // Fall back to first reasonable sentence
        const reasonableSentences = sentences.filter(
          (s) =>
            s.length >= 40 &&
            s.length <= 150 &&
            !s.includes("http") &&
            !s.includes("```")
        );

        if (reasonableSentences.length > 0) {
          highlightContent = reasonableSentences[0].trim();
        } else if (sentences.length > 0) {
          // Last resort - get first sentence
          highlightContent = sentences[0].trim();
        }
      }

      // Clean the highlight content one more time
      highlightContent = cleanMessageContent(highlightContent);

      // Only add if we have content
      if (highlightContent) {
        const dateStr = dateToUse.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });

        // Store the raw ISO format date
        const rawDateStr = dateToUse.toISOString();

        console.log(
          `Created highlight with date ${dateStr} for message ${msg.id}`
        );
        highlights.push({
          date: dateStr,
          rawDate: rawDateStr,
          content: highlightContent,
        });
      }
    });

    // If we couldn't extract any highlights but have a session, add a phase-appropriate highlight
    if (highlights.length === 0 && session) {
      // Always use session date - no fallback to current date
      const dateStr = sessionDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

      // Store the raw ISO format date
      const rawDateStr = sessionDate.toISOString();

      let content =
        "We're getting to know each other and exploring strategies to support your mental health journey.";

      // Phase-specific content
      if (session.currentPhase === "goal_setting") {
        content =
          "We're working on setting clear, achievable goals to guide your mental health progress.";
      } else if (
        session.currentPhase === "action_planning" ||
        session.currentPhase === "ongoing_conversation"
      ) {
        content =
          "You're implementing strategies and making progress on your mental health goals.";
      }

      highlights.push({
        date: dateStr,
        rawDate: rawDateStr,
        content,
      });
    }

    return highlights;
  }




  //extract current phase information for dashboard display
  const determineCurrentPhase = () => {

    if (latestSession && latestSession.currentPhase) {
      const phase = latestSession.currentPhase;

      let progress = 20;
      if (phase === "exploration") progress = 60;
      if (phase === "goal_setting") progress = 60;
      if (phase === "action_planning") progress = 100;
      if (phase === "ongoing_conversation") progress = 100;

      return { phase, progress };
    }

    if (!userProfile) return { phase: "introduction", progress: 20 };

    const phase = userProfile.goals
      ? { phase: "action_planning", progress: 100 }
      : userProfile.challenges
      ? { phase: "exploration", progress: 60 }
      : { phase: "introduction", progress: 20 };

    return phase;
  };

  // Helper: Detect first visit (no session, no goals, no BEVS)
  function isFirstVisit(profile: UserProfile | null, session: Session | null) {
    const noSession = !session;
    const noGoals = !profile?.goals ||
      (typeof profile.goals === "object" &&
        !(profile.goals as any)?.mental_health_goals?.length);
    const noBevs = !profile?.bevs || !profile?.bevs?.completedAt;
    return noSession && noGoals && noBevs;
  }

  const firstVisit = isFirstVisit(userProfile, latestSession);

  const currentPhase = determineCurrentPhase();




async function analyzeConversation(
  messages: Array<{
    role: string;
    content: string;
    createdAt: string | Date;
    id?: string;
  }>
) {
  // Basic guards
  if (!messages || messages.length < 3) return;
  if (isAnalyzingComm) return;

  // Increment run id to invalidate older runs
  const runId = ++analyzeRunRef.current;

  try {
    setIsAnalyzingComm(true);
    setCommAnalysisError(null);

    // Keep it light + only relevant roles
    const simplifiedMessages = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content ?? "",
      }))
      .slice(-40); // last 40 turns max

    // Bail if nothing meaningful left
    if (simplifiedMessages.length < 3) return;

    // Run both in parallel
    const [analysis, themes] = await Promise.all([
      analyzeCommunicationStyle(simplifiedMessages as Message[]).catch((e) => {
        console.error("analyzeCommunicationStyle failed:", e);
        return null;
      }),
      extractThemes(simplifiedMessages as Message[]).catch((e) => {
        console.error("extractThemes failed:", e);
        return null;
      }),
    ]);

    // If a newer run started, ignore this one
    if (runId !== analyzeRunRef.current) return;

    // THEMES: only apply fallback if we currently have nothing
    if (themes && Array.isArray(themes) && themes.length > 0) {
      setKeyThemes(themes);
    } else {
      setKeyThemes((prev) =>
        prev && prev.length > 0
          ? prev
          : [
              "Anxiety management when starting new tasks",
              "Progress tracking and acknowledgment",
              "Time management and prioritization",
              "Stress reduction techniques",
            ]
      );
    }

    // COMM STYLE
    if (analysis) {
      setCommunicationStyle(analysis);
      // Optimistically update local profile
      setUserProfile((prev) => (prev ? { ...prev, commStyle: analysis } : prev));
      // Persist to DB (non-blocking)
      saveCommStyleToDB(analysis);
    } else {
      console.warn("No communication style produced");
      setCommAnalysisError("Could not generate communication style analysis");
    }
  } catch (err) {
    console.error("Error in analyzeConversation:", err);
    setCommAnalysisError("An unexpected error occurred");
  } finally {
    // If a newer run started, still flip the flag off for UX
    if (runId === analyzeRunRef.current) {
      setIsAnalyzingComm(false);
    } else {
      // Ensure the latest run controls the flag; no-op here
    }
  }
}


  // If still loading user data or session data, show skeleton
  if (
  !isLoaded ||
  isLoadingProfile ||
  isLoadingSession ||
  isLoadingSessionMessages
) {
  return <DashboardSkeleton />;
}


  if (!user) { // Router will redirect
    return null; 
  }

  const getGoalsFromProfile = (profile: UserProfile | null) => {
    if (!profile?.goals || typeof profile.goals !== "object") {
      return [];
    }

    const goalsData = profile.goals as {
      mental_health_goals?: MentalHealthGoal[];
    };
    if (!goalsData.mental_health_goals) {
      return [];
    }

    return goalsData.mental_health_goals.map((goal, index) => ({
      id: index + 1,
      title: goal.description,
      target: goal.timeframe,
      progress: goal.progress || calculateProgress(goal.timeframe),
      lastUpdated: goal.lastUpdated || new Date().toLocaleDateString(),
      completed: goal.completed || false,
      steps: goal.steps || [],
      calendarEventId: goal.calendarEventId,
      calendarEventLink: goal.calendarEventLink,
    }));
  };


  // Calculate progress based on timeframe
  const calculateProgress = (timeframe: string) => {
    try {
      const match = timeframe.match(/(\d+)\s+weeks?\s+from\s+(.+)/i);
      if (!match) return 0;

      const weeks = parseInt(match[1]);
      const startDate = new Date(match[2]);
      const endDate = new Date(
        startDate.getTime() + weeks * 7 * 24 * 60 * 60 * 1000
      );
      const now = new Date();

      if (now >= endDate) return 100;
      if (now <= startDate) return 0;

      const totalDuration = endDate.getTime() - startDate.getTime();
      const elapsed = now.getTime() - startDate.getTime();
      return Math.round((elapsed / totalDuration) * 100);
    } catch (error) {
      console.error("Error calculating progress:", error);
      return 0;
    }
  };

  // Replace mock goals with real goals from profile
  const goals = getGoalsFromProfile(userProfile);

  // Function to calculate overall goal progress based on actual goals
  const calculateOverallProgress = (goalsList: { progress: number }[]) => {
    if (!goalsList || goalsList.length === 0) {
      return 0; // No goals means 0% progress
    }

    // Calculate the average progress of all goals
    const totalProgress = goalsList.reduce(
      (sum, goal) => sum + goal.progress,
      0
    );
    const averageProgress = Math.round(totalProgress / goalsList.length);

    return averageProgress;
  };

  // Calculate emotional wellbeing score based on message sentiment (HOISTED)
function calculateEmotionalWellbeing(
  messages: { role: string; content: string; createdAt: string | Date }[]
): string | number {
  // Skip calculation during introduction phase
  if (currentPhase.phase === "introduction") {
    return "N/A"; // Not applicable during introduction
  }

  // Only analyze user messages
  const userMessages = messages.filter((msg) => msg.role === "user");

  if (userMessages.length === 0) {
    return 70; // Default score if no messages
  }

  const positiveWords = [
    "happy","good","great","excellent","better","improved","calm","relaxed",
    "confident","proud","accomplished","peaceful","joy","hopeful","progress",
    "motivated","excited","grateful","thanks","thankful","appreciate",
  ];

  const negativeWords = [
    "sad","bad","stressed","anxious","worried","overwhelmed","depressed",
    "tired","exhausted","frustrated","angry","upset","confused","fear",
    "afraid","struggling","difficult","hard","challenging","problem",
  ];

  // Analyze the most recent messages (up to 10) for sentiment
  const recentMessages = userMessages.slice(-10);
  let positiveScore = 0;
  let negativeScore = 0;

  recentMessages.forEach((msg) => {
    const content = msg.content.toLowerCase();

    positiveWords.forEach((word) => {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      const matches = content.match(regex);
      if (matches) positiveScore += matches.length;
    });

    negativeWords.forEach((word) => {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      const matches = content.match(regex);
      if (matches) negativeScore += matches.length;
    });
  });

  const totalMentions = positiveScore + negativeScore;
  if (totalMentions === 0) return 70; // Neutral default

  const positivePercentage = Math.round((positiveScore / totalMentions) * 100);

  // Constrain 40–95 to avoid extremes
  const adjustedScore = Math.min(95, Math.max(40, positivePercentage));

  return adjustedScore;
}
  
  
  const getDailyEmotionalWellbeing = (
  messages: { role: string; content: string; createdAt: string | Date }[],
  calculateFn: (
    messages: { role: string; content: string; createdAt: string | Date }[]
  ) => string | number
): { date: string; wellbeing: string | number }[] => {
  const messagesByDate: Record<
    string,
    { role: string; content: string; createdAt: string | Date }[]
  > = {};

  messages.forEach((msg) => {
    // Validate createdAt
    if (!msg.createdAt) return;
    const dateObj = new Date(msg.createdAt);
    if (isNaN(dateObj.getTime())) return; // skip invalid dates

    const dateKey = format(dateObj, "yyyy-MM-dd");

    if (!messagesByDate[dateKey]) {
      messagesByDate[dateKey] = [];
    }
    messagesByDate[dateKey].push({
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    });
  });
    console.log("Grouped messages by date:");
    Object.entries(messagesByDate).forEach(([date, msgs]) => {
      console.log(`\n${date}:`);
      msgs.forEach((msg, idx) => {
        console.log(`  ${idx + 1}. [${msg.role}] ${msg.content}`);
      });
    });

    const wellbeingByDate = Object.entries(messagesByDate).map(
      ([date, msgs]) => ({
        date,
        wellbeing: calculateFn(msgs),
      })
    );

    return wellbeingByDate;};

  // Calculate check-in consistency based purely on frequency/recency of user messages
  const calculateConsistency = () => {
    try {
      // Guard: no messages → neutral default
      if (!sessionMessages || sessionMessages.length === 0) {
        return 50;
      }

      // 1) Only consider USER messages with valid createdAt
      const userMsgs = sessionMessages
        .filter((m) => m.role === "user" && m.createdAt)
        .map((m) => {
          const d = new Date(m.createdAt as any);
          return Number.isNaN(d.getTime()) ? null : d;
        })
        .filter((d): d is Date => !!d);

      if (userMsgs.length === 0) return 50;

      // 2) Find most recent user message time
      const lastMsgDate = new Date(Math.max(...userMsgs.map((d) => d.getTime())));

      // 3) Compute recency in whole days
      const now = new Date();
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysSinceLast = Math.floor((now.getTime() - lastMsgDate.getTime()) / msPerDay);

      // 4) Build a set of active calendar days in the last 14 days with at least one user message
      const startWindow = new Date(now.getTime() - 14 * msPerDay);
      const activeDayKeys = new Set<string>();
      for (const d of userMsgs) {
        if (d >= startWindow && d <= now) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          activeDayKeys.add(key);
        }
      }
      const activeDaysLast14 = activeDayKeys.size; // 0–14

      
      const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      let streak = 0;
      const dayHasMsg = (offset: number) => {
        const dd = new Date(now);
        dd.setDate(now.getDate() - offset);
        return activeDayKeys.has(toKey(dd));
      };
      // Count consecutive days ending today (offset 0)
      while (dayHasMsg(streak)) streak++;

      // 6) Scoring rules (frequency-only):
      // Base score from recency
      let score =
        daysSinceLast <= 1 ? 80 :
        daysSinceLast <= 3 ? 70 :
        daysSinceLast <= 7 ? 60 :
        45; // >7 days

      // Additive bonus for overall cadence in last 14 days (0–14 → +0..+14)
      score += Math.min(activeDaysLast14, 14);

      // Small streak bonus (max +6 for a 6+ day streak)
      score += Math.min(streak, 6);

      // Clamp to [40, 95]
      score = Math.max(40, Math.min(95, score));

      return Math.round(score);
    } catch (e) {
      console.error("calculateConsistency (frequency-only) failed:", e);
      return 50;
    }
  };

  // Calculate progress metrics
  const overallProgress = calculateOverallProgress(goals); // Real calculation
  const emotionalWellbeing = calculateEmotionalWellbeing(sessionMessages); // Sentiment analysis
  const consistency = calculateConsistency(); // Check-in consistency
  console.log("Check-in Consistency Score:", consistency);
  console.log("User messages:", sessionMessages.filter((m) => m.role === "user").length);
  console.log("Session date:", latestSession?.createdAt);


  
  // Convert decimal values (0.5) to percentages (50) by multiplying by 100
  const personalityTraits = {
    openMindedness: userProfile?.openMindedness
      ? Math.round(userProfile.openMindedness * 100)
      : 60,
    conscientiousness: userProfile?.conscientiousness
      ? Math.round(userProfile.conscientiousness * 100)
      : 75,
    extraversion: userProfile?.extraversion
      ? Math.round(userProfile.extraversion * 100)
      : 45,
    agreeableness: userProfile?.agreeableness
      ? Math.round(userProfile.agreeableness * 100)
      : 80,
    neuroticism: userProfile?.neuroticism
      ? Math.round(userProfile.neuroticism * 100)
      : 30,
  };

  return (
    <>
    <TabSyncRefresh onRefresh={handleRefresh} minIntervalMs={30000} />
    <div className="container mx-auto px-4 py-6">
      {/* Onboarding Banner for First-Time Users */}
      {firstVisit && (
        <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-indigo-900">Welcome! Let’s get you started</h2>
              <p className="text-sm text-indigo-800/80 mt-1">
                Start a quick chat to set your first goal or do a values check‑in. Your dashboard will fill in as you go.
              </p>
            </div>
            <Link href="/app/chat" className="shrink-0">
              <Button className="bg-indigo-600 hover:bg-indigo-700">
                Go to Chat <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}
      {/* Header Section with Journey Progress */}
      <div className="mb-8 bg-gradient-to-r from-indigo-600 via-purple-600 to-purple-700 text-white rounded-xl p-6 shadow-lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
          <div>
            <h1 className="text-3xl font-bold">Your Wellbeing Journey</h1>
            <p className="text-indigo-100">Personal Dashboard</p>
          </div>
          <div className="mt-2 md:mt-0 text-right">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm">
              <Clock className="h-4 w-4 mr-2 text-indigo-200" />
              <p className="text-sm text-indigo-100">
                {currentDate || "Loading date..."}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Steps  */}
        {/* <div className="mt-8 mb-4">
          <div className="flex items-center justify-between gap-2 max-w-3xl mx-auto">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white shadow-md">
                <CheckCircle className="h-6 w-6" />
              </div>
              <p className="mt-2 text-sm font-medium">Introduction</p>
            </div>
            <div className="flex-1 h-1 bg-white/20 rounded-full">
              <div
                className="h-full bg-green-500 rounded-full"
                style={{
                  width:
                    currentPhase.progress >= 20
                      ? "100%"
                      : `${currentPhase.progress}%`,
                }}
              ></div>
            </div>

            <div className="flex flex-col items-center">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md ${
                  currentPhase.progress >= 60
                    ? "bg-green-500"
                    : currentPhase.phase === "exploration" ||
                      currentPhase.phase === "goal_setting"
                    ? "bg-purple-500"
                    : "bg-white/20"
                }`}
              >
                {currentPhase.progress >= 60 ? (
                  <CheckCircle className="h-6 w-6" />
                ) : currentPhase.phase === "exploration" ||
                  currentPhase.phase === "goal_setting" ? (
                  <div className="text-white font-bold">2</div>
                ) : (
                  <div className="text-white font-bold">2</div>
                )}
              </div>
              <p className="mt-2 text-sm font-medium">Goal Setting</p>
            </div>
            <div className="flex-1 h-1 bg-white/20 rounded-full">
              <div
                className="h-full bg-green-500 rounded-full"
                style={{
                  width:
                    currentPhase.progress >= 100
                      ? "100%"
                      : currentPhase.progress > 20
                      ? `${((currentPhase.progress - 20) * 100) / 40}%`
                      : "0%",
                }}
              ></div>
            </div>

            <div className="flex flex-col items-center">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md ${
                  currentPhase.progress >= 100
                    ? "bg-green-500"
                    : currentPhase.phase === "action_planning" ||
                      currentPhase.phase === "ongoing_conversation"
                    ? "bg-purple-500"
                    : "bg-white/20"
                }`}
              >
                {currentPhase.progress >= 100 ? (
                  <CheckCircle className="h-6 w-6" />
                ) : (
                  <div className="text-white font-bold">3</div>
                )}
              </div>
              <p className="mt-2 text-sm font-medium">Active Coaching</p>
            </div>
          </div>
        </div> */}

        {/* Current Phase Display */}
        {/* <div className="mt-6 bg-white/10 backdrop-blur-sm rounded-lg p-3 max-w-2xl mx-auto">
          <div className="flex items-start space-x-4">
            <div className="bg-white/20 p-2 rounded-full">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white">
                Current Phase:{" "}
                {currentPhase.phase === "ongoing_conversation"
                  ? "Action Planning"
                  : currentPhase.phase
                      .replace("_", " ")
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
              </h3>
              <p className="text-sm text-indigo-100">
                {firstVisit && "You're new here — tap Go to Chat above to begin your first conversation and set things up."}
                {!firstVisit && currentPhase.phase === "introduction" &&
                  "We're getting to know your needs and preferences."}
                {!firstVisit && (currentPhase.phase === "exploration" || currentPhase.phase === "goal_setting") &&
                  "We're exploring your challenges and setting goals."}
                {!firstVisit && (currentPhase.phase === "action_planning" || currentPhase.phase === "ongoing_conversation") &&
                  "You're working on implementing action steps toward your goals."}
              </p>
            </div>
          </div>
        </div> */}

        {/* Progress Steps  */}
<div className="mt-8 mb-4">
  <div className="flex items-center justify-between gap-2 max-w-xl mx-auto">
    <div className="flex flex-col items-center">
      <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white shadow-md">
        <CheckCircle className="h-6 w-6" />
      </div>
      <p className="mt-2 text-sm font-medium">Getting Started</p>
    </div>
    <div className="flex-1 h-1 bg-white/20 rounded-full">
      <div
        className="h-full bg-green-500 rounded-full"
        style={{
          width: currentPhase.progress >= 100 ? "100%" : "0%",
        }}
      />
    </div>
    <div className="flex flex-col items-center">
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md ${
          currentPhase.progress >= 100
            ? "bg-green-500"
            : currentPhase.phase === "action_planning" ||
              currentPhase.phase === "ongoing_conversation"
            ? "bg-purple-500"
            : "bg-white/20"
        }`}
      >
        {currentPhase.progress >= 100 ? (
          <CheckCircle className="h-6 w-6" />
        ) : (
          <div className="text-white font-bold">2</div>
        )}
      </div>
      <p className="mt-2 text-sm font-medium">Active Coaching</p>
    </div>
  </div>
</div>

{/* Current Phase Display */}
<div className="mt-6 bg-white/10 backdrop-blur-sm rounded-lg p-3 max-w-2xl mx-auto">
  <div className="flex items-start space-x-4">
    <div className="bg-white/20 p-2 rounded-full">
      <Target className="h-5 w-5 text-white" />
    </div>
    <div>
      <h3 className="font-semibold text-white">
        Current Phase:{" "}
        {currentPhase.phase === "action_planning" || currentPhase.phase === "ongoing_conversation"
          ? "Active Coaching"
          : "Getting Started"}
      </h3>
      <p className="text-sm text-indigo-100">
        {firstVisit && "You're new here — tap Go to Chat above to begin your first conversation and set things up."}
        {!firstVisit && currentPhase.phase === "introduction" &&
          "We're getting to know your needs and preferences."}
        {!firstVisit && (currentPhase.phase === "action_planning" || currentPhase.phase === "ongoing_conversation") &&
          "Come chat, set goals, update progress,or reflect anytime."}
      </p>
    </div>
  </div>
</div>

      </div>

      {/* Progress Overview */}
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <div className="w-1 h-6 bg-indigo-600 rounded-full mr-1"></div>
        Progress Overview
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="overflow-hidden transition-all hover:shadow-md border-t-4 border-t-indigo-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Target className="h-5 w-5 mr-2 text-indigo-500" />
              Overall Goal Progress
              <InfoPopover title="How Overall Goal Progress is Calculated">
                <p>
                  This metric represents the average progress across all your
                  mental health goals. It&apos;s calculated by:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Taking the progress percentage of each goal</li>
                  <li>Adding these percentages together</li>
                  <li>Dividing by the total number of goals</li>
                </ul>
                <p className="mt-2">
                  As you complete goals or make progress on individual goals,
                  this overall percentage will increase. Goals are marked
                  complete when they reach 100%.
                </p>
              </InfoPopover>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold mb-2">{overallProgress}%</div>
            <Progress value={overallProgress} className="h-3" />
          </CardContent>
        </Card>

        {/* <Card className="overflow-hidden transition-all hover:shadow-md border-t-4 border-t-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <User className="h-5 w-5 mr-2 text-green-500" />
              Emotional Well-being
              <InfoPopover title="How Emotional Well-being is Calculated">
                <p>
                  This score reflects your emotional state based on sentiment
                  analysis of your recent conversations. It&apos;s calculated
                  by:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>
                    Analyzing your most recent messages for positive and
                    negative words
                  </li>
                  <li>
                    Counting occurrences of words like &quot;happy,&quot;
                    &quot;stressed,&quot; &quot;grateful,&quot; etc.
                  </li>
                  <li>
                    Calculating the ratio of positive to total emotional
                    expressions
                  </li>
                  <li>Scaling the result to a score between 40-95</li>
                </ul>
                <p className="mt-2">
                  Higher scores indicate more positive emotional content in your
                  recent conversations. This metric is only available after the
                  introduction phase.
                </p>
              </InfoPopover>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold mb-2">
              {typeof emotionalWellbeing === "number"
                ? `${emotionalWellbeing}/100`
                : emotionalWellbeing}
            </div>
            {typeof emotionalWellbeing === "number" && (
              <Progress value={emotionalWellbeing} className="h-3" />
            )}
            {emotionalWellbeing === "N/A" && (
              <p className="text-sm text-muted-foreground">
                Available after introduction phase
              </p>
            )}
          </CardContent>
        </Card> */}

        <Card className="overflow-hidden transition-all hover:shadow-md border-t-4 border-t-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Clock className="h-5 w-5 mr-2 text-amber-500" />
              Check-in Consistency
              <InfoPopover title="How Check-in Consistency is Calculated">
                <p>
                  This metric measures how regularly you engage with your mental
                  health coach. It&apos;s calculated based on:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  {/* <li>
                    The total number of messages you&apos;ve sent (more messages
                    = higher base score)
                  </li> */}
                  <li>How recently you&apos;ve had a coaching session</li>
                  <li>
                    <span className="font-medium">Score adjustments:</span>
                    <ul className="list-disc pl-5 mt-1">
                      <li>+10% for sessions within the last day</li>
                      <li>-10% for no sessions in the past 3-7 days</li>
                      <li>-20% for no sessions in over a week</li>
                    </ul>
                  </li>
                </ul>
                <p className="mt-2">
                  Regular check-ins help maintain progress on your mental health
                  goals. A score of 75% or higher indicates strong engagement.
                </p>
              </InfoPopover>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold mb-2">{consistency}%</div>
            <Progress value={consistency} className="h-3" />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="mb-8">
        {/* <TabsList className="grid w-full grid-cols-3 mb-6 bg-muted/50 p-1 rounded-lg">
          <TabsTrigger
            value="overview"
            className="data-[state=active]:bg-background"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="goals"
            className="data-[state=active]:bg-background"
          >
            Goals
          </TabsTrigger>
          <TabsTrigger
            value="insights"
            className="data-[state=active]:bg-background"
          >
            Conversation Insights
          </TabsTrigger>
        </TabsList> */}

<TabsList
  className="grid w-full grid-cols-3 mb-8 md:mb-10 
             bg-indigo-50 
             rounded-xl h-14 items-center"
>
  <TabsTrigger
    value="overview"
    className="text-sm md:text-base px-4 py-3 rounded-lg font-medium transition-colors
               data-[state=active]:bg-indigo-500 data-[state=active]:text-white
               data-[state=active]:shadow-md"
  >
  Support Resources
  </TabsTrigger>
  <TabsTrigger
    value="goals"
    className="text-sm md:text-base px-4 py-3 rounded-lg font-medium transition-colors
               data-[state=active]:bg-indigo-500 data-[state=active]:text-white
               data-[state=active]:shadow-md"
  >
    Goals
  </TabsTrigger>
  <TabsTrigger
    value="insights"
    className="text-sm md:text-base px-4 py-3 rounded-lg font-medium transition-colors
               data-[state=active]:bg-indigo-500 data-[state=active]:text-white
               data-[state=active]:shadow-md"
  >
    Conversation Insights
  </TabsTrigger>
</TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
            <Card className="overflow-hidden border-muted/50">
              <CardHeader className="bg-muted/20">
                <CardTitle className="flex items-center space-x-2">
                  <BrainCircuit className="h-5 w-5 text-indigo-500" />
                  <span>Professional Resources</span>
                </CardTitle>
                <CardDescription>
                  Trusted support and self-help links (free, reputable)
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ul className="space-y-4">
                  <li className="p-4 border rounded-lg bg-emerald-50/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">Find a Helpline</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Global directory to reach crisis lines and emotional support in your country, 24/7 where available.
                        </p>
                      </div>
                                            <a
                        href="https://findahelpline.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                        aria-label="Open Find a Helpline"
                      >
                        <Button variant="outline" size="sm" className="inline-flex items-center">
                          Visit <ExternalLink className="ml-2 h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                                      </li>
                                    <li className="p-4 border rounded-lg bg-indigo-50/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">Wellbeing Resources On-Campus</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          A curated list of trusted tools, hotlines, and self-check guides you can turn to for extra support
                        </p>
                      </div>
                      <a
                        href="https://drive.google.com/file/d/1K9kxRhLe3HHbZKYXglKh6WX0mfeJOXoZ/view?usp=sharing"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                        aria-label="Wellbeing Resources"
                      >
                        <Button variant="outline" size="sm" className="inline-flex items-center">
                          Visit <ExternalLink className="ml-2 h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                  </li>
                                    <li className="p-4 border rounded-lg bg-blue-50/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">Books & Podcasts for Wellbeing (ACT)</p>
                        <p className="text-sm text-muted-foreground mt-1">
                         A curated collection of insightful books and podcasts to help you build resilience, manage stress, and explore practical strategies for mental health and personal growth.
                        </p>
                      </div>
                                            <a
                        href="https://drive.google.com/file/d/1gZl8n-MB_sTjCRPUjdBy5IsbEWn_Xel4/view?usp=sharing"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                        aria-label="Open The Happiness Trap"
                      >
                        <Button variant="outline" size="sm" className="inline-flex items-center">
                          Visit <ExternalLink className="ml-2 h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                                      </li>
                  <li className="p-4 border rounded-lg bg-amber-50/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">SMART Goal-Setting</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          A guide to setting SMART goals, helping you turn intentions into clear, actionable steps for success.
                        </p>
                      </div>
                                            <a
                        href="https://www.health.state.mn.us/communities/practice/resources/phqitoolbox/objectives.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                        aria-label="Open WHO Mental Health"
                      >
                        <Button variant="outline" size="sm" className="inline-flex items-center">
                          Visit <ExternalLink className="ml-2 h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                                      </li>
                </ul>
              </CardContent>
            </Card>

            {/* <Card className="overflow-hidden border-muted/50">
              <CardHeader className="bg-muted/20">
                <CardTitle className="flex items-center space-x-2">
                  <LineChartIcon className="h-5 w-5 text-indigo-500" />
                  <span>Emotional Well-being Trend</span>
                </CardTitle>
                <CardDescription>
                  Patterns in emotional expression across conversations
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[240px] px-2">
                {dailyWellbeing.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={dailyWellbeing}
                      margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" stroke="#9ca3af" />
                      <YAxis domain={[40, 100]} stroke="#9ca3af" />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="wellbeing"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                    <LineChartIcon className="h-16 w-16 mx-auto mb-2 text-indigo-200" />
                    <p className="font-medium text-muted-foreground">
                      Emotional Wellbeing Trend Chart
                    </p>
                    <p className="text-sm text-muted-foreground/70">
                      (Visualization will appear as more data is collected)
                    </p>
                  </div>
                )}
              </CardContent>
            </Card> */}
          </div>
        </TabsContent>

        {/* Goals Tab */}




<TabsContent value="goals">
  {(() => {
    // Helper to post new goal
    const createGoal = async (payload: {
      description: string;
      timeframe: string;
      steps: string[];
      measures?: string;
      obstacles?: string[];
    }) => {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create goal");
      return res.json().catch(() => ({}));
    };


const addToCalendar = async (goalIndex: number, preferredWindow: "morning"|"afternoon"|"evening"|"night" = "morning") => {
  const clientTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  try {
    const res = await fetch("/api/calendar/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalIndex,
        preferredWindow,           
        clientTimeZone,
        includeAllCalendars: true,  
        ignoreAllDayBusy: false,    
        lookaheadDays: 4,          
        // debug: true,            
      }),
    });

    const data = await res.json().catch(() => ({} as any));

    if (!res.ok) {
      if (data?.needsAuth) {
        alert("Please connect Google Calendar in Settings first.");
        return;
      }
      if (data?.needsReauth) {
        alert("Google token expired — please reconnect in Accounts > Preferences.");
        return;
      }
      if (res.status === 409) {
        const tz = data?.timeZone || clientTimeZone;
        const tried = Array.isArray(data?.windowsTried) && data.windowsTried.length
          ? `\nTried windows: ${data.windowsTried.join(", ")}`
          : "";
        alert(`No free 30-min slots found on midpoint or end days.\nTime zone: ${tz}${tried}`);
        return;
      }
      alert(data?.error || "Failed to add to calendar");
      return;
    }

    // SUCCESS
   
   
//     if (!res.ok) {
//   let data: any = null;
//   try {
//     data = await res.json();
//   } catch (_) {
//     /* ignore */
//   }

//   if (data?.needsAuth) {
//     toast({
//       title: "Connect Google Calendar",
//       description: "Please connect Google Calendar in Settings first.",
//       variant: "warning",
//     });
//     return;
//   }

//   if (data?.needsReauth) {
//     toast({
//       title: "Google needs re-auth",
//       description: "Your Google token expired — please reconnect in Settings.",
//       variant: "warning",
//     });
//     return;
//   }

//   if (res.status === 409) {
//     const tz = data?.timeZone || clientTimeZone;
//     const tried =
//       Array.isArray(data?.windowsTried) && data.windowsTried.length
//         ? `Tried windows: ${data.windowsTried.join(", ")}`
//         : undefined;

//     toast({
//       title: "No free 30-min slots found",
//       description: (
//         <>
//           <div>Time zone: {tz}</div>
//           {tried && <div>{tried}</div>}
//         </>
//       ),
//     });
//     return;
//   }

//   toast({
//     title: "Failed to add to calendar",
//     description: data?.error || "An unexpected error occurred.",
//     variant: "warning",
//   });
//   return;
// }
    
    const eventLink = data?.midEventLink || data?.finalEventLink;
    if (eventLink) {
      const newEvents = { ...goalCalendarEvents, [goalIndex]: eventLink };
      setGoalCalendarEvents(newEvents);
      localStorage.setItem("goalCalendarEvents", JSON.stringify(newEvents));
      window.open(eventLink, "_blank");
    } else {
      // Created but Google didn't return link (rare) — still refresh
      console.log("Created events:", data?.windowsUsed, "count:", data?.createdCount);
    }

    // await refreshUserProfile();
  } catch (err) {
    console.error("Add to calendar failed:", err);
    alert("Something went wrong adding to calendar.");
  }
};


    const activeGoals = goals.filter((g) => !g.completed);
    const completedGoals = goals.filter((g) => g.completed);

    return (
      <Tabs defaultValue="active" className="w-full">
        <div className="mb-4 flex items-center justify-between gap-3">
          <TabsList className="bg-muted/50 p-1 rounded-lg">
            <TabsTrigger value="active" className="data-[state=active]:bg-background">
              Active
            </TabsTrigger>
            <TabsTrigger value="completed" className="data-[state=active]:bg-background">
              Completed
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ACTIVE */}
        <TabsContent value="active">
          <Card className="overflow-hidden border-muted/50">
            <CardHeader className="bg-muted/20">
              <CardTitle className="flex items-center space-x-2">
                <Target className="h-5 w-5 text-indigo-500" />
                <span>Active Goals</span>
              </CardTitle>
              <CardDescription>Track your progress on current wellbeing goals</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-8">
                {activeGoals.length > 0 ? (
                  activeGoals.map((goal) => (
                    <div key={goal.id} className="border-b pb-4 last:border-0 last:pb-0 relative">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
                        <h3 className="font-medium flex items-center">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2 bg-indigo-100 text-indigo-700">
                            {goal.id}
                          </span>
                          {goal.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm px-2 py-0.5 rounded-full ${
                              goal.progress > 66
                                ? "bg-green-100 text-green-800"
                                : goal.progress > 33
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-200 text-slate-800"
                            }`}
                          >
                            {`${goal.progress}% Complete`}
                          </span>

{/* Calendar toggle: if we already have an event, show link. Otherwise, allow adding. */}
{/* <GoalCalendarToggle
  goal={goal}
  goalIndex={goal.id - 1}
  goalCalendarEvents={goalCalendarEvents}
  setGoalCalendarEvents={setGoalCalendarEvents}
  addToCalendar={addToCalendar}
/> */}

                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground mb-2">Target: {goal.target}</p>
                      <Progress value={goal.progress} className="h-2 mb-2" />

                      {goal.steps && goal.steps.length > 0 && (
                        <div className="mt-3 mb-2">
                          <p className="text-sm font-medium mb-1">Steps:</p>
                          <ul className="list-none space-y-1 text-sm text-muted-foreground">
                            {goal.steps.map((step, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <Circle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                <span>{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        Last updated: {goal.lastUpdated}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium mb-1">No Active Goals</p>
                    <p className="text-sm mb-4 text-muted-foreground">Start a conversation to set your first SMART goal.</p>
                    <Link href="/app/chat">
                      <Button variant="outline" size="sm">
                        Open Chat <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </CardContent>
            {activeGoals.length > 0 && (
              <CardFooter className="bg-muted/10 border-t">
                <Link href="/app/chat" className="w-full">
                  <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                    Continue Working on Goals <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        {/* COMPLETED */}
        <TabsContent value="completed">
          <Card className="overflow-hidden border-muted/50">
            <CardHeader className="bg-muted/20">
              <CardTitle className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span>Completed Goals</span>
              </CardTitle>
              <CardDescription>A record of goals you&apos;ve finished — nice work!</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-8">
                {completedGoals.length > 0 ? (
                  completedGoals.map((goal) => (
                    <div key={goal.id} className="bg-green-50/50 rounded-lg p-4 border border-green-100">
                      <div className="flex justify-between mb-2">
                        <h3 className="font-medium flex items-center">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2 bg-green-100 text-green-700">
                            <CheckCircle className="h-3 w-3" />
                          </span>
                          {goal.title}
                        </h3>
                        <span className="text-sm px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                          Completed
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">Target: {goal.target}</p>
                      <Progress value={100} className="h-2 mb-2 bg-green-100" indicatorClassName="bg-green-500" />
                      {goal.steps && goal.steps.length > 0 && (
                        <div className="mt-3 mb-2">
                          <p className="text-sm font-medium mb-1">Steps:</p>
                          <ul className="list-disc list-inside text-sm text-muted-foreground">
                            {goal.steps.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        Last updated: {goal.lastUpdated}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium mb-1">No Completed Goals Yet</p>
                    <p className="text-sm mb-4">Finish an active goal to see it here.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    );
  })()}
</TabsContent>

        {/* Personality Profile Tab */}
        <TabsContent value="personality">
          <Card className="overflow-hidden border-muted/50">
            <CardHeader className="bg-muted/20">
              <CardTitle className="flex items-center space-x-2">
                <BrainCircuit className="h-5 w-5 text-indigo-500" />
                <span>Personality Radar Chart</span>
              </CardTitle>
              <CardDescription>
                Visual representation of your personality dimensions
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <BrainCircuit className="h-16 w-16 mx-auto mb-2 text-indigo-200" />
                <p className="font-medium text-muted-foreground">
                  Personality Radar Chart
                </p>
                <p className="text-sm text-muted-foreground/70">
                  (Will be generated from your interactions over time)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conversation Insights Tab */}
        <TabsContent value="insights">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="overflow-hidden border-muted/50">
              <CardHeader className="bg-muted/20">
                <CardTitle className="flex items-center space-x-2">
                  <MessageCircle className="h-5 w-5 text-black-500" />
                  <span>Conversation Analysis</span>
                </CardTitle>
                <CardDescription>
                  Insights derived from your coaching sessions
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 h-[500px]">
                {userProfile && userProfile.openMindedness !== null ? (
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg bg-muted/20">
                      <h3 className="font-medium mb-2 flex items-center">
                        <div className="w-5 h-5 rounded-full text-black-700 flex items-center justify-center text-xs mr-2">
                          <Target className="h-5 w-5" />
                        </div>
                        Key Themes
                      </h3>
                      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                        {keyThemes.map((theme, index) => (
                          <li key={index}>{theme}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-4 border rounded-lg bg-muted/20">
                      <h3 className="font-medium mb-2 flex items-center">
                        <div className="w-5 h-5 rounded-full text-black-700 flex items-center justify-center text-xs mr-2">
                          <MessageCircle className="h-5 w-5" />
                        </div>
                        Communication Style
                        {isAnalyzingComm && (
                          <span className="ml-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                        )}
                      </h3>
                      {commAnalysisError ? (
                        <div className="text-center py-2">
                          <p className="text-sm text-red-500 mb-2">
                            {commAnalysisError}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => analyzeConversation(sessionMessages)}
                            disabled={isAnalyzingComm}
                          >
                            Retry Analysis
                          </Button>
                        </div>
                      ) : communicationStyle ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Tone:</span>
                            <span className="text-sm font-medium capitalize px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">
                              {communicationStyle.tone}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Response Length:</span>
                            <span className="text-sm font-medium capitalize px-2 py-0.5 bg-green-100 text-green-800 rounded-full">
                              {communicationStyle.length}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Emotional Style:</span>
                            <span className="text-sm font-medium capitalize px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">
                              {communicationStyle.emotional_style}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Thinking Style:</span>
                            <span className="text-sm font-medium capitalize px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                              {communicationStyle.thinking_style}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-3">
                            You communicate in a {communicationStyle.tone}{" "}
                            manner with {communicationStyle.length} responses.
                            Your style tends to be{" "}
                            {communicationStyle.emotional_style} with a{" "}
                            {communicationStyle.thinking_style} approach to
                            problems.
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Analysis in progress. Continue conversing with your
                          coach to receive more detailed insights about your
                          communication patterns.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium mb-1">
                      No Analysis Available Yet
                    </p>
                    <p className="text-sm mb-4">
                      As you interact with your coach, we&apos;ll analyze your
                      communication patterns and provide insights about your
                      conversation style.
                    </p>
                    <Link href="/app/chat">
                      <Button variant="outline">
                        Talk to Your Coach{" "}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* <Card className="overflow-hidden border-muted/50">
              <CardHeader className="bg-muted/20">
                <CardTitle className="flex items-center space-x-2">
                  <MessageCircle className="h-5 w-5 text-indigo-500" />
                  <span>Recent Session Highlights</span>
                </CardTitle>
                <CardDescription>
                  Key points from your recent coaching sessions
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-[350px] pt-6">
                {sessionHighlights.length > 0 ? (
                  <ScrollArea className="h-[350px] pr-4">
                    <div className="space-y-4">
                      {sessionHighlights.map((highlight, index) => {
                        
                        const cleanedContent = fixIsContinuedJSON(
                          cleanMessageContent(highlight.content)
                        );

                        return (
                          <div
                            key={index}
                            className="p-4 bg-muted/20 rounded-lg border border-muted"
                          >
                            <div className="flex items-center mb-2">
                              <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs mr-2">
                                <MessageCircle className="h-3 w-3" />
                              </div>
                              <p className="text-sm font-medium">
                                {highlight.rawDate}
                              </p>
                            </div>
                            <p className="text-sm text-muted-foreground pl-8">
                              {cleanedContent}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium mb-1">
                      No Conversation Insights Yet
                    </p>
                    <p className="text-sm mb-4">
                      Continue chatting with your coach to generate insights
                      about your conversations.
                    </p>
                    <Link href="/app/chat">
                      <Button variant="outline">
                        Start Chatting <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card> */}
<Card className="overflow-hidden border-muted/50">
  <CardHeader className="bg-muted/20">
    <CardTitle className="flex items-center space-x-2">
      <Target className="h-5 w-5 text-black-500" />
      <span>Values Alignment (BEVS)</span>
      <InfoPopover title="What is Values Alignment (BEVS)?">
  <div className="space-y-3 text-sm">
    <p>
      Bull's Eye Value Survey (BEVS) checks how closely your day-to-day actions match the values that
      matter to you. Scores are from 1 to 7 across four areas.
    </p>

    <ul className="list-disc pl-5 space-y-2">
      <li>
        <span className="font-semibold">Domains:</span> Work/Studies,
        Relationships, Personal Growth/Health, Leisure
      </li>
      <li>
        <span className="font-semibold">Strength:</span> highest scoring domain
        where you are already aligned
      </li>
      <li>
        <span className="font-semibold">Suggested Focus:</span> lowest
        non-zero domain to bring more attention to
      </li>
      <li>
        <span className="font-semibold">Scale:</span> 1 = far from values, 7 =
        very close
      </li>
    </ul>

    <p>
      <span className="font-semibold">How it helps:</span> pick one focus area
      for weekly goals, plan small actions that fit your values, and watch the
      radar fill out over time.
    </p>
  </div>
</InfoPopover>
    </CardTitle>
    <CardDescription>
      Your values in action across the areas that matter most (1 = far · 7 = very close)
    </CardDescription>
  </CardHeader>
  <CardContent className="pt-6">
    {(() => {
      const scores = getLatestBevsScores(userProfile as any);
      const hasScores = Array.isArray(scores) && scores.some(s => Number(s.score) > 0);
      const lowest = getLowestBevsDomain(scores);
      const highest = getHighestBevsDomain(scores);

      return (
        <>
                   <div className="mb-2 flex items-start justify-between">
       <div className="text-sm text-muted-foreground">
        {userProfile?.bevs?.completedAt ? (
          <>Completed: {formatBevsCompletedDate(userProfile) || "—"}</>
        ) : userProfile?.bevs?.startedAt ? (
          <>In progress since {new Date(userProfile.bevs.startedAt).toLocaleDateString()}</>
        ) : null}
      </div>
           <div className="flex flex-col items-end space-y-1">
             {highest && hasScores && (
               <span
                 className="inline-block max-w-[220px] text-right text-xs rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800"
                 title="Strength shows your highest scoring domain — something already aligned with your values."
               >
                 Strength: {highest}
               </span>
             )}
             {lowest && hasScores ? (
               <span className="inline-block max-w-[220px] text-right text-xs rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">
                 Suggested Focus: {lowest}
               </span>
             ) : null}
           </div>
         </div>

          <BevsDartboard scores={scores} userProfile={userProfile}/>
          
          {!hasScores && (
            <div className="text-[11px] text-muted-foreground mt-2">
              Start your first BEVS check-in from the chat to populate this chart.
            </div>
          )}
        </>
      );
    })()}
  </CardContent>
</Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* cta */}
      <div className="mt-8 flex justify-center">
        <Link href="/app/chat">
          <Button
            size="lg"
            className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-md"
          >
            Continue Your Coaching Session <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>


      {/* Floating Help Button (fixed to viewport) */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setOpenHelp(true)}
          className="h-12 w-12 rounded-full p-0 shadow-lg
                     bg-indigo-600 hover:bg-indigo-700 text-white
                     transition-transform active:scale-95"
          aria-label="Open help"
        >
          <CircleHelp className="h-5 w-5" />
        </Button>
      </div>

      {/* Help Dialog (same UI as WelcomeDialog sibling) */}
      <GettingStartedDialog
        open={openHelp}
        onOpenChange={setOpenHelp}
      />
    </>
  );

}


type GoalLike = {
  id: number;
  calendarEventLink?: string | null;
  calendarCheckins?: Array<{ link?: string | null }>;
};

function base64UrlDecode(input: string) {
  const pad = (s: string) => s + "===".slice((s.length + 3) % 4);
  const b64 = pad(input.replace(/-/g, "+").replace(/_/g, "/"));
  try { return atob(b64); } catch { return ""; }
}
function extractEventIdFromGCalLink(link?: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    const eid = url.searchParams.get("eid");
    if (!eid) return null;
    const decoded = base64UrlDecode(eid); // "eventId calendarId"
    const [eventId] = decoded.split(" ");
    return eventId || null;
  } catch { return null; }
}

// export function GoalCalendarToggle({
//   goal,
//   goalIndex,
//   goalCalendarEvents,               
//   setGoalCalendarEvents,             
//   addToCalendar,                     
// }: {
//   goal: GoalLike;
//   goalIndex: number;
//   goalCalendarEvents: Record<number, string>;
//   setGoalCalendarEvents: React.Dispatch<
//     React.SetStateAction<Record<number, string>>
//   >;
//   addToCalendar: (
//     idx: number
//   ) => Promise<{ link?: string; eventId?: string } | void> | { link?: string; eventId?: string } | void;
// }) {

//   const localEventLink = useMemo(() => {
//     return (
//       goalCalendarEvents[goalIndex] ??
//       (Array.isArray(goal.calendarCheckins) ? (goal.calendarCheckins[0]?.link ?? null) : null) ??
//       (goal.calendarEventLink ?? null)
//     );
//   }, [goalCalendarEvents, goalIndex, goal.calendarCheckins, goal.calendarEventLink]);

//   const derivedId = useMemo(() => extractEventIdFromGCalLink(localEventLink), [localEventLink]);

//   // null = unknown, true = exists, false = missing
//   const [exists, setExists] = useState<boolean | null>(null);

//   async function validateById(id: string) {
//     try {
//       const res = await fetch("/api/calendar/validate", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ eventId: id, goalIndex }),
//       });
//       const data = await res.json();
//       const alive = !!(res.ok && data?.exists);
//       setExists(alive);
//       if (!alive) {
        
//         setGoalCalendarEvents((prev) => {
//           const next = { ...prev };
//           delete next[goalIndex];
//           return next;
//         });
//       }
//       return alive;
//     } catch {
//       setExists(false);
//       return false;
//     }
//   }


//   useEffect(() => {
//     if (!derivedId) {
//       setExists(false);
//       return;
//     }
//     setExists(null);
//     validateById(derivedId);
    
//   }, [derivedId, goalIndex]);

//   async function handleAddClick() {
//     const result = await addToCalendar(goalIndex);
//     const returnedLink = (result as any)?.link as string | undefined;
//     const returnedId = (result as any)?.eventId as string | undefined;

//     //
//     if (returnedLink) {
//       setGoalCalendarEvents((prev) => ({ ...prev, [goalIndex]: returnedLink }));
//     }

//     // 
//     const linkToCheck = returnedLink ?? goalCalendarEvents[goalIndex] ?? localEventLink ?? null;
//     const idToCheck = returnedId ?? extractEventIdFromGCalLink(linkToCheck);
//     if (idToCheck && linkToCheck) {
//       setExists(true);
//       const ok = await validateById(idToCheck);
//       if (!ok) setExists(false);
//     } else {
//       setExists(false);
//     }
//   }

//   async function handleViewClick() {
//     if (!localEventLink) { setExists(false); return; }
//     const id = derivedId;
//     if (!id) { setExists(false); return; }
//     const ok = await validateById(id);
//     if (ok) window.open(localEventLink, "_blank");
//   }

//   return exists ? (
//     <Button size="sm" variant="outline" onClick={handleViewClick}>
//       <CalendarDays className="h-4 w-4 mr-1" />
//       View in Calendar
//     </Button>
//   ) : (
//     <Button size="sm" variant="outline" onClick={handleAddClick}>
//       Add to Calendar
//     </Button>
//   );
// }
