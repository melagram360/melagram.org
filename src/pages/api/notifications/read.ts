import type { APIRoute } from "astro";
import { createClient } from "../../../lib/supabase";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

export const POST: APIRoute = async ({
  request,
  cookies,
  locals,
}) => {
  const supabase = createClient({
    request,
    cookies,
    env: (locals as any).runtime?.env,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: any;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const notificationId = String(
    body?.notificationId || ""
  ).trim();

  if (!notificationId) {
    return json(
      { error: "Notification ID is required" },
      400
    );
  }

  const { data: notification, error: lookupError } =
    await supabase
      .from("notifications")
      .select("id")
      .eq("id", notificationId)
      .eq("recipient_id", user.id)
      .maybeSingle();

  if (lookupError) {
    return json(
      { error: lookupError.message },
      500
    );
  }

  if (!notification) {
    return json(
      { error: "Notification not found" },
      404
    );
  }

  const { error: updateError } = await supabase
    .from("notifications")
    .update({
      is_read: true,
    })
    .eq("id", notificationId)
    .eq("recipient_id", user.id);

  if (updateError) {
    return json(
      { error: updateError.message },
      500
    );
  }

  return json({
    success: true,
  });
};