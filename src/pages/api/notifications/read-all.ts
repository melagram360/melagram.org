import type { APIRoute } from "astro";
import { createClient } from "../../../lib/supabase";

export const POST: APIRoute = async ({
  request,
  cookies,
}) => {
  try {
    const supabase = createClient({
      request,
      cookies,
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "You must be signed in.",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
      })
      .eq("recipient_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.error(
        "Mark notifications read error:",
        error
      );

      return new Response(
        JSON.stringify({
          success: false,
          message:
            "We couldn't mark your notifications as read.",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error(
      "Notification read-all error:",
      error
    );

    return new Response(
      JSON.stringify({
        success: false,
        message: "Something went wrong.",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};