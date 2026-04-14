// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhook/clerk",
  "/api/cron(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};



// // // middleware.ts
// import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// const isPublicRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)', '/api/webhook/clerk'])

// export default clerkMiddleware(async (auth, req) => {
//     if (!isPublicRoute(req)) await auth.protect()
// })

// export const config = {
//     matcher: [
//         // Skip Next.js internals and all static files, unless found in search params
//         '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
//         // Always run for API routes
//         '/(api|trpc)(.*)',
//     ],
// };

// import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

// // Define public routes that don't require authentication
// const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)", "/api/webhook/clerk"])

// export default clerkMiddleware(async (auth, req) => {
//     // Protect all routes except public ones
//     if (!isPublicRoute(req)) await auth.protect()
// })

// export const config = {
//     matcher: [
//         // Skip Next.js internals and all static files
//         "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
//         // Always run for API routes
//         "/(api|trpc)(.*)",
//     ],
// }

// import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
// import { NextResponse } from "next/server"

// // Define public routes that don't require authentication
// const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)", "/api/webhook/clerk"])

// export default clerkMiddleware(async (auth, req) => {
//     // Protect all routes except public ones
//     if (!isPublicRoute(req)) await auth.protect()

//     // Check if the user is authenticated and trying to access the chat or dashboard
//     const { userId, getToken } = await auth();
//     const token = getToken()
//     if (userId && (req.nextUrl.pathname === "/app/chat" || req.nextUrl.pathname === "/app/dashboard")) {
//         // Check if the user has customized their bot
//         try {
//             const response = await fetch(`${req.nextUrl.origin}/api/bot-preferences`, {
//                 headers: {
//                     Authorization: `Bearer ${token}`,
//                 },
//             })

//             if (response.ok) {
//                 const data = await response.json()

//                 // If the user hasn't customized their bot, redirect to the customization page
//                 if (!data.preferences.hasCustomized) {
//                     return NextResponse.redirect(new URL("/app/customize-bot", req.nextUrl.origin))
//                 }
//             }
//         } catch (error) {
//             console.error("Error checking bot preferences:", error)
//             // Continue without redirecting in case of error
//         }
//     }
// })

// export const config = {
//     matcher: [
//         // Skip Next.js internals and all static files
//         "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
//         // Always run for API routes
//         "/(api|trpc)(.*)",
//     ],
// }


// import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
// import { NextResponse } from "next/server"

// // Define public routes that don't require authentication
// const isPublicRoute = createRouteMatcher([
//     "/",
//     "/sign-in(.*)",
//     "/sign-up(.*)",
//     "/api/webhook/clerk",
//     "/app/account(.*)",
// ])

// export default clerkMiddleware(async (auth, req) => {
//     // Protect all routes except public ones
//     if (!isPublicRoute(req)) await auth.protect()

//     // Check if the user is authenticated and trying to access the chat or dashboard
//     const { userId, getToken } = await auth();
//     if (userId && (req.nextUrl.pathname === "/app/chat" || req.nextUrl.pathname === "/app/dashboard")) {
//         // Check if the user has customized their bot
//         try {
//             const response = await fetch(`${req.nextUrl.origin}/api/bot-preferences`, {
//                 headers: {
//                     Authorization: `Bearer ${getToken()}`,
//                 },
//             })

//             if (response.ok) {
//                 const data = await response.json()

//                 // If the user hasn't customized their bot, redirect to the customization page
//                 if (!data.preferences.hasCustomized) {
//                     return NextResponse.redirect(new URL("/app/customize-bot", req.nextUrl.origin))
//                 }
//             }
//         } catch (error) {
//             console.error("Error checking bot preferences:", error)
//             // Continue without redirecting in case of error
//         }
//     }
// })

// export const config = {
//     matcher: [
//         // Skip Next.js internals and all static files
//         "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
//         // Always run for API routes
//         "/(api|trpc)(.*)",
//     ],
// }

// import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
// import { NextResponse } from "next/server"

// // Define public routes that don't require authentication
// const isPublicRoute = createRouteMatcher([
//     "/",
//     "/sign-in(.*)",
//     "/sign-up(.*)",
//     "/api/webhook/clerk",
//     "/app/account(.*)",
//     "/app/bot-preferences(.*)", // Allow bot preferences without redirection
// ])

// // Track recent user verification to avoid repeated checks
// const RECENT_USER_VERIFICATIONS = new Map<string, number>();
// const VERIFICATION_TTL = 60000; // 1 minute cache

// export default clerkMiddleware(async (auth, req) => {
//     // Skip logging to improve performance
//     const pathname = req.nextUrl.pathname;

//     // Protect all routes except public ones
//     if (!isPublicRoute(req)) await auth.protect()

//     // Don't redirect if we're already on the bot preferences page
//     if (pathname.startsWith("/app/bot-preferences")) {
//         return;
//     }

//     // Check if the user is authenticated
//     const { userId, getToken } = await auth();

//     // Skip redirect logic if no userId (not logged in)
//     if (!userId) {
//         return;
//     }

//     // Ensure the user exists in our database for any authenticated request
//     // This adds an extra layer of protection against the user creation failures we're experiencing
//     if (userId && pathname.startsWith("/app/")) {
//         // Only verify user if we haven't done so recently (simple middleware caching)
//         const lastVerified = RECENT_USER_VERIFICATIONS.get(userId);
//         const now = Date.now();

//         if (!lastVerified || (now - lastVerified > VERIFICATION_TTL)) {
//             try {
//                 // For performance, only sync user on the first page load, not on every navigation
//                 const token = await getToken();

//                 if (token) {
//                     // Use a non-blocking fetch that doesn't await
//                     fetch(`${req.nextUrl.origin}/api/user/ensure-exists`, {
//                         method: "POST",
//                         headers: {
//                             Authorization: `Bearer ${token}`,
//                             "Content-Type": "application/json",
//                         },
//                         body: JSON.stringify({ userId }),
//                     }).catch(error => {
//                         // Silent error handling to not block page loads
//                         console.error("Background user verification failed:", error);
//                     });

//                     // Update the verification cache immediately
//                     RECENT_USER_VERIFICATIONS.set(userId, now);
//                 }
//             } catch {
//                 // Continue regardless of error
//             }
//         }
//     }

//     // Only check for redirection on chat and dashboard pages
//     if (pathname === "/app/chat" || pathname === "/app/dashboard") {
//         try {
//             // Use localStorage check first if available
//             if (req.headers.get("x-bot-preferences-customized") === "true") {
//                 return; // Skip the API call if we know from the client it's customized
//             }

//             // Use a direct API URL with no origin prefix to avoid potential CORS issues
//             const apiUrl = `${req.nextUrl.origin}/api/bot-preferences`;

//             const token = await getToken();

//             const response = await fetch(apiUrl, {
//                 headers: {
//                     Authorization: `Bearer ${token}`,
//                     "Content-Type": "application/json",
//                     "Accept": "application/json"
//                 },
//             });

//             // Only redirect if we get a successful response
//             if (response.ok) {
//                 const data = await response.json();

//                 // Only proceed with redirect if we have valid preferences
//                 if (data.preferences) {
//                     // If the user hasn't customized their bot, redirect to the customization page
//                     if (!data.preferences.hasCustomized) {
//                         const redirectUrl = new URL("/app/bot-preferences", req.nextUrl.origin);
//                         return NextResponse.redirect(redirectUrl);
//                     }
//                 }
//             }
//         } catch {
//             // Continue without redirecting in case of error
//         }
//     }
// })

// export const config = {
//     matcher: [
//         // Skip Next.js internals and all static files
//         "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
//         // Always run for API routes
//         "/(api|trpc)(.*)",
//     ],
// }

// import { authMiddleware } from "@clerk/nextjs";

// export default authMiddleware({
//   publicRoutes: ["/", "/sign-in(.*)", "/sign-up(.*)", "/api/webhook/clerk"]
// });

// export const config = {
//   matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
// };

// import { clerkMiddleware } from "@clerk/nextjs/server";

// export default clerkMiddleware({
//   publicRoutes: ["/", "/sign-in(.*)", "/sign-up(.*)", "/api/webhook/clerk"]
// });

// export const config = {
//   matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
// };




