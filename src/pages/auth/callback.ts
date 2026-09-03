import type { APIRoute } from "astro";
import { createClient } from "../../lib/supabase";

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = createClient({
      request,
      cookies,
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return redirect("/");
    }
  }

  return redirect("/login?error=auth");
};