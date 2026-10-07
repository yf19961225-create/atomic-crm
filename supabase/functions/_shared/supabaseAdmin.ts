import { serverSupabaseTarget } from "./deploymentTarget.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { createClient } from "jsr:@supabase/supabase-js@2";

const target = serverSupabaseTarget((key) => Deno.env.get(key));
if (!target) throw new Error("Supabase deployment target unavailable");

export const supabaseAdmin: SupabaseClient = createClient(
  target,
  // TODO - When Supabase finally provides the project's secret key to the functions, we'll need to use it here instead of the service role key.
  // See https://supabase.com/docs/guides/functions/auth#get-api-details
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
