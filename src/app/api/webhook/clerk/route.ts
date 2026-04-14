import { Webhook } from "svix"
import { headers } from "next/headers"
import type { WebhookEvent } from "@clerk/nextjs/server"
import { syncClerkUser } from "@/lib/db/prisma"

export async function POST(req: Request) {
    // Get the headers
    const headersList = await headers()
    const svix_id = headersList.get("svix-id")
    const svix_timestamp = headersList.get("svix-timestamp")
    const svix_signature = headersList.get("svix-signature")

    // If there are no headers, error out
    if (!svix_id || !svix_timestamp || !svix_signature) {
        return new Response("Error: Missing svix headers", {
            status: 400,
        })
    }

    // Get the body
    const payload = await req.json()
    const body = JSON.stringify(payload)

    // Create a new Svix instance with your webhook secret
    const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET || "")

    let evt: WebhookEvent

    // Verify the payload with the headers
    try {
        evt = wh.verify(body, {
            "svix-id": svix_id,
            "svix-timestamp": svix_timestamp,
            "svix-signature": svix_signature,
        }) as WebhookEvent
    } catch (err) {
        console.error("Error verifying webhook:", err)
        return new Response("Error: Invalid webhook signature", {
            status: 400,
        })
    }

    // Handle the webhook
    const eventType = evt.type

    if (eventType === "user.created" || eventType === "user.updated") {
        const { id, email_addresses, first_name, last_name, username } = evt.data

        // Sync user data with our database
        // await syncClerkUser(id, {
        //     email: email_addresses?.[0]?.email_address,
        //     firstName: first_name,
        //     lastName: last_name,
        //     username: username,
        // })
        await syncClerkUser(id, {
          email: email_addresses?.[0]?.email_address ?? undefined,
          firstName: first_name ?? undefined,
          lastName: last_name ?? undefined,
          username: username ?? undefined,
        });
    }

    return new Response("Webhook received", {
        status: 200,
    })
}
