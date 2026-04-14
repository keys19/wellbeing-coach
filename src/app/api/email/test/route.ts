import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sendEmail, verifyEmailConfiguration } from "@/lib/email/emailService";

export async function POST(req: NextRequest) {
    try {
        // Get the authenticated user from Clerk
        const { userId } = await auth();

        if (!userId) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Get the email from the request body
        const { email } = await req.json();

        if (!email) {
            return new Response(JSON.stringify({ error: "Email is required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Verify email configuration
        const isConfigured = await verifyEmailConfiguration();
        if (!isConfigured) {
            return new Response(
                JSON.stringify({ error: "Email service is not properly configured" }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        // Send a test email
        const success = await sendEmail(
            email,
            "Mental Health Coach - Test Email",
            "This is a test email to verify your email configuration is working correctly.",
            `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4F46E5;">Mental Health Coach - Test Email</h2>
        <p>This is a test email to verify your email configuration is working correctly.</p>
        <p>If you received this email, your email service is properly configured.</p>
        <div style="margin-top: 20px; padding: 10px; background-color: #f9f9f9; border-left: 3px solid #4F46E5;">
          <p style="margin: 0;">Your email reminders are now configured and ready to use.</p>
        </div>
      </div>
      `
        );

        if (!success) {
            return new Response(
                JSON.stringify({ error: "Failed to send test email" }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: "Test email sent successfully" }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Error sending test email:", errorMessage);

        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
} 