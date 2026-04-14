import { redirect } from "next/navigation";

export default function SettingsPage() {
  // Redirect to account page
  redirect("/app/account");
}
