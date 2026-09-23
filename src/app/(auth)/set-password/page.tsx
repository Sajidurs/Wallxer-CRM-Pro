import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SetPasswordForm } from "@/features/auth/components/set-password-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Set your password",
};

/**
 * Reached two ways: by accepting an invite, and by `requireUser()` bouncing a
 * user whose password was handed to them by an admin.
 *
 * It reads the auth user rather than the profile, because an invited user is
 * not yet an active profile and so RLS returns them nothing.
 */
export default async function SetPasswordPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Set your password</CardTitle>
        <CardDescription>
          Choose a password for {user.email}. At least 10 characters.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SetPasswordForm />
      </CardContent>
    </Card>
  );
}
