import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { CameraIcon, LogOutIcon } from "lucide-react";

import { useUser } from "@/hooks/auth/user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/(protected)/settings/")({
  component: UserSettingsPage,
});

function UserSettingsPage() {
  const { user, isPending, updateUser, isUpdating, changePassword, isChangingPassword, signOut, isSigningOut } = useUser();

  const profileForm = useForm({
    defaultValues: {
      name: user?.name ?? "",
      image: user?.image ?? "",
    },
    onSubmit: async ({ value }) => {
      await updateUser({
        name: value.name,
        image: value.image || undefined,
      });
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(1, "Name is required"),
        image: z.string().url("Must be a valid URL").or(z.literal("")),
      }),
    },
  });

  const passwordForm = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      await changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
      });
      passwordForm.reset();
    },
    validators: {
      onSubmit: z
        .object({
          currentPassword: z.string().min(1, "Current password is required"),
          newPassword: z.string().min(8, "Password must be at least 8 characters"),
          confirmPassword: z.string().min(1, "Please confirm your password"),
        })
        .refine((data) => data.newPassword === data.confirmPassword, {
          message: "Passwords do not match",
          path: ["confirmPassword"],
        }),
    },
  });

  useEffect(() => {
    if (user) {
      profileForm.setFieldValue("name", user.name);
      profileForm.setFieldValue("image", user.image ?? "");
    }
  }, [user, profileForm]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (isPending && !user) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading user...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Not signed in</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              await profileForm.handleSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex items-start gap-4">
              <div className="relative">
                <Avatar size="lg" className="size-20">
                  <AvatarImage src={profileForm.getFieldValue("image") || undefined} />
                  <AvatarFallback className="text-lg">
                    {getInitials(user.name || "U")}
                  </AvatarFallback>
                </Avatar>
                <Button
                  type="button"
                  size="icon-sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -right-1 -bottom-1 rounded-full shadow-sm"
                >
                  <CameraIcon className="size-4" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        profileForm.setFieldValue("image", reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </div>

              <div className="flex flex-1 flex-col gap-3">
                <profileForm.Field name="name">
                  {(field) => (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={field.name}>Name</Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Your name"
                      />
                      {field.state.meta.errors.map((error) => (
                        <p key={error?.message} className="text-destructive text-xs">
                          {error?.message}
                        </p>
                      ))}
                    </div>
                  )}
                </profileForm.Field>

                <div className="flex flex-col gap-1.5">
                  <Label>Email</Label>
                  <Input value={user.email} disabled className="bg-muted" />
                  <p className="text-muted-foreground text-xs">
                    Email cannot be changed
                  </p>
                </div>

                <profileForm.Field name="image">
                  {(field) => (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={field.name}>Profile Picture URL</Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="https://example.com/avatar.jpg"
                      />
                      {field.state.meta.errors.map((error) => (
                        <p key={error?.message} className="text-destructive text-xs">
                          {error?.message}
                        </p>
                      ))}
                    </div>
                  )}
                </profileForm.Field>
              </div>
            </div>

            <profileForm.Subscribe>
              {(state) => (
                <Button
                  type="submit"
                  className="w-fit"
                  disabled={!state.canSubmit || state.isSubmitting || isUpdating}
                >
                  {state.isSubmitting || isUpdating ? "Saving..." : "Save Changes"}
                </Button>
              )}
            </profileForm.Subscribe>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              await passwordForm.handleSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <passwordForm.Field name="currentPassword">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>Current Password</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Enter your current password"
                  />
                  {field.state.meta.errors.map((error) => (
                    <p key={error?.message} className="text-destructive text-xs">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </passwordForm.Field>

            <passwordForm.Field name="newPassword">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>New Password</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Enter your new password"
                  />
                  {field.state.meta.errors.map((error) => (
                    <p key={error?.message} className="text-destructive text-xs">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </passwordForm.Field>

            <passwordForm.Field name="confirmPassword">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>Confirm New Password</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Confirm your new password"
                  />
                  {field.state.meta.errors.map((error) => (
                    <p key={error?.message} className="text-destructive text-xs">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </passwordForm.Field>

            <passwordForm.Subscribe>
              {(state) => (
                <Button
                  type="submit"
                  className="w-fit"
                  disabled={!state.canSubmit || state.isSubmitting || isChangingPassword}
                >
                  {state.isSubmitting || isChangingPassword
                    ? "Changing Password..."
                    : "Change Password"}
                </Button>
              )}
            </passwordForm.Subscribe>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Sign Out</CardTitle>
          <CardDescription>
            Sign out of your account on this device
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => signOut()}
            disabled={isSigningOut}
          >
            <LogOutIcon className="size-4" />
            {isSigningOut ? "Signing out..." : "Sign Out"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
