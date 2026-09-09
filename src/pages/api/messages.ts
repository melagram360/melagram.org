import type { APIRoute } from "astro";
import { createClient } from "../../lib/supabase";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ request, cookies, url, locals }) => {
  const supabase = createClient({
    request,
    cookies,
    env: (locals as any).runtime?.env,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json({ error: "Unauthorized" }, 401);

  const mode = url.searchParams.get("mode") || "conversations";
  const q = (url.searchParams.get("q") || "").trim();
  const conversationId = url.searchParams.get("conversationId");

  if (mode === "users") {
    if (q.length < 2) return json({ users: [] });

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .neq("id", user.id)
      .limit(12);

    if (error) return json({ error: error.message }, 500);
    return json({ users: data ?? [] });
  }

  if (mode === "messages" && conversationId) {
    const { data: participant } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!participant) return json({ error: "Not a participant" }, 403);

    const { data, error } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at, read_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) return json({ error: error.message }, 500);

    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .neq("sender_id", user.id)
      .is("read_at", null);

    return json({ messages: data ?? [] });
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  if (membershipError) return json({ error: membershipError.message }, 500);

  const ids = (memberships ?? []).map((row) => row.conversation_id);
  if (!ids.length) return json({ conversations: [] });

  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, direct_key, created_at, updated_at")
    .in("id", ids)
    .order("updated_at", { ascending: false });

  if (error) return json({ error: error.message }, 500);

  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .in("conversation_id", ids);

  const otherIds = [...new Set(
    (participants ?? [])
      .filter((row) => row.user_id !== user.id)
      .map((row) => row.user_id)
  )];

  const { data: profiles } = otherIds.length
    ? await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .in("id", otherIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const participantMap = new Map<string, string>();

  for (const row of participants ?? []) {
    if (row.user_id !== user.id) participantMap.set(row.conversation_id, row.user_id);
  }

  const results = (conversations ?? []).map((conversation) => ({
    ...conversation,
    otherUser: profileMap.get(participantMap.get(conversation.id) || "") ?? null,
  }));

  return json({ conversations: results });
};

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const supabase = createClient({
    request,
    cookies,
    env: (locals as any).runtime?.env,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const action = body?.action;

  if (action === "start") {
    const recipientId = String(body.recipientId || "");
    if (!recipientId || recipientId === user.id) {
      return json({ error: "Invalid recipient" }, 400);
    }

    const { data: recipient } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", recipientId)
      .maybeSingle();

    if (!recipient) return json({ error: "Member not found" }, 404);

    const directKey = [user.id, recipientId].sort().join(":");

    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("direct_key", directKey)
      .maybeSingle();

    if (existing) return json({ conversationId: existing.id });

    // Create the direct conversation atomically through a SECURITY DEFINER RPC.
    // This avoids RLS policy recursion/participant-insert issues while still
    // verifying the signed-in user inside the database function.
    const { data: conversationId, error: conversationError } = await supabase.rpc(
      "create_direct_conversation",
      { p_recipient_id: recipientId }
    );

    if (conversationError || !conversationId) {
      return json(
        { error: conversationError?.message || "Could not create conversation" },
        500
      );
    }

    return json({ conversationId }, 201);
  }

  if (action === "send") {
    const conversationId = String(body.conversationId || "");
    const message = String(body.message || "").trim();

    if (!conversationId || !message) {
      return json({ error: "Message cannot be empty" }, 400);
    }

    if (message.length > 5000) {
      return json({ error: "Message is too long" }, 400);
    }

    const { data: participant } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!participant) return json({ error: "Not a participant" }, 403);

    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body: message,
      })
      .select("id, conversation_id, sender_id, body, created_at, read_at")
      .single();

    if (error) return json({ error: error.message }, 500);

    return json({ message: data }, 201);
  }

  return json({ error: "Unknown action" }, 400);
};
