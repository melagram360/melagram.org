import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { createClient } from "../lib/supabase";

export const server = {
  /* ========================================
     SIGN UP
  ======================================== */

  signUp: defineAction({
    accept: "form",

    input: z.object({
      name: z
        .string()
        .min(2, "Please enter your full name."),

      username: z
        .string()
        .min(3, "Username must be at least 3 characters.")
        .max(30, "Username must be 30 characters or fewer.")
        .regex(
          /^[A-Za-z0-9_]+$/,
          "Username can only contain letters, numbers, and underscores."
        ),

      email: z
        .string()
        .email("Please enter a valid email address."),

      password: z
        .string()
        .min(6, "Password must be at least 6 characters."),

      terms: z
        .string()
        .refine(
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

        const { error } =
          await supabase.auth.signUp({
            email: input.email,
            password: input.password,

            options: {
              emailRedirectTo:
                "https://melagram.org/auth/callback",

              data: {
                full_name: input.name,
                username: input.username,
              },
            },
          });

        if (error) {
          console.error(
            "Supabase signup error:",
            error
          );

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
          message:
            "Something went wrong. Please try again.",
        };
      }
    },
  }),

  /* ========================================
     SIGN IN
  ======================================== */

  signIn: defineAction({
    accept: "form",

    input: z.object({
      email: z
        .string()
        .email("Please enter a valid email address."),

      password: z
        .string()
        .min(1, "Please enter your password."),
    }),

    handler: async (input, context) => {
      try {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
          env: context.locals.runtime.env,
        });

        const { error } =
          await supabase.auth.signInWithPassword({
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
          message:
            "Something went wrong. Please try again.",
        };
      }
    },
  }),

  /* ========================================
     RESET PASSWORD
  ======================================== */

  resetPassword: defineAction({
    accept: "form",

    input: z.object({
      email: z
        .string()
        .email("Please enter a valid email address."),
    }),

    handler: async (input, context) => {
      try {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
          env: context.locals.runtime.env,
        });

        const { error } =
          await supabase.auth.resetPasswordForEmail(
            input.email,
            {
              redirectTo:
                "https://melagram.org/auth/reset-password",
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
          message:
            "Something went wrong. Please try again.",
        };
      }
    },
  }),

  /* ========================================
     UPDATE PASSWORD
  ======================================== */

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
        if (
          input.password !==
          input.confirmPassword
        ) {
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

        const { error } =
          await supabase.auth.updateUser({
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
          message:
            "Something went wrong. Please try again.",
        };
      }
    },
  }),

  /* ========================================
     SIGN OUT
  ======================================== */

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

  /* ========================================
     UPLOAD AVATAR
  ======================================== */

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
            message:
              "You must be signed in to upload a profile photo.",
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

        const maxSize =
          5 * 1024 * 1024;

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

        const filePath =
          `${user.id}/profile.${extension}`;

        const {
          error: uploadError,
        } = await supabase.storage
          .from("avatars")
          .upload(
            filePath,
            file,
            {
              contentType: file.type,
              upsert: true,
            }
          );

        if (uploadError) {
          console.error(
            "Avatar upload error:",
            uploadError
          );

          return {
            success: false,
            message:
              `Upload error: ${uploadError.message}`,
          };
        }

        const {
          data: { publicUrl },
        } =
          supabase.storage
            .from("avatars")
            .getPublicUrl(filePath);

        const {
          error: profileError,
        } = await supabase
          .from("profiles")
          .update({
            avatar_url: publicUrl,
            updated_at:
              new Date().toISOString(),
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
          message:
            "Your profile photo has been updated.",
          avatarUrl: publicUrl,
        };
      } catch (error) {
        console.error(
          "Avatar upload error:",
          error
        );

        return {
          success: false,
          message:
            "Something went wrong while uploading your photo.",
        };
      }
    },
  }),

  /* ========================================
     UPDATE PROFILE
  ======================================== */

  updateProfile: defineAction({
    accept: "form",

    input: z.object({
      full_name: z
        .string()
        .min(2),

      username: z
        .string()
        .min(3)
        .max(30)
        .regex(
          /^[A-Za-z0-9_]+$/
        ),

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
          input.avatar_url?.trim() ||
          null;

        const bio =
          (input.bio ?? "").trim();

        const { error } =
          await supabase
            .from("profiles")
            .update({
              full_name:
                input.full_name.trim(),
              username:
                input.username.trim(),
              bio,
              avatar_url:
                avatarUrl,
              updated_at:
                new Date().toISOString(),
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

  /* ========================================
     CREATE POST
  ======================================== */

  createPost: defineAction({
    accept: "form",

    input: z.object({
      content: z
        .string()
        .trim()
        .min(
          1,
          "Please write something before publishing."
        )
        .max(
          2000,
          "Your post must be 2,000 characters or fewer."
        ),
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
              "You must be signed in to create a post.",
          };
        }

        const content =
          input.content.trim();

        const { error } =
          await supabase
            .from("posts")
            .insert({
              user_id: user.id,
              content,
            });

        if (error) {
          console.error(
            "Create post error:",
            error
          );

          return {
            success: false,
            message:
              "We couldn't publish your post. Please try again.",
          };
        }

        return {
          success: true,
          message:
            "Your post has been published.",
        };
      } catch (error) {
        console.error(
          "Create post error:",
          error
        );

        return {
          success: false,
          message:
            "Something went wrong while publishing your post.",
        };
      }
    },
  }),

  /* ========================================
     TOGGLE LIKE
  ======================================== */

  toggleLike: defineAction({
    accept: "json",

    input: z.object({
      postId: z.string().uuid(),
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
            liked: false,
            message:
              "You must be signed in to like posts.",
          };
        }

        const {
          data: existingLike,
          error: existingLikeError,
        } =
          await supabase
            .from("post_likes")
            .select("id")
            .eq("post_id", input.postId)
            .eq("user_id", user.id)
            .maybeSingle();

        if (existingLikeError) {
          console.error(
            "Check like error:",
            existingLikeError
          );

          return {
            success: false,
            liked: false,
            message:
              "We couldn't update your like.",
          };
        }

        if (existingLike) {
          const {
            error: deleteError,
          } =
            await supabase
              .from("post_likes")
              .delete()
              .eq(
                "id",
                existingLike.id
              )
              .eq(
                "user_id",
                user.id
              );

          if (deleteError) {
            console.error(
              "Remove like error:",
              deleteError
            );

            return {
              success: false,
              liked: true,
              message:
                "We couldn't remove your like.",
            };
          }

          return {
            success: true,
            liked: false,
          };
        }

        const {
          error: insertError,
        } =
          await supabase
            .from("post_likes")
            .insert({
              post_id: input.postId,
              user_id: user.id,
            });

        if (insertError) {
          console.error(
            "Create like error:",
            insertError
          );

          return {
            success: false,
            liked: false,
            message:
              "We couldn't add your like.",
          };
        }

        return {
          success: true,
          liked: true,
        };
      } catch (error) {
        console.error(
          "Toggle like error:",
          error
        );

        return {
          success: false,
          liked: false,
          message:
            "Something went wrong while updating your like.",
        };
      }
    },
  }),

  /* ========================================
     CREATE COMMENT
  ======================================== */

  createComment: defineAction({
    accept: "json",

    input: z.object({
      postId: z.string().uuid(),

      content: z
        .string()
        .trim()
        .min(
          1,
          "Please write a comment before posting."
        )
        .max(
          1000,
          "Your comment must be 1,000 characters or fewer."
        ),
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
              "You must be signed in to comment on posts.",
          };
        }

        const content =
          input.content.trim();

        const { error } =
          await supabase
            .from("post_comments")
            .insert({
              post_id: input.postId,
              user_id: user.id,
              content,
            });

        if (error) {
          console.error(
            "Create comment error:",
            error
          );

          return {
            success: false,
            message:
              "We couldn't post your comment. Please try again.",
          };
        }

        return {
          success: true,
          message:
            "Your comment has been posted.",
        };
      } catch (error) {
        console.error(
          "Create comment error:",
          error
        );

        return {
          success: false,
          message:
            "Something went wrong while posting your comment.",
        };
      }
    },
  }),

  /* ========================================
     CREATE COMMUNITY POST
  ======================================== */

  createCommunityPost: defineAction({
    accept: "json",

    input: z.object({
      communitySlug: z
        .string()
        .trim()
        .min(
          1,
          "A community is required."
        )
        .max(
          100,
          "Invalid community."
        ),

      content: z
        .string()
        .trim()
        .min(
          1,
          "Please write something before publishing."
        )
        .max(
          2000,
          "Your post must be 2,000 characters or fewer."
        ),
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
              "You must be signed in to create a community post.",
          };
        }

        const communitySlug =
          input.communitySlug.trim();

        const content =
          input.content.trim();

        const { error } =
          await supabase
            .from("posts")
            .insert({
              user_id: user.id,
              content,
              community_slug:
                communitySlug,
            });

        if (error) {
          console.error(
            "Create community post error:",
            error
          );

          return {
            success: false,
            message:
              "We couldn't publish your community post. Please try again.",
          };
        }

        return {
          success: true,
          message:
            "Your community post has been published.",
        };
      } catch (error) {
        console.error(
          "Create community post error:",
          error
        );

        return {
          success: false,
          message:
            "Something went wrong while publishing your community post.",
        };
      }
    },
  }),

  /* ========================================
     TOGGLE FOLLOW
  ======================================== */

  toggleFollow: defineAction({
    accept: "json",

    input: z.object({
      userId: z.string().uuid(),
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
            following: false,
            message:
              "You must be signed in to follow members.",
          };
        }

        if (user.id === input.userId) {
          return {
            success: false,
            following: false,
            message:
              "You can't follow yourself.",
          };
        }

        const {
          data: existingFollow,
          error: existingFollowError,
        } =
          await supabase
            .from("follows")
            .select("id")
            .eq(
              "follower_id",
              user.id
            )
            .eq(
              "following_id",
              input.userId
            )
            .maybeSingle();

        if (existingFollowError) {
          console.error(
            "Check follow error:",
            existingFollowError
          );

          return {
            success: false,
            following: false,
            message:
              "We couldn't update your follow.",
          };
        }

        if (existingFollow) {
          const {
            error: deleteError,
          } =
            await supabase
              .from("follows")
              .delete()
              .eq(
                "id",
                existingFollow.id
              )
              .eq(
                "follower_id",
                user.id
              );

          if (deleteError) {
            console.error(
              "Remove follow error:",
              deleteError
            );

            return {
              success: false,
              following: true,
              message:
                "We couldn't unfollow this member.",
            };
          }

          return {
            success: true,
            following: false,
          };
        }

        const {
          error: insertError,
        } =
          await supabase
            .from("follows")
            .insert({
              follower_id: user.id,
              following_id:
                input.userId,
            });

        if (insertError) {
          console.error(
            "Create follow error:",
            insertError
          );

          return {
            success: false,
            following: false,
            message:
              "We couldn't follow this member.",
          };
        }

        return {
          success: true,
          following: true,
        };
      } catch (error) {
        console.error(
          "Toggle follow error:",
          error
        );

        return {
          success: false,
          following: false,
          message:
            "Something went wrong while updating your follow.",
        };
      }
    },
  }),

  /* ========================================
     JOIN COMMUNITY
  ======================================== */

  joinCommunity: defineAction({
    accept: "json",

    input: z.object({
      communityId: z.string().uuid(),
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
            joined: false,
            message:
              "You must be signed in to join a community.",
          };
        }

        const { error } = await supabase
          .from("community_members")
          .insert({
            community_id: input.communityId,
            user_id: user.id,
          });

        if (error) {
          if (error.code === "23505") {
            return {
              success: true,
              joined: true,
              message: "You are already a member of this community.",
            };
          }

          console.error(
            "Join community error:",
            error
          );

          return {
            success: false,
            joined: false,
            message:
              "We couldn't join this community. Please try again.",
          };
        }

        return {
          success: true,
          joined: true,
          message:
            "You joined the community.",
        };
      } catch (error) {
        console.error(
          "Join community error:",
          error
        );

        return {
          success: false,
          joined: false,
          message:
            "Something went wrong while joining the community.",
        };
      }
    },
  }),

  /* ========================================
     LEAVE COMMUNITY
  ======================================== */

  leaveCommunity: defineAction({
    accept: "json",

    input: z.object({
      communityId: z.string().uuid(),
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
            joined: false,
            message:
              "You must be signed in to leave a community.",
          };
        }

        const { error } = await supabase
          .from("community_members")
          .delete()
          .eq("community_id", input.communityId)
          .eq("user_id", user.id);

        if (error) {
          console.error(
            "Leave community error:",
            error
          );

          return {
            success: false,
            joined: true,
            message:
              "We couldn't leave this community. Please try again.",
          };
        }

        return {
          success: true,
          joined: false,
          message:
            "You left the community.",
        };
      } catch (error) {
        console.error(
          "Leave community error:",
          error
        );

        return {
          success: false,
          joined: true,
          message:
            "Something went wrong while leaving the community.",
        };
      }
    },
  }),

};
