import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { createClient } from "../lib/supabase";

export const server = {
  signUp: defineAction({
    accept: "form",
    input: z.object({
      name: z.string().min(2, "Please enter your full name."),
      username: z
        .string()
        .min(3, "Username must be at least 3 characters.")
        .max(30, "Username must be 30 characters or fewer.")
        .regex(
          /^[A-Za-z0-9_]+$/,
          "Username can only contain letters, numbers, and underscores."
        ),
      email: z.string().email("Please enter a valid email address."),
      password: z.string().min(6, "Password must be at least 6 characters."),
      terms: z.string().refine(
        (value) => value === "on",
        "You must agree to the terms."
      ),
    }),

    handler: async (input, context) => {
      try {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
          env: context.locals.runtime.env,
        });

        const { error } = await supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            emailRedirectTo: "https://melagram.org/auth/callback",
            data: {
              full_name: input.name,
              username: input.username,
            },
          },
        });

        if (error) {
          console.error("Supabase signup error:", error);

          return {
            success: false,
            message: error.message,
          };
        }

        return {
          success: true,
          message:
            "Account created! Check your email to confirm your account.",
        };
      } catch {
        return {
          success: false,
          message: "Something went wrong. Please try again.",
        };
      }
    },
  }),

  signIn: defineAction({
    accept: "form",

    input: z.object({
      email: z.string().email("Please enter a valid email address."),
      password: z.string().min(1, "Please enter your password."),
    }),

    handler: async (input, context) => {
      try {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
          env: context.locals.runtime.env,
        });

        const { error } = await supabase.auth.signInWithPassword({
          email: input.email,
          password: input.password,
        });

        if (error) {
          return {
            success: false,
            message: "Invalid email or password.",
          };
        }

        return {
          success: true,
          message: "Signed in successfully.",
        };
      } catch {
        return {
          success: false,
          message: "Something went wrong. Please try again.",
        };
      }
    },
  }),

  resetPassword: defineAction({
    accept: "form",

    input: z.object({
      email: z.string().email("Please enter a valid email address."),
    }),

    handler: async (input, context) => {
      try {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
          env: context.locals.runtime.env,
        });

        const { error } = await supabase.auth.resetPasswordForEmail(
          input.email,
          {
            redirectTo: "https://melagram.org/auth/reset-password",
          }
        );

        if (error) {
          return {
            success: false,
            message: error.message,
          };
        }

        return {
          success: true,
          message:
            "If an account exists for that email, a password reset link has been sent.",
        };
      } catch {
        return {
          success: false,
          message: "Something went wrong. Please try again.",
        };
      }
    },
  }),

  updatePassword: defineAction({
    accept: "form",

    input: z.object({
      password: z.string().min(6, "Password must be at least 6 characters."),
      confirmPassword: z.string(),
    }),

    handler: async (input, context) => {
      try {
        if (input.password !== input.confirmPassword) {
          return {
            success: false,
            message: "Passwords do not match.",
          };
        }

        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
          env: context.locals.runtime.env,
        });

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          return {
            success: false,
            message:
              "Your password reset session is invalid or has expired.",
          };
        }

        const { error } = await supabase.auth.updateUser({
          password: input.password,
        });

        if (error) {
          return {
            success: false,
            message: error.message,
          };
        }

        return {
          success: true,
          message:
            "Your password has been updated successfully. You can now log in with your new password.",
        };
      } catch {
        return {
          success: false,
          message: "Something went wrong. Please try again.",
        };
      }
    },
  }),

  signOut: defineAction({
    handler: async (_, context) => {
      try {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
          env: context.locals.runtime.env,
        });

        await supabase.auth.signOut();

        return {
          success: true,
        };
      } catch {
        return {
          success: false,
          message: "Failed to sign out.",
        };
      }
    },
  }),

  uploadAvatar: defineAction({
    accept: "form",

    input: z.object({
      avatar: z.instanceof(File),
    }),

    handler: async (input, context) => {
      try {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
          env: context.locals.runtime.env,
        });

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          return {
            success: false,
            message: "You must be signed in to upload a profile photo.",
          };
        }

        const file = input.avatar;

        if (!file || file.size === 0) {
          return {
            success: false,
            message: "Please choose an image.",
          };
        }

        const allowedTypes = [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
        ];

        if (!allowedTypes.includes(file.type)) {
          return {
            success: false,
            message:
              "Please upload a JPG, PNG, WEBP, or GIF image.",
          };
        }

        const maxSize = 5 * 1024 * 1024;

        if (file.size > maxSize) {
          return {
            success: false,
            message:
              "Profile photos must be 5MB or smaller.",
          };
        }

        const extension =
          file.type === "image/png"
            ? "png"
            : file.type === "image/webp"
              ? "webp"
              : file.type === "image/gif"
                ? "gif"
                : "jpg";

        const filePath = `${user.id}/profile.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, file, {
            contentType: file.type,
            upsert: true,
          });

        if (uploadError) {
          console.error("Avatar upload error:", uploadError);

          return {
            success: false,
            message: `Upload error: ${uploadError.message}`,
          };
        }

        const {
          data: { publicUrl },
        } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            avatar_url: publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (profileError) {
          console.error(
            "Avatar profile update error:",
            profileError
          );

          return {
            success: false,
            message:
              "Your photo uploaded, but we couldn't update your profile.",
          };
        }

        return {
          success: true,
          message: "Your profile photo has been updated.",
          avatarUrl: publicUrl,
        };
      } catch (error) {
        console.error("Avatar upload error:", error);

        return {
          success: false,
          message:
            "Something went wrong while uploading your photo.",
        };
      }
    },
  }),

  updateProfile: defineAction({
    accept: "form",

    input: z.object({
      full_name: z.string().min(2),

      username: z
        .string()
        .min(3)
        .max(30)
        .regex(/^[A-Za-z0-9_]+$/),

      bio: z
        .string()
        .max(160)
        .nullable()
        .optional(),

      avatar_url: z
        .string()
        .nullable()
        .optional(),
    }),

    handler: async (input, context) => {
      try {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
          env: context.locals.runtime.env,
        });

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          return {
            success: false,
            message:
              "You must be signed in to update your profile.",
          };
        }

        const avatarUrl =
          input.avatar_url?.trim() || null;

        const bio =
          (input.bio ?? "").trim();

        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: input.full_name.trim(),
            username: input.username.trim(),
            bio,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (error) {
          if (error.code === "23505") {
            return {
              success: false,
              message:
                "That username is already taken.",
            };
          }

          console.error(
            "Profile update error:",
            error
          );

          return {
            success: false,
            message:
              "We couldn't update your profile. Please try again.",
          };
        }

        return {
          success: true,
          message:
            "Your profile has been updated successfully.",
        };
      } catch (error) {
        console.error(
          "Profile update error:",
          error
        );

        return {
          success: false,
          message:
            "Something went wrong while updating your profile.",
        };
      }
    },
  }),
};