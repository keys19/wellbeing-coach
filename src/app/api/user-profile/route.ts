import { auth } from "@clerk/nextjs/server"
import { prisma, withRetry } from "@/lib/db/prisma"

import crypto from "node:crypto";

// --- Privacy helpers (fast, low-risk) ---
const PSEUDONYM_KEY = process.env.USER_PSEUDONYM_KEY || "rotate-me";

function hmacToken(s: unknown): string | null {
  const v = String(s ?? "").trim().toLowerCase();
  if (!v) return null;
  return crypto.createHmac("sha256", PSEUDONYM_KEY).update(v).digest("base64url");
}

function bucketCollegeYear(y: unknown): string {
  const n = Number(y);
  if (!Number.isFinite(n)) return "unknown";
  if (n <= 1) return "1";
  if (n === 2) return "2";
  if (n === 3) return "3";
  return "4+";
}

const ALLOWED_GENDERS = new Set(["female", "male", "nonbinary", "unspecified"]);
function normalizeGender(g: unknown): string {
  const v = String(g || "").toLowerCase();
  return ALLOWED_GENDERS.has(v) ? v : "unspecified";
}

// function toSafeProfile(p: any) {
//   if (!p) return null;
  
  
//   // Helper function to handle MongoDB NumberInt format
//   const parseProgress = (progress) => {
//     if (typeof progress === 'object' && progress.$numberInt !== undefined) {
//       return parseInt(progress.$numberInt);
//     }
//     return typeof progress === 'number' ? progress : 0;
//   };

  

//   // Process goals to handle MongoDB NumberInt format
//   const processedGoals = p.goals ? {
//     ...p.goals,
//     mental_health_goals: p.goals.mental_health_goals?.map(goal => ({
//       ...goal,
//       progress: parseProgress(goal.progress)
//     })) || []
//   } : null;

//   const collegeHash = p.collegeHash ?? hmacToken(p.college);
  
//   return {
//     id: p.id,
//     userId: p.userId,
//     gender: normalizeGender(p.gender),
//     collegeHash: collegeHash,
//     collegeYear: typeof p.collegeYear === "string" ? p.collegeYear : bucketCollegeYear(p.collegeYear),
//     major: p.major,
//     age: p.age,
//     openMindedness: p.openMindedness,
//     conscientiousness: p.conscientiousness,
//     extraversion: p.extraversion,
//     agreeableness: p.agreeableness,
//     neuroticism: p.neuroticism,
//     emotionalAwareness: p.emotionalAwareness,
//     copingStrategies: p.copingStrategies,
//     motivationType: p.motivationType,
//     challenges: p.challenges,
//     goals: processedGoals,
//     // commStyle: p.commStyle,
//     // feedback: p.feedback,
//     bevs: processedBevs,
//     hideWelcomeDialog: p.hideWelcomeDialog,
//     emailFrequency: p.emailFrequency,
//     calendarPreferredWindow: p.calendarPreferredWindow,
//     timeZone: p.timeZone,
//     createdAt: p.createdAt,
//     updatedAt: p.updatedAt,
//     // Still intentionally omit: name, college (raw value), etc.
//   };
// }

function toSafeProfile(p: any) {
  if (!p) return null;
  
  // Helper function to handle MongoDB NumberInt format
  const parseProgress = (progress) => {
    if (typeof progress === 'object' && progress.$numberInt !== undefined) {
      return parseInt(progress.$numberInt);
    }
    return typeof progress === 'number' ? progress : 0;
  };
//   const parseProgress = (progress: number | { $numberInt: string } | unknown): number => {
//   if (
//     typeof progress === "object" &&
//     progress !== null &&
//     "$numberInt" in progress
//   ) {
//     return Number((progress as { $numberInt: string }).$numberInt);
//   }

//   return typeof progress === "number" ? progress : 0;
// };


  // Helper function to handle MongoDB NumberInt in BEVS scores
  const processBEVSScores = (scores) => {
    if (!scores || typeof scores !== 'object') return scores;
    
    // const processed = {};
    const processed: Record<PropertyKey, unknown> = {};
    for (const [key, value] of Object.entries(scores)) {
      if (typeof value === 'object' && value !== null && '$numberInt' in value) {
        // processed[key] = parseInt(value.$numberInt);
        processed[key] = parseInt((value as { $numberInt: string }).$numberInt, 10);
      } else {
        processed[key] = value;
      }
    }
    return processed;
  };

  // Process BEVS data to handle MongoDB NumberInt format
  const processedBevs = p.bevs ? {
    ...p.bevs,
    assessments: p.bevs.assessments?.map((assessment: { scores: unknown; [key: string]: unknown }) => ({
    // assessments: p.bevs.assessments?.map(assessment => ({
      ...assessment,
      scores: processBEVSScores(assessment.scores)
    })) || []
  } : null;

  // Process goals to handle MongoDB NumberInt format
  const processedGoals = p.goals ? {
    ...p.goals,
    mental_health_goals: p.goals.mental_health_goals?.map(goal => ({
      ...goal,
      progress: parseProgress(goal.progress)
    })) || []
  } : null;

  const collegeHash = p.collegeHash ?? hmacToken(p.college);
  
  return {
    id: p.id,
    userId: p.userId,
    gender: normalizeGender(p.gender),
    collegeHash: collegeHash,
    collegeYear: typeof p.collegeYear === "string" ? p.collegeYear : bucketCollegeYear(p.collegeYear),
    major: p.major,
    age: p.age ?? null,
    openMindedness: p.openMindedness,
    conscientiousness: p.conscientiousness,
    extraversion: p.extraversion,
    agreeableness: p.agreeableness,
    neuroticism: p.neuroticism,
    emotionalAwareness: p.emotionalAwareness,
    copingStrategies: p.copingStrategies,
    motivationType: p.motivationType,
    challenges: p.challenges,
    goals: processedGoals,
    bevs: processedBevs, 
    commStyle: p.commStyle,
    feedback: p.feedback,
    hideWelcomeDialog: p.hideWelcomeDialog,
    emailFrequency: p.emailFrequency,
    calendarPreferredWindow: p.calendarPreferredWindow,
    timeZone: p.timeZone,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// export async function GET() {
//     try {
//         // Get the authenticated user from Clerk
//         const { userId } = await auth()

//         if (!userId) {
//             return new Response(JSON.stringify({ error: "Unauthorized" }), {
//                 status: 401,
//                 headers: { "Content-Type": "application/json" },
//             })
//         }

//         try {
//             // Ensure database connection is established
//             await prisma.$connect();

//             console.log(`Fetching user profile for user ${userId}`);

//             // Get user profile with better error handling
//             try {
//                 const userProfile = await withRetry(() =>
//                     prisma.userProfile.findUnique({
//                         where: { userId },
//                     })
//                 );

//                 console.log("UserProfile query result:", userProfile ? "found" : "not found");

//                 const safe = toSafeProfile(userProfile);
//                 return new Response(JSON.stringify({ profile: safe }), {
//                     status: 200,
//                     headers: {
//                         "Content-Type": "application/json",
//                         "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
//                     },
//                 });
//             } catch (queryError) {
//                 console.error(`Error in userProfile.findUnique:`, queryError);
//                 console.log("Query params:", { userId });

//                 // Try findFirst as a fallback if findUnique fails
//                 try {
//                     console.log("Attempting fallback with findFirst query");
//                     const userProfileAlt = await withRetry(() =>
//                         prisma.userProfile.findFirst({
//                             where: { userId },
//                         })
//                     );

//                     const safeAlt = toSafeProfile(userProfileAlt);
//                     return new Response(JSON.stringify({ profile: safeAlt }), {
//                         status: 200,
//                         headers: { "Content-Type": "application/json" },
//                     });
//                 } catch (fallbackError) {
//                     console.error("Fallback query also failed:", fallbackError);
//                     throw fallbackError; // Propagate to outer catch block
//                 }
//             }
//         } catch (dbError) {
//             // Log the specific database error
//             const errorMessage = dbError instanceof Error ? dbError.message : "Unknown database error"
//             console.error(`Database error in user-profile API: ${errorMessage}`)

//             // Return empty profile but with success status to avoid breaking UI
//             return new Response(JSON.stringify({
//                 profile: null,
//                 dbError: true,
//                 message: "Database connection issue, please try again later"
//             }), {
//                 status: 200,
//                 headers: { "Content-Type": "application/json" },
//             })
//         }
//     } catch (error) {
//         // Safe error logging for non-DB errors
//         const errorMessage = error instanceof Error ? error.message : "Unknown error"
//         console.error("Error fetching user profile:", errorMessage)

//         return new Response(JSON.stringify({
//             error: "Internal server error",
//             profile: null
//         }), {
//             status: 500,
//             headers: { "Content-Type": "application/json" },
//         })
//     }
// }

export async function GET() {
    try {
        // Get the authenticated user from Clerk
        const { userId } = await auth()

        if (!userId) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            })
        }

        try {
            // Ensure database connection is established
            await prisma.$connect();

            console.log(`Fetching user profile for user ${userId}`);

            // Get user profile with better error handling
            try {
                const userProfile = await withRetry(() =>
                    prisma.userProfile.findUnique({
                        where: { userId },
                    })
                );

                console.log("UserProfile query result:", userProfile ? "found" : "not found");
                
                // ADD THIS DEBUGGING
                

                const safe = toSafeProfile(userProfile);
                
                // ADD THIS DEBUGGING
                console.log("Safe profile bevs field:", safe?.bevs);
                console.log("Safe profile keys:", safe ? Object.keys(safe) : "null");

                return new Response(JSON.stringify({ profile: safe }), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
                    },
                });
            } catch (queryError) {
                console.error(`Error in userProfile.findUnique:`, queryError);
                console.log("Query params:", { userId });

                // Try findFirst as a fallback if findUnique fails
                try {
                    console.log("Attempting fallback with findFirst query");
                    const userProfileAlt = await withRetry(() =>
                        prisma.userProfile.findFirst({
                            where: { userId },
                        })
                    );

          
                    if (userProfileAlt) {
                        console.log("Fallback raw userProfile bevs field:", userProfileAlt.bevs);
                    }

                    const safeAlt = toSafeProfile(userProfileAlt);
                    console.log("Fallback safe profile bevs field:", safeAlt?.bevs);

                    return new Response(JSON.stringify({ profile: safeAlt }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                } catch (fallbackError) {
                    console.error("Fallback query also failed:", fallbackError);
                    throw fallbackError; // Propagate to outer catch block
                }
            }
        } catch (dbError) {
            // Log the specific database error
            const errorMessage = dbError instanceof Error ? dbError.message : "Unknown database error"
            console.error(`Database error in user-profile API: ${errorMessage}`)

            // Return empty profile but with success status to avoid breaking UI
            return new Response(JSON.stringify({
                profile: null,
                dbError: true,
                message: "Database connection issue, please try again later"
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        }
    } catch (error) {
        // Safe error logging for non-DB errors
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error("Error fetching user profile:", errorMessage)

        return new Response(JSON.stringify({
            error: "Internal server error",
            profile: null
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        })
    }
}


export async function PUT(req: Request) {
  try {
    // If you use Clerk auth, you can enable this:
    // const { userId: authedUserId } = auth();
    // const userIdFromAuth = authedUserId ?? null;

    const body = await req.json().catch(() => ({}));
    const { userId, update } = body || {};

    // Choose the user id source (auth > body). If you use auth, prefer that.
    const effectiveUserId = /* userIdFromAuth || */ userId;
    if (!effectiveUserId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!update || typeof update !== "object") {
      return new Response(JSON.stringify({ error: "Missing update payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Allowlist fields that can be updated through this route
    const allowed: Record<string, any> = {};
    if ("commStyle" in update) allowed.commStyle = update.commStyle;
    if ("feedback" in update) allowed.feedback = update.feedback;
    if ("goals" in update) allowed.goals = update.goals;
    if ("bevs" in update) allowed.bevs = update.bevs;

    if (Object.keys(allowed).length === 0) {
      return new Response(JSON.stringify({ error: "No allowed fields to update" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const updated = await prisma.userProfile.update({
      where: { userId: effectiveUserId },
      data: allowed,
    });

    return new Response(
      JSON.stringify({ profile: toSafeProfile(updated) }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[PUT /api/user-profile] error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}