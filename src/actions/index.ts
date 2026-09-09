import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { createClient } from "../lib/supabase";

/* ========================================
   LINK PREVIEW HELPERS
======================================== */

type LinkPreview = {
  linkUrl: string | null;
  linkType: string | null;
  linkTitle: string | null;
  linkDescription: string | null;
  linkImageUrl: string | null;
};

function emptyLinkPreview(): LinkPreview {
  return {
    linkUrl: null,
    linkType: null,
    linkTitle: null,
    linkDescription: null,
    linkImageUrl: null,
  };
}

function decodeHtmlEntities(value: string): string {
  let decoded = value;

  const namedEntities: Record<string, string> = {
    "&amp;": "&",
    "&quot;": '"',
    "&apos;": "'",
    "&#39;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
    "&ndash;": "–",
    "&mdash;": "—",
    "&lsquo;": "‘",
    "&rsquo;": "’",
    "&ldquo;": "“",
    "&rdquo;": "”",
    "&hellip;": "…",
    "&copy;": "©",
    "&reg;": "®",
    "&trade;": "™",
    "&bull;": "•",
    "&middot;": "·",
    "&laquo;": "«",
    "&raquo;": "»",
  };

  const decodeOnce = (text: string) =>
    text
      .replace(
        /&#x([0-9a-fA-F]+);/g,
        (_, hex) => {
          const codePoint =
            Number.parseInt(hex, 16);

          if (
            !Number.isFinite(codePoint) ||
            codePoint < 0 ||
            codePoint > 0x10ffff ||
            (codePoint >= 0xd800 &&
              codePoint <= 0xdfff)
          ) {
            return "";
          }

          try {
            return String.fromCodePoint(
              codePoint
            );
          } catch {
            return "";
          }
        }
      )
      .replace(
        /&#([0-9]+);/g,
        (_, decimal) => {
          const codePoint =
            Number.parseInt(
              decimal,
              10
            );

          if (
            !Number.isFinite(codePoint) ||
            codePoint < 0 ||
            codePoint > 0x10ffff ||
            (codePoint >= 0xd800 &&
              codePoint <= 0xdfff)
          ) {
            return "";
          }

          try {
            return String.fromCodePoint(
              codePoint
            );
          } catch {
            return "";
          }
        }
      )
      .replace(
        /&[a-zA-Z][a-zA-Z0-9]+;/g,
        (entity) =>
          namedEntities[entity] ??
          entity
      );

  /*
   * Some social platforms return metadata
   * that has been encoded more than once.
   */

  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(decoded);

    if (next === decoded) {
      break;
    }

    decoded = next;
  }

  return decoded;
}

function cleanPreviewText(
  value: string | null | undefined,
  maxLength = 500
): string | null {
  if (!value) {
    return null;
  }

  const cleaned = decodeHtmlEntities(
    value
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );

  if (!cleaned) {
    return null;
  }

  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength - 1).trim()}…`
    : cleaned;
}

function getFirstUrl(content: string): string | null {
  const urlMatch = content.match(
    /https?:\/\/[^\s<]+/i
  );

  if (!urlMatch) {
    return null;
  }

  return urlMatch[0].replace(
    /[),.!?]+$/,
    ""
  );
}

function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getYouTubeVideoId(
  url: string
): string | null {
  try {
    const parsedUrl = new URL(url);

    const hostname = parsedUrl.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com"
    ) {
      if (
        parsedUrl.pathname ===
        "/watch"
      ) {
        return (
          parsedUrl.searchParams.get("v")
        );
      }

      if (
        parsedUrl.pathname.startsWith(
          "/shorts/"
        )
      ) {
        return (
          parsedUrl.pathname
            .split("/")[2]
            ?.split("?")[0] || null
        );
      }

      if (
        parsedUrl.pathname.startsWith(
          "/embed/"
        )
      ) {
        return (
          parsedUrl.pathname
            .split("/")[2]
            ?.split("?")[0] || null
        );
      }

      if (
        parsedUrl.pathname.startsWith(
          "/live/"
        )
      ) {
        return (
          parsedUrl.pathname
            .split("/")[2]
            ?.split("?")[0] || null
        );
      }
    }

    if (
      hostname === "youtu.be"
    ) {
      return (
        parsedUrl.pathname
          .split("/")[1]
          ?.split("?")[0] || null
      );
    }

    return null;
  } catch {
    return null;
  }
}

function isTikTokUrl(url: string): boolean {
  const hostname =
    getHostname(url);

  if (!hostname) {
    return false;
  }

  return (
    hostname === "tiktok.com" ||
    hostname.endsWith(".tiktok.com")
  );
}

function isInstagramUrl(
  url: string
): boolean {
  const hostname =
    getHostname(url);

  if (!hostname) {
    return false;
  }

  return (
    hostname === "instagram.com" ||
    hostname.endsWith(".instagram.com")
  );
}

function isSafeExternalUrl(
  url: string
): boolean {
  try {
    const parsedUrl =
      new URL(url);

    if (
      parsedUrl.protocol !==
        "http:" &&
      parsedUrl.protocol !==
        "https:"
    ) {
      return false;
    }

    if (
      parsedUrl.username ||
      parsedUrl.password
    ) {
      return false;
    }

    const hostname =
      parsedUrl.hostname
        .toLowerCase();

    const blockedHosts = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "169.254.169.254",
    ];

    if (
      blockedHosts.includes(
        hostname
      )
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function getMetaContent(
  html: string,
  attribute: "property" | "name",
  value: string
): string | null {
  const escapedValue =
    value.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${escapedValue}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    "i"
  );

  const reversePattern =
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*${attribute}=["']${escapedValue}["'][^>]*>`,
      "i"
    );

  return (
    html.match(pattern)?.[1] ??
    html.match(reversePattern)?.[1] ??
    null
  );
}

function getTitleFromHtml(
  html: string
): string | null {
  const match = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  return match
    ? cleanPreviewText(match[1], 180)
    : null;
}

function getDescriptionFromHtml(
  html: string
): string | null {
  return (
    cleanPreviewText(
      getMetaContent(
        html,
        "property",
        "og:description"
      )
    ) ??
    cleanPreviewText(
      getMetaContent(
        html,
        "name",
        "description"
      )
    )
  );
}

function getImageFromHtml(
  html: string,
  baseUrl: string
): string | null {
  const rawImage =
    getMetaContent(
      html,
      "property",
      "og:image"
    ) ??
    getMetaContent(
      html,
      "name",
      "twitter:image"
    );

  if (!rawImage) {
    return null;
  }

  try {
    return new URL(
      decodeHtmlEntities(
        rawImage
      ),
      baseUrl
    ).toString();
  } catch {
    return null;
  }
}

async function fetchHtml(
  url: string
): Promise<string | null> {
  if (
    !isSafeExternalUrl(url)
  ) {
    return null;
  }

  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    5000
  );

  try {
    const response =
      await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal:
          controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; MelagramLinkPreview/1.0)",
          Accept:
            "text/html,application/xhtml+xml",
        },
      });

    if (
      !response.ok
    ) {
      return null;
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    if (
      !contentType.includes(
        "text/html"
      ) &&
      !contentType.includes(
        "application/xhtml+xml"
      )
    ) {
      return null;
    }

    const html =
      await response.text();

    if (
      html.length >
      2_000_000
    ) {
      return html.slice(
        0,
        2_000_000
      );
    }

    return html;
  } catch (error) {
    console.error(
      "Link preview fetch error:",
      error
    );

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getYouTubePreview(
  url: string,
  videoId: string
): Promise<LinkPreview> {
  const thumbnail =
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  let title =
    "YouTube Video";

  let description =
    "Watch this video on YouTube.";

  try {
    const oembedUrl =
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        4000
      );

    try {
      const response =
        await fetch(
          oembedUrl,
          {
            signal:
              controller.signal,
            headers: {
              Accept:
                "application/json",
            },
          }
        );

      if (
        response.ok
      ) {
        const data =
          await response.json();

        if (
          typeof data.title ===
            "string" &&
          data.title.trim()
        ) {
          title =
            cleanPreviewText(
              data.title,
              180
            ) ??
            title;
        }

        if (
          typeof data.author_name ===
            "string" &&
          data.author_name.trim()
        ) {
          description =
            `By ${cleanPreviewText(
              data.author_name,
              120
            )}`;
        }

        if (
          typeof data.thumbnail_url ===
            "string" &&
          data.thumbnail_url
        ) {
          return {
            linkUrl: url,
            linkType: "youtube",
            linkTitle: title,
            linkDescription:
              description,
            linkImageUrl:
              data.thumbnail_url,
          };
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error(
      "YouTube preview error:",
      error
    );
  }

  return {
    linkUrl: url,
    linkType: "youtube",
    linkTitle: title,
    linkDescription:
      description,
    linkImageUrl:
      thumbnail,
  };
}

async function getTikTokPreview(
  url: string
): Promise<LinkPreview> {
  let title =
    "TikTok Video";

  let description =
    "Watch this video on TikTok.";

  let imageUrl: string | null =
    null;

  try {
    const oembedUrl =
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        5000
      );

    try {
      const response =
        await fetch(
          oembedUrl,
          {
            signal:
              controller.signal,
            headers: {
              Accept:
                "application/json",
            },
          }
        );

      if (
        response.ok
      ) {
        const data =
          await response.json();

        if (
          typeof data.title ===
            "string" &&
          data.title.trim()
        ) {
          title =
            cleanPreviewText(
              data.title,
              180
            ) ??
            title;
        }

        if (
          typeof data.author_name ===
            "string" &&
          data.author_name.trim()
        ) {
          description =
            `By ${cleanPreviewText(
              data.author_name,
              120
            )}`;
        }

        if (
          typeof data.thumbnail_url ===
            "string" &&
          data.thumbnail_url
        ) {
          imageUrl =
            data.thumbnail_url;
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error(
      "TikTok preview error:",
      error
    );
  }

  if (!imageUrl) {
    const html =
      await fetchHtml(url);

    if (html) {
      title =
        getMetaContent(
          html,
          "property",
          "og:title"
        ) ??
        getTitleFromHtml(
          html
        ) ??
        title;

      description =
        getDescriptionFromHtml(
          html
        ) ??
        description;

      imageUrl =
        getImageFromHtml(
          html,
          url
        );
    }
  }

  return {
    linkUrl: url,
    linkType: "tiktok",
    linkTitle:
      cleanPreviewText(
        title,
        180
      ) ?? "TikTok Video",
    linkDescription:
      cleanPreviewText(
        description,
        300
      ),
    linkImageUrl:
      imageUrl,
  };
}

async function getInstagramPreview(
  url: string
): Promise<LinkPreview> {
  let title =
    "Instagram Post";

  let description =
    "View this post on Instagram.";

  let imageUrl: string | null =
    null;

  const html =
    await fetchHtml(url);

  if (html) {
    title =
      getMetaContent(
        html,
        "property",
        "og:title"
      ) ??
      getMetaContent(
        html,
        "property",
        "twitter:title"
      ) ??
      getTitleFromHtml(
        html
      ) ??
      title;

    description =
      getDescriptionFromHtml(
        html
      ) ??
      description;

    imageUrl =
      getImageFromHtml(
        html,
        url
      );
  }

  return {
    linkUrl: url,
    linkType: "instagram",
    linkTitle:
      cleanPreviewText(
        title,
        180
      ) ?? "Instagram Post",
    linkDescription:
      cleanPreviewText(
        description,
        300
      ),
    linkImageUrl:
      imageUrl,
  };
}

async function getWebsitePreview(
  url: string
): Promise<LinkPreview> {
  const hostname =
    getHostname(url);

  let title =
    hostname
      ? hostname
          .replace(/^www\./, "")
      : "Website";

  let description:
    string | null = null;

  let imageUrl:
    string | null = null;

  const html =
    await fetchHtml(url);

  if (html) {
    title =
      getMetaContent(
        html,
        "property",
        "og:title"
      ) ??
      getMetaContent(
        html,
        "name",
        "twitter:title"
      ) ??
      getTitleFromHtml(
        html
      ) ??
      title;

    description =
      getDescriptionFromHtml(
        html
      );

    imageUrl =
      getImageFromHtml(
        html,
        url
      );
  }

  return {
    linkUrl: url,
    linkType: "website",
    linkTitle:
      cleanPreviewText(
        title,
        180
      ),
    linkDescription:
      cleanPreviewText(
        description,
        300
      ),
    linkImageUrl:
      imageUrl,
  };
}

async function getLinkPreview(
  content: string
): Promise<LinkPreview> {
  const linkUrl =
    getFirstUrl(content);

  if (!linkUrl) {
    return emptyLinkPreview();
  }

  const youtubeVideoId =
    getYouTubeVideoId(
      linkUrl
    );

  if (youtubeVideoId) {
    return getYouTubePreview(
      linkUrl,
      youtubeVideoId
    );
  }

  if (
    isTikTokUrl(linkUrl)
  ) {
    return getTikTokPreview(
      linkUrl
    );
  }

  if (
    isInstagramUrl(linkUrl)
  ) {
    return getInstagramPreview(
      linkUrl
    );
  }

  return getWebsitePreview(
    linkUrl
  );
}

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

      creator_enabled: z
        .string()
        .optional()
        .default("off"),

      creator_category: z
        .union([
          z.enum([
            "Music",
            "Writing",
            "Art & Design",
            "Film & Video",
            "Podcasting",
            "Business",
          ]),
          z.literal(""),
        ])
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

        let avatarUrl =
          input.avatar_url?.trim() ||
          null;

        // If no new avatar was submitted, preserve the existing profile photo.
        if (!avatarUrl) {
          const { data: existingProfile } =
            await supabase
              .from("profiles")
              .select("avatar_url")
              .eq("id", user.id)
              .maybeSingle();

          avatarUrl = existingProfile?.avatar_url ?? null;
        }

        const bio =
          (input.bio ?? "").trim();

        const creatorEnabled =
          input.creator_enabled === "on" ||
          input.creator_enabled === "true";

        const creatorCategoryRaw =
          (input.creator_category ?? "").trim();

        const creatorCategory =
          creatorEnabled
            ? creatorCategoryRaw || null
            : null;

        if (
          creatorEnabled &&
          !creatorCategory
        ) {
          return {
            success: false,
            message:
              "Please choose a creator category before turning on your Creator Profile.",
          };
        }

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
              creator_enabled:
                creatorEnabled,
              creator_category:
                creatorCategory,
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

      image: z
        .instanceof(File)
        .optional(),

      communitySlug: z
        .string()
        .trim()
        .max(
          100,
          "Invalid community."
        )
        .optional()
        .default(""),
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

        const communitySlug =
          (input.communitySlug ?? "").trim() ||
          null;

        if (communitySlug) {
          const {
            data: community,
            error: communityError,
          } = await supabase
            .from("communities")
            .select("id, slug, name")
            .eq("slug", communitySlug)
            .maybeSingle();

          if (communityError) {
            console.error(
              "Community lookup error:",
              communityError
            );

            return {
              success: false,
              message:
                "We couldn't verify that community. Please try again.",
            };
          }

          if (!community) {
            return {
              success: false,
              message:
                "That community could not be found.",
            };
          }

          const {
            data: membership,
            error: membershipError,
          } = await supabase
            .from("community_members")
            .select("community_id")
            .eq(
              "community_id",
              community.id
            )
            .eq(
              "user_id",
              user.id
            )
            .maybeSingle();

          if (membershipError) {
            console.error(
              "Community membership lookup error:",
              membershipError
            );

            return {
              success: false,
              message:
                "We couldn't verify your community membership. Please try again.",
            };
          }

          if (!membership) {
            return {
              success: false,
              message:
                `You must join ${community.name} before you can post there.`,
            };
          }
        }

        const image = input.image;

        let imageUrl: string | null = null;
        let imagePath: string | null = null;

        if (image && image.size > 0) {
          const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
          ];

          if (!allowedTypes.includes(image.type)) {
            return {
              success: false,
              message:
                "Please upload a JPG, PNG, WEBP, or GIF image.",
            };
          }

          const maxSize =
            10 * 1024 * 1024;

          if (image.size > maxSize) {
            return {
              success: false,
              message:
                "Post images must be 10MB or smaller.",
            };
          }

          const extension =
            image.type === "image/png"
              ? "png"
              : image.type === "image/webp"
                ? "webp"
                : image.type === "image/gif"
                  ? "gif"
                  : "jpg";

          imagePath =
            `${user.id}/${crypto.randomUUID()}.${extension}`;

          const {
            error: uploadError,
          } = await supabase.storage
            .from("post-images")
            .upload(
              imagePath,
              image,
              {
                contentType: image.type,
                upsert: false,
              }
            );

          if (uploadError) {
            console.error(
              "Post image upload error:",
              uploadError
            );

            return {
              success: false,
              message:
                `Image upload error: ${uploadError.message}`,
            };
          }

          const {
            data: { publicUrl },
          } =
            supabase.storage
              .from("post-images")
              .getPublicUrl(imagePath);

          imageUrl = publicUrl;
        }

        const linkPreview =
          await getLinkPreview(
            content
          );

        const { error } =
          await supabase
            .from("posts")
            .insert({
              user_id: user.id,
              content,
              community_slug: communitySlug,
              image_url: imageUrl,
              link_url:
                linkPreview.linkUrl,
              link_type:
                linkPreview.linkType,
              link_title:
                linkPreview.linkTitle,
              link_description:
                linkPreview.linkDescription,
              link_image_url:
                linkPreview.linkImageUrl,
            });

        if (error) {
          if (imagePath) {
            await supabase.storage
              .from("post-images")
              .remove([imagePath]);
          }

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
            communitySlug
              ? "Your post has been published to the community."
              : "Your post has been published.",
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
     UPDATE POST
  ======================================== */

  updatePost: defineAction({
    accept: "json",

    input: z.object({
      postId: z.string().uuid(),

      content: z
        .string()
        .trim()
        .min(
          1,
          "Please write something before saving."
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
              "You must be signed in to edit posts.",
          };
        }

        const content = input.content.trim();

        const {
          data: post,
          error: postLookupError,
        } = await supabase
          .from("posts")
          .select("id, user_id")
          .eq("id", input.postId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (postLookupError) {
          console.error(
            "Update post lookup error:",
            postLookupError
          );

          return {
            success: false,
            message:
              "We couldn't find that post. Please try again.",
          };
        }

        if (!post) {
          return {
            success: false,
            message:
              "You can only edit your own posts.",
          };
        }

        const linkPreview =
          await getLinkPreview(content);

        const { error: updateError } =
          await supabase
            .from("posts")
            .update({
              content,
              link_url:
                linkPreview.linkUrl,
              link_type:
                linkPreview.linkType,
              link_title:
                linkPreview.linkTitle,
              link_description:
                linkPreview.linkDescription,
              link_image_url:
                linkPreview.linkImageUrl,
            })
            .eq("id", input.postId)
            .eq("user_id", user.id);

        if (updateError) {
          console.error(
            "Update post error:",
            updateError
          );

          return {
            success: false,
            message:
              "We couldn't save your post changes. Please try again.",
          };
        }

        return {
          success: true,
          message:
            "Your post has been updated.",
        };
      } catch (error) {
        console.error(
          "Update post error:",
          error
        );

        return {
          success: false,
          message:
            "Something went wrong while updating your post.",
        };
      }
    },
  }),

  /* ========================================
     DELETE POST
  ======================================== */

  deletePost: defineAction({
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
            message:
              "You must be signed in to delete posts.",
          };
        }

        const {
          data: post,
          error: postLookupError,
        } = await supabase
          .from("posts")
          .select(
            "id, user_id, image_url"
          )
          .eq("id", input.postId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (postLookupError) {
          console.error(
            "Delete post lookup error:",
            postLookupError
          );

          return {
            success: false,
            message:
              "We couldn't find that post. Please try again.",
          };
        }

        if (!post) {
          return {
            success: false,
            message:
              "You can only delete your own posts.",
          };
        }

        const {
          error: deleteError,
        } = await supabase
          .from("posts")
          .delete()
          .eq("id", post.id)
          .eq("user_id", user.id);

        if (deleteError) {
          console.error(
            "Delete post error:",
            deleteError
          );

          return {
            success: false,
            message:
              "We couldn't delete your post. Please try again.",
          };
        }

        if (post.image_url) {
          const marker =
            "/storage/v1/object/public/post-images/";

          const markerIndex =
            post.image_url.indexOf(
              marker
            );

          if (
            markerIndex !== -1
          ) {
            const imagePath =
              decodeURIComponent(
                post.image_url.slice(
                  markerIndex +
                    marker.length
                )
              );

            const {
              error:
                imageDeleteError,
            } =
              await supabase.storage
                .from("post-images")
                .remove([
                  imagePath,
                ]);

            if (
              imageDeleteError
            ) {
              console.error(
                "Post image cleanup error:",
                imageDeleteError
              );
            }
          }
        }

        return {
          success: true,
          message:
            "Your post has been deleted.",
        };
      } catch (error) {
        console.error(
          "Delete post error:",
          error
        );

        return {
          success: false,
          message:
            "Something went wrong while deleting your post.",
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
          error:
            existingLikeError,
        } =
          await supabase
            .from("post_likes")
            .select("id")
            .eq(
              "post_id",
              input.postId
            )
            .eq(
              "user_id",
              user.id
            )
            .maybeSingle();

        if (
          existingLikeError
        ) {
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
              post_id:
                input.postId,
              user_id:
                user.id,
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

      parentCommentId: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .default(null),
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

        const parentCommentId =
          input.parentCommentId ?? null;

        /*
         * Replies are limited to one level:
         * a reply can target a top-level comment,
         * but a reply cannot target another reply.
         */
        if (parentCommentId) {
          const {
            data: parentComment,
            error: parentLookupError,
          } = await supabase
            .from("post_comments")
            .select(
              "id, post_id, parent_comment_id"
            )
            .eq(
              "id",
              parentCommentId
            )
            .maybeSingle();

          if (parentLookupError) {
            console.error(
              "Parent comment lookup error:",
              parentLookupError
            );

            return {
              success: false,
              message:
                "We couldn't verify the comment you're replying to. Please try again.",
            };
          }

          if (!parentComment) {
            return {
              success: false,
              message:
                "That comment could not be found.",
            };
          }

          if (
            parentComment.post_id !==
            input.postId
          ) {
            return {
              success: false,
              message:
                "That comment does not belong to this post.",
            };
          }

          if (
            parentComment.parent_comment_id
          ) {
            return {
              success: false,
              message:
                "Replies can only be made to a top-level comment.",
            };
          }
        }

        const { error } =
          await supabase
            .from("post_comments")
            .insert({
              post_id:
                input.postId,
              user_id:
                user.id,
              content,
              parent_comment_id:
                parentCommentId,
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
            parentCommentId
              ? "Your reply has been posted."
              : "Your comment has been posted.",
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
    accept: "form",

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

      image: z
        .instanceof(File)
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
              "You must be signed in to create a community post.",
          };
        }

        const communitySlug =
          input.communitySlug.trim();

        const content =
          input.content.trim();

        const image = input.image;

        let imageUrl: string | null = null;
        let imagePath: string | null = null;

        if (image && image.size > 0) {
          const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
          ];

          if (
            !allowedTypes.includes(
              image.type
            )
          ) {
            return {
              success: false,
              message:
                "Please upload a JPG, PNG, WEBP, or GIF image.",
            };
          }

          const maxSize =
            10 * 1024 * 1024;

          if (
            image.size >
            maxSize
          ) {
            return {
              success: false,
              message:
                "Community post images must be 10MB or smaller.",
            };
          }

          const extension =
            image.type === "image/png"
              ? "png"
              : image.type === "image/webp"
                ? "webp"
                : image.type === "image/gif"
                  ? "gif"
                  : "jpg";

          imagePath =
            `${user.id}/community-${crypto.randomUUID()}.${extension}`;

          const {
            error:
              uploadError,
          } =
            await supabase.storage
              .from(
                "post-images"
              )
              .upload(
                imagePath,
                image,
                {
                  contentType:
                    image.type,
                  upsert:
                    false,
                }
              );

          if (uploadError) {
            console.error(
              "Community post image upload error:",
              uploadError
            );

            return {
              success: false,
              message:
                `Image upload error: ${uploadError.message}`,
            };
          }

          const {
            data: {
              publicUrl,
            },
          } =
            supabase.storage
              .from(
                "post-images"
              )
              .getPublicUrl(
                imagePath
              );

          imageUrl =
            publicUrl;
        }

        const linkPreview =
          await getLinkPreview(
            content
          );

        const { error } =
          await supabase
            .from("posts")
            .insert({
              user_id:
                user.id,
              content,
              community_slug:
                communitySlug,
              image_url:
                imageUrl,
              link_url:
                linkPreview.linkUrl,
              link_type:
                linkPreview.linkType,
              link_title:
                linkPreview.linkTitle,
              link_description:
                linkPreview.linkDescription,
              link_image_url:
                linkPreview.linkImageUrl,
            });

        if (error) {
          if (imagePath) {
            await supabase.storage
              .from(
                "post-images"
              )
              .remove([
                imagePath,
              ]);
          }

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

        if (
          user.id ===
          input.userId
        ) {
          return {
            success: false,
            following: false,
            message:
              "You can't follow yourself.",
          };
        }

        const {
          data: existingFollow,
          error:
            existingFollowError,
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

        if (
          existingFollowError
        ) {
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
            error:
              deleteError,
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
              follower_id:
                user.id,
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

        const { error } =
          await supabase
            .from(
              "community_members"
            )
            .insert({
              community_id:
                input.communityId,
              user_id:
                user.id,
            });

        if (error) {
          if (
            error.code ===
            "23505"
          ) {
            return {
              success: true,
              joined: true,
              message:
                "You are already a member of this community.",
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

        const { error } =
          await supabase
            .from(
              "community_members"
            )
            .delete()
            .eq(
              "community_id",
              input.communityId
            )
            .eq(
              "user_id",
              user.id
            );

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