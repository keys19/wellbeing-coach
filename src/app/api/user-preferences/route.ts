// import type { NextRequest } from "next/server"
// import { auth } from "@clerk/nextjs/server"
// import { prisma, withRetry } from "@/lib/db/prisma"
// import type { EmailFrequency } from "@/lib/email/emailService"

// export async function GET() {
//     try {
//         // Get the authenticated user from Clerk
//         const { userId } = await auth()

//         if (!userId) {
//             return new Response(JSON.stringify({ error: "Unauthorized" }), {
//                 status: 401,
//                 headers: {
//                     "Content-Type": "application/json",
//                     "Cache-Control": "no-store, no-cache, must-revalidate"
//                 },
//             })
//         }

//         // Fetch user preferences
//         const userProfile = await withRetry(() =>
//             prisma.userProfile.findUnique({
//                 where: { userId },
//             }),
//         )

//         if (!userProfile) {
//             return new Response(JSON.stringify({
//                 hideWelcomeDialog: false,
//                 emailFrequency: "weekly"
//             }), {
//                 status: 200,
//                 headers: {
//                     "Content-Type": "application/json",
//                     "Cache-Control": "no-store, no-cache, must-revalidate"
//                 },
//             })
//         }

//         return new Response(JSON.stringify({
//             hideWelcomeDialog: userProfile.hideWelcomeDialog,
//             emailFrequency: userProfile.emailFrequency || "weekly"
//         }), {
//             status: 200,
//             headers: {
//                 "Content-Type": "application/json",
//                 "Cache-Control": "no-store, no-cache, must-revalidate"
//             },
//         })
//     } catch (error) {
//         // Safe error logging
//         const errorMessage = error instanceof Error ? error.message : "Unknown error"
//         console.error("Error retrieving user preferences:", errorMessage)

//         return new Response(JSON.stringify({
//             error: "Internal server error",
//             details: errorMessage
//         }), {
//             status: 500,
//             headers: {
//                 "Content-Type": "application/json",
//                 "Cache-Control": "no-store, no-cache, must-revalidate"
//             },
//         })
//     }
// }

// export async function POST(req: NextRequest) {
//     try {
//         // Get the authenticated user from Clerk
//         const { userId } = await auth()

//         if (!userId) {
//             return new Response(JSON.stringify({ error: "Unauthorized" }), {
//                 status: 401,
//                 headers: {
//                     "Content-Type": "application/json",
//                     "Cache-Control": "no-store, no-cache, must-revalidate"
//                 },
//             })
//         }

//         const { hideWelcomeDialog, emailFrequency } = await req.json() as {
//             hideWelcomeDialog?: boolean;
//             emailFrequency?: EmailFrequency;
//         }

//         // Validate emailFrequency if provided
//         if (emailFrequency && !["daily", "biweekly", "weekly", "monthly"].includes(emailFrequency)) {
//             return new Response(JSON.stringify({
//                 error: "Invalid email frequency. Choose from: daily, biweekly, weekly, monthly"
//             }), {
//                 status: 400,
//                 headers: {
//                     "Content-Type": "application/json",
//                     "Cache-Control": "no-store, no-cache, must-revalidate"
//                 },
//             })
//         }

//         // Check if user profile exists
//         const userProfile = await withRetry(() =>
//             prisma.userProfile.findUnique({
//                 where: { userId },
//             }),
//         )

//         if (userProfile) {
//             // Update existing profile
//             await withRetry(() =>
//                 prisma.userProfile.update({
//                     where: { userId },
//                     data: {
//                         hideWelcomeDialog: hideWelcomeDialog !== undefined ? hideWelcomeDialog : userProfile.hideWelcomeDialog,
//                         emailFrequency: emailFrequency !== undefined ? emailFrequency : userProfile.emailFrequency,
//                     },
//                 }),
//             )
//         } else {
//             // Create user if it doesn't exist
//             const user = await withRetry(() =>
//                 prisma.user.findUnique({
//                     where: { id: userId },
//                 }),
//             )

//             if (!user) {
//                 try {
//                     await withRetry(() =>
//                         prisma.user.create({
//                             data: {
//                                 id: userId,
//                             },
//                         }),
//                     )
//                 } catch (error) {
//                     console.error("Error creating user:", error)
//                     // Continue anyway - the user might already exist with a different ID
//                 }
//             }

//             // Create new profile
//             await withRetry(() =>
//                 prisma.userProfile.create({
//                     data: {
//                         userId,
//                         hideWelcomeDialog: hideWelcomeDialog !== undefined ? hideWelcomeDialog : false,
//                         emailFrequency: emailFrequency || "weekly",
//                     },
//                 }),
//             )
//         }

//         return new Response(JSON.stringify({
//             success: true,
//             emailFrequency: emailFrequency || (userProfile ? userProfile.emailFrequency : "weekly"),
//             hideWelcomeDialog: hideWelcomeDialog !== undefined ? hideWelcomeDialog : (userProfile ? userProfile.hideWelcomeDialog : false),
//         }), {
//             status: 200,
//             headers: {
//                 "Content-Type": "application/json",
//                 "Cache-Control": "no-store, no-cache, must-revalidate"
//             },
//         })
//     } catch (error) {
//         // Safe error logging
//         const errorMessage = error instanceof Error ? error.message : "Unknown error"
//         console.error("Error updating user preferences:", errorMessage)

//         return new Response(JSON.stringify({
//             error: "Internal server error",
//             details: errorMessage
//         }), {
//             status: 500,
//             headers: {
//                 "Content-Type": "application/json",
//                 "Cache-Control": "no-store, no-cache, must-revalidate"
//             },
//         })
//     }
// }



// import type { NextRequest } from "next/server";
// import { auth } from "@clerk/nextjs/server";
// import { prisma, withRetry } from "@/lib/db/prisma";
// import type { EmailFrequency } from "@/lib/email/emailService";

// export async function GET() {
//   try {
//     const { userId } = await auth();

//     if (!userId) {
//       return new Response(JSON.stringify({ error: "Unauthorized" }), {
//         status: 401,
//         headers: {
//           "Content-Type": "application/json",
//           "Cache-Control": "no-store, no-cache, must-revalidate",
//         },
//       });
//     }

//     const userProfile = await withRetry(() =>
//       prisma.userProfile.findUnique({
//         where: { userId },
//       })
//     );

//     if (!userProfile) {
//       return new Response(
//         JSON.stringify({
//           hideWelcomeDialog: false,
//           emailFrequency: "weekly",
//         }),
//         {
//           status: 200,
//           headers: {
//             "Content-Type": "application/json",
//             "Cache-Control": "no-store, no-cache, must-revalidate",
//           },
//         }
//       );
//     }

//     return new Response(
//       JSON.stringify({
//         hideWelcomeDialog: userProfile.hideWelcomeDialog,
//         emailFrequency: userProfile.emailFrequency || "weekly",
//       }),
//       {
//         status: 200,
//         headers: {
//           "Content-Type": "application/json",
//           "Cache-Control": "no-store, no-cache, must-revalidate",
//         },
//       }
//     );
//   } catch (error) {
//     const errorMessage =
//       error instanceof Error ? error.message : "Unknown error";
//     console.error("Error retrieving user preferences:", errorMessage);

//     return new Response(
//       JSON.stringify({
//         error: "Internal server error",
//         details: errorMessage,
//       }),
//       {
//         status: 500,
//         headers: {
//           "Content-Type": "application/json",
//           "Cache-Control": "no-store, no-cache, must-revalidate",
//         },
//       }
//     );
//   }
// }

// export async function POST(req: NextRequest) {
//   try {
//     const { userId } = await auth();

//     if (!userId) {
//       return new Response(JSON.stringify({ error: "Unauthorized" }), {
//         status: 401,
//         headers: {
//           "Content-Type": "application/json",
//           "Cache-Control": "no-store, no-cache, must-revalidate",
//         },
//       });
//     }

//     const { hideWelcomeDialog, emailFrequency } = (await req.json()) as {
//       hideWelcomeDialog?: boolean;
//       emailFrequency?: EmailFrequency;
//     };

//     if (
//       emailFrequency &&
//       !["daily", "biweekly", "weekly", "monthly"].includes(emailFrequency)
//     ) {
//       return new Response(
//         JSON.stringify({
//           error:
//             "Invalid email frequency. Choose from: daily, biweekly, weekly, monthly",
//         }),
//         {
//           status: 400,
//           headers: {
//             "Content-Type": "application/json",
//             "Cache-Control": "no-store, no-cache, must-revalidate",
//           },
//         }
//       );
//     }

//     const userProfile = await withRetry(() =>
//       prisma.userProfile.findUnique({
//         where: { userId },
//       })
//     );

//     if (userProfile) {
//       await withRetry(() =>
//         prisma.userProfile.update({
//           where: { userId },
//           data: {
//             hideWelcomeDialog:
//               hideWelcomeDialog !== undefined
//                 ? hideWelcomeDialog
//                 : userProfile.hideWelcomeDialog,
//             emailFrequency:
//               emailFrequency !== undefined
//                 ? emailFrequency
//                 : userProfile.emailFrequency,
//           },
//         })
//       );
//     } else {
//       const user = await withRetry(() =>
//         prisma.user.findUnique({
//           where: { id: userId },
//         })
//       );

//       if (!user) {
//         try {
//           await withRetry(() =>
//             prisma.user.create({
//               data: {
//                 id: userId,
//               },
//             })
//           );
//         } catch (error) {
//           console.error("Error creating user:", error);
//         }
//       }

//       await withRetry(() =>
//         prisma.userProfile.create({
//           data: {
//             userId,
//             hideWelcomeDialog:
//               hideWelcomeDialog !== undefined ? hideWelcomeDialog : false,
//             emailFrequency: emailFrequency || "weekly",
//           },
//         })
//       );
//     }

//     // Ensure returned data is fresh from DB
//     const updatedProfile = await withRetry(() =>
//       prisma.userProfile.findUnique({
//         where: { userId },
//       })
//     );

//     return new Response(
//       JSON.stringify({
//         success: true,
//         emailFrequency: updatedProfile?.emailFrequency || "weekly",
//         hideWelcomeDialog: updatedProfile?.hideWelcomeDialog ?? false,
//       }),
//       {
//         status: 200,
//         headers: {
//           "Content-Type": "application/json",
//           "Cache-Control": "no-store, no-cache, must-revalidate",
//         },
//       }
//     );
//   } catch (error) {
//     const errorMessage =
//       error instanceof Error ? error.message : "Unknown error";
//     console.error("Error updating user preferences:", errorMessage);

//     return new Response(
//       JSON.stringify({
//         error: "Internal server error",
//         details: errorMessage,
//       }),
//       {
//         status: 500,
//         headers: {
//           "Content-Type": "application/json",
//           "Cache-Control": "no-store, no-cache, must-revalidate",
//         },
//       }
//     );
//   }
// }
import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma, withRetry } from "@/lib/db/prisma";
import type { EmailFrequency } from "@/lib/email/emailService";

const ALLOWED_EMAIL_FREQ: EmailFrequency[] = ["daily", "biweekly", "weekly", "monthly"];
const ALLOWED_WINDOWS = ["morning", "afternoon", "evening", "night"] as const;
type PreferredWindow = (typeof ALLOWED_WINDOWS)[number];

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userProfile = await withRetry(() =>
      prisma.userProfile.findUnique({ where: { userId } })
    );

    if (!userProfile) {
      return new Response(
        JSON.stringify({
          hideWelcomeDialog: false,
          emailFrequency: "weekly",
          calendarPreferredWindow: "evening",
          timeZone: "UTC",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        hideWelcomeDialog: userProfile.hideWelcomeDialog ?? false,
        emailFrequency: userProfile.emailFrequency || "weekly",
        calendarPreferredWindow: (userProfile as any).calendarPreferredWindow || "evening",
        timeZone: (userProfile as any).timeZone || "UTC",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error retrieving user preferences:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const {
      hideWelcomeDialog,
      emailFrequency,
      calendarPreferredWindow,
      timeZone,
    } = (await req.json()) as {
      hideWelcomeDialog?: boolean;
      emailFrequency?: EmailFrequency;
      calendarPreferredWindow?: PreferredWindow;
      timeZone?: string; // IANA tz string (e.g., "America/New_York")
    };

    if (emailFrequency && !ALLOWED_EMAIL_FREQ.includes(emailFrequency)) {
      return new Response(
        JSON.stringify({
          error: `Invalid email frequency. Choose from: ${ALLOWED_EMAIL_FREQ.join(", ")}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (
      calendarPreferredWindow &&
      !ALLOWED_WINDOWS.includes(calendarPreferredWindow)
    ) {
      return new Response(
        JSON.stringify({
          error: `Invalid calendarPreferredWindow. Choose from: ${ALLOWED_WINDOWS.join(", ")}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (timeZone !== undefined && typeof timeZone !== "string") {
      return new Response(JSON.stringify({ error: "Invalid timeZone" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const existing = await withRetry(() =>
      prisma.userProfile.findUnique({ where: { userId } })
    );

    if (existing) {
      await withRetry(() =>
        prisma.userProfile.update({
          where: { userId },
          data: {
            hideWelcomeDialog:
              hideWelcomeDialog ?? existing.hideWelcomeDialog ?? false,
            emailFrequency: emailFrequency ?? existing.emailFrequency ?? "weekly",
            calendarPreferredWindow:
              calendarPreferredWindow ??
              (existing as any).calendarPreferredWindow ??
              "evening",
            timeZone: timeZone ?? (existing as any).timeZone ?? "UTC",
          },
        })
      );
    } else {
      // upsert base user
      await withRetry(() =>
        prisma.user.upsert({
          where: { id: userId },
          update: {},
          create: { id: userId },
        })
      );

      await withRetry(() =>
        prisma.userProfile.create({
          data: {
            userId,
            hideWelcomeDialog: hideWelcomeDialog ?? false,
            emailFrequency: emailFrequency || "weekly",
            calendarPreferredWindow: calendarPreferredWindow || "evening",
            timeZone: timeZone || "UTC",
          },
        })
      );
    }

    const updated = await withRetry(() =>
      prisma.userProfile.findUnique({ where: { userId } })
    );

    return new Response(
      JSON.stringify({
        success: true,
        hideWelcomeDialog: updated?.hideWelcomeDialog ?? false,
        emailFrequency: updated?.emailFrequency || "weekly",
        calendarPreferredWindow: (updated as any)?.calendarPreferredWindow || "evening",
        timeZone: (updated as any)?.timeZone || "UTC",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error updating user preferences:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}