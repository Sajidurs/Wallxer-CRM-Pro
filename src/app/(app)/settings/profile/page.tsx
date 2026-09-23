import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SetPasswordForm } from "@/features/auth/components/set-password-form";
import { ProfileForm } from "@/features/users/components/profile-form";
import { ROLE_LABELS } from "@/features/users/schema";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Your profile" };

/** Full IANA list where the runtime exposes it, with a small fallback. */
function timezoneOptions(current: string): string[] {
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : ["Asia/Dhaka", "UTC", "America/Toronto", "Europe/London"];

  return supported.includes(current) ? supported : [current, ...supported];
}

export default async function ProfilePage() {
  const profile = await requireUser();

  return (
    <>
      <PageHeader
        title="Your profile"
        description={`Signed in as ${profile.email} · ${ROLE_LABELS[profile.role]}`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              Your name is what colleagues see on tasks, projects, and comments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              defaults={{
                fullName: profile.full_name,
                jobTitle: profile.job_title ?? "",
                phone: profile.phone ?? "",
                timezone: profile.timezone,
              }}
              timezones={timezoneOptions(profile.timezone)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              At least 10 characters. You stay signed in on this device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SetPasswordForm
              redirectTo="/settings/profile"
              submitLabel="Change password"
              successMessage="Password changed."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
