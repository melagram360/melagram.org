import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { createClient } from "../lib/supabase";

export const server = {
  signUp: defineAction({
    accept: "form",

    input: z.object({
      name: z.string().min(2, "Please enter your full name."),
      username: z
        .string()
        .min(3, "Username must be at least 3 characters.")
        .max(30, "Username must be 30 characters or less.")
        .regex(
          /^[a-zA-Z0-9_]+$/,
          "Username can only contain letters, numbers, and underscores."
        ),
      email: z.string().email("Please enter a valid email address."),
      password: z
        .string()
        .min(6, "Password must be at least 6 characters."),
      terms: z
        .string()
        .optional()
        .refine(
          (value) => value === "on",
          "You must agree to the Terms of Service and Privacy Policy."
        ),
    }),

    handler: async (input, context) => {
      try {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });

        const { error } = await supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            data: {
              full_name: input.name,
              username: input.username,
            },
            emailRedirectTo:
              "http://localhost:4321/auth/callback",
          },
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
      email: z.string().email(),
      password: z.string(),
    }),

    handler: async (input, context) => {
      try {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });

        const { error } =
          await supabase.auth.signInWithPassword({
            email: input.email,
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
        });

        const { error } = await supabase.auth.resetPasswordForEmail(
          input.email,
          {
            redirectTo:
              "http://localhost:4321/auth/reset-password",
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
      password: z
        .string()
        .min(6, "Password must be at least 6 characters."),
      confirmPassword: z.string(),
    }),

    handler: async (input, context) => {
      try {
        if (input.password !== input.confirmPassword) {
          return {
            success: false,
            message: "Your passwords do not match.",
          };
        }

        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });

        const { data } = await supabase.auth.getUser();

        if (!data.user) {
          return {
            success: false,
            message:
              "Your password reset session is invalid or has expired. Please request a new reset link.",
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
};