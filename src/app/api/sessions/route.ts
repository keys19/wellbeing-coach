// import { NextRequest, NextResponse } from "next/server";
// import { prisma, createRetryablePrismaFunction } from "@/lib/db/prisma";
// import { auth } from "@clerk/nextjs/server";

// // Handler for GET requests - fetch sessions for the user
// export async function GET(request: NextRequest) {
//     const { userId } = await auth();
//     if (!userId) {
//         return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const searchParams = request.nextUrl.searchParams;
//     const getLatest = searchParams.get('getLatest') === 'true';

//     try {
//         // Create retry-able prisma function
//         const findSessions = createRetryablePrismaFunction(async () => {
//             if (getLatest) {
//                 // Get the most recent session
//                 const latestSession = await prisma.session.findFirst({
//                     where: { userId },
//                     orderBy: { createdAt: 'desc' },
//                 });

//                 return latestSession || null; 
//             } else {
//                 // Get all sessions
//                 const sessions = await prisma.session.findMany({
//                     where: { userId },
//                     orderBy: { createdAt: 'desc' },
//                     include: {
//                         _count: {
//                             select: { messages: true },
//                         },
//                     },
//                 });

//                 return { sessions };
//             }
//         });

//         try {
//             const result = await findSessions();

//             if (getLatest) {
//               return NextResponse.json(result); // return the session object directly
//             } else {
//               return NextResponse.json(result); // this can still return { sessions: [...] }
//             }
//         } catch (dbError) {
//             console.error("Database error fetching sessions:", dbError);

//             // Return empty data instead of error to avoid breaking UI
//             if (getLatest) {
//                 return NextResponse.json({
//                     latestSession: null,
//                     error: "Database connection error"
//                 }, { status: 200 });
//             } else {
//                 return NextResponse.json({
//                     sessions: [],
//                     error: "Database connection error"
//                 }, { status: 200 });
//             }
//         }
//     } catch (error) {
//         console.error("Error processing sessions request:", error);

//         // Return empty data instead of error to avoid breaking UI
//         if (getLatest) {
//             return NextResponse.json({
//                 latestSession: null,
//                 error: "Failed to fetch sessions"
//             }, { status: 200 });
//         } else {
//             return NextResponse.json({
//                 sessions: [],
//                 error: "Failed to fetch sessions"
//             }, { status: 200 });
//         }
//     }
// }

// // // Handler for POST requests - create a new session
// // export async function POST(request: NextRequest) {
// //     const { userId } = await auth();
// //     if (!userId) {
// //         return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// //     }

// //     try {
// //         // Parse the request to get the initial phase if provided
// //         const requestData = await request.json();
// //         const initialPhase = requestData.initialPhase || "introduction";

// //         // Create retry-able prisma function
// //         const createSession = createRetryablePrismaFunction(async () => {
// //             // Create the session without the currentPhase field
// //             const session = await prisma.session.create({
// //                 data: {
// //                     userId,
// //                 },
// //             });

// //             // Then set the currentPhase with a direct MongoDB operation
// //             try {
// //                 await prisma.$runCommandRaw({
// //                     update: "sessions",
// //                     updates: [
// //                         {
// //                             q: { _id: { $oid: session.id } },
// //                             u: { $set: { currentPhase: initialPhase } }
// //                         }
// //                     ]
// //                 });
// //                 console.log(`Set initial phase to ${initialPhase} for session ${session.id}`);

// //                 // Add the phase to the returned session object
// //                 return {
// //                     ...session,
// //                     currentPhase: initialPhase
// //                 };
// //             } catch (phaseUpdateError) {
// //                 console.error("Error setting initial phase:", phaseUpdateError);
// //                 // Return the session even if setting the phase fails
// //                 return session;
// //             }
// //         });

// //         try {
// //             const session = await createSession();
// //             return NextResponse.json(session, { status: 201 });
// //         } catch (dbError) {
// //             console.error("Database error creating session:", dbError);

// //             // Create a fake temporary session to avoid breaking the UI
// //             // Client code will recognize temp- prefix and handle appropriately
// //             return NextResponse.json({
// //                 id: `temp-${Date.now()}`,
// //                 createdAt: new Date(),
// //                 currentPhase: initialPhase,
// //                 error: "Database connection error"
// //             }, { status: 200 });
// //         }
// //     } catch (error) {
// //         console.error("Error processing session creation:", error);

// //         // Create a fake temporary session to avoid breaking the UI
// //         // Client code will recognize temp- prefix and handle appropriately
// //         return NextResponse.json({
// //             id: `temp-${Date.now()}`,
// //             createdAt: new Date(),
// //             currentPhase: "introduction",
// //             error: "Failed to create session"
// //         }, { status: 200 });
// //     }
// // }

// // export async function POST(request: NextRequest) {
// //   type RequestData = {
// //   userId?: string;
// //   initialPhase?: string;
// // };

// // let requestData: RequestData = {};
// //   try {
// //     requestData = await request.json();
// //   } catch (err) {
// //     console.warn("No JSON body provided to /api/sessions");
// //   }

// //   const initialPhase = requestData.initialPhase || "introduction";
// //   const fallbackUserId = requestData.userId || "debug_user_123"; // dev fallback

// //   //  Replace this block depending on how your `auth()` returns user ID
// //   const authData = auth(); // If auth() is synchronous
// //   const userId = authData?.userId || fallbackUserId;

// //   if (!userId) {
// //     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// //   }

// //   try {
// //     const createSession = createRetryablePrismaFunction(async () => {
// //       const session = await prisma.session.create({
// //         data: {
// //           userId,
// //         },
// //       });

// //       // Set initial phase via raw Mongo update
// //       try {
// //         await prisma.$runCommandRaw({
// //           update: "sessions",
// //           updates: [
// //             {
// //               q: { _id: { $oid: session.id } },
// //               u: { $set: { currentPhase: initialPhase } },
// //             },
// //           ],
// //         });

// //         console.log(` Set initial phase to '${initialPhase}' for session ${session.id}`);

// //         return {
// //           ...session,
// //           currentPhase: initialPhase,
// //         };
// //       } catch (phaseUpdateError) {
// //         console.error(" Error setting phase:", phaseUpdateError);
// //         return session; // Still return session even if phase fails
// //       }
// //     });

// //     const session = await createSession();
// //     return NextResponse.json(session, { status: 201 });

// //   } catch (dbError) {
// //     console.error(" DB error during session creation:", dbError);

// //     // Return a temp session object so UI doesn’t break
// //     return NextResponse.json({
// //       id: `temp-${Date.now()}`,
// //       createdAt: new Date(),
// //       currentPhase: initialPhase,
// //       error: "Database connection error",
// //     }, { status: 200 });
// //   }
// // }


// export async function POST(request: NextRequest) {
//   type RequestData = {
//     userId?: string;
//     initialPhase?: string;
//   };

//   let requestData: RequestData = {};
//   try {
//     requestData = await request.json();
//   } catch (err) {
//     console.warn("⚠️ No JSON body provided to /api/sessions");
//   }

//   const initialPhase = requestData.initialPhase || "introduction";
//   const fallbackUserId = requestData.userId || "debug_user_123";

//   // 👇 FIX: await the auth() call
//   const authData = await auth();
//   const userId = authData?.userId || fallbackUserId;

//   console.log("🧠 Session creation request");
//   console.log("→ userId:", userId);
//   console.log("→ initialPhase:", initialPhase);

//   if (!userId) {
//     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//   }

//   try {
//     const createSession = createRetryablePrismaFunction(async () => {
//       const session = await prisma.session.create({
//         data: {
//           userId,
//         },
//       });

//       try {
//         await prisma.$runCommandRaw({
//           update: "sessions",
//           updates: [
//             {
//               q: { _id: { $oid: session.id } },
//               u: { $set: { currentPhase: initialPhase } },
//             },
//           ],
//         });

//         console.log(`✅ Created session ${session.id} with phase '${initialPhase}'`);

//         return {
//           ...session,
//           currentPhase: initialPhase,
//         };
//       } catch (phaseUpdateError) {
//         console.error("❌ Error setting phase:", phaseUpdateError);
//         return session;
//       }
//     });

//     const session = await createSession();
//     return NextResponse.json(session, { status: 201 });

//   } catch (dbError) {
//     console.error("❌ DB error during session creation:", dbError);
//     return NextResponse.json({
//       id: `temp-${Date.now()}`,
//       createdAt: new Date(),
//       currentPhase: initialPhase,
//       error: "Database connection error",
//     }, { status: 200 });
//   }
// }

import { NextRequest, NextResponse } from "next/server";
import { prisma, createRetryablePrismaFunction } from "@/lib/db/prisma";
import { auth } from "@clerk/nextjs/server";

// GET /api/sessions[?getLatest=true]
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const getLatest = searchParams.get("getLatest") === "true";

  try {
    const findSessions = createRetryablePrismaFunction(async () => {
      if (getLatest) {
        const latestSession = await prisma.session.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });
        // ✅ wrap it so client can read data.latestSession
        return { latestSession: latestSession || null };
      } else {
        const sessions = await prisma.session.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { messages: true } },
          },
        });
        return { sessions };
      }
    });

    const result = await findSessions();
    return NextResponse.json(result);
  } catch (dbError) {
    console.error("Database error fetching sessions:", dbError);
    if (getLatest) {
      return NextResponse.json(
        { latestSession: null, error: "Database connection error" },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { sessions: [], error: "Database connection error" },
      { status: 200 }
    );
  }
}

// POST /api/sessions
export async function POST(request: NextRequest) {
  type RequestData = { userId?: string; initialPhase?: string };

  let requestData: RequestData = {};
  try {
    requestData = await request.json();
  } catch {
    console.warn("⚠️ No JSON body provided to /api/sessions");
  }

  const initialPhase = requestData.initialPhase || "introduction";
  const fallbackUserId = requestData.userId || "debug_user_123";

  const authData = await auth();
  const userId = authData?.userId || fallbackUserId;

  console.log("🧠 Session creation request");
  console.log("→ userId:", userId);
  console.log("→ initialPhase:", initialPhase);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const createSession = createRetryablePrismaFunction(async () => {
      const session = await prisma.session.create({
        data: { userId },
      });

      try {
        // Set initial phase with raw command (Mongo)
        await prisma.$runCommandRaw({
          update: "sessions",
          updates: [
            {
              q: { _id: { $oid: session.id } },
              u: { $set: { currentPhase: initialPhase } },
            },
          ],
        });

        console.log(
          `✅ Created session ${session.id} with phase '${initialPhase}'`
        );

        return { ...session, currentPhase: initialPhase };
      } catch (phaseUpdateError) {
        console.error("❌ Error setting phase:", phaseUpdateError);
        return session;
      }
    });

    const session = await createSession();
    return NextResponse.json(session, { status: 201 });
  } catch (dbError) {
    console.error("❌ DB error during session creation:", dbError);
    return NextResponse.json(
      {
        id: `temp-${Date.now()}`,
        createdAt: new Date(),
        currentPhase: initialPhase,
        error: "Database connection error",
      },
      { status: 200 }
    );
  }
}