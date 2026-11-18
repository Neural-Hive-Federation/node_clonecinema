import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request } from "express";
import { config } from "./config";

export interface AuthUser {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
}

let adminClient: SupabaseClient | null = null;

/** Cliente con service role: salta RLS. Solo se usa en el servidor. */
export function supabaseAdmin(): SupabaseClient | null {
  if (!config.supabase.enabled) return null;
  if (!adminClient) {
    adminClient = createClient(config.supabase.url!, config.supabase.serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return adminClient;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/** Valida el JWT contra Supabase Auth y devuelve el usuario real. */
export async function resolveUser(req: Request): Promise<AuthUser | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const client = supabaseAdmin();
  if (!client) return null;

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;

  const meta = (data.user.user_metadata || {}) as Record<string, unknown>;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    fullName: (meta.full_name as string) || (meta.name as string) || null,
    avatarUrl: (meta.avatar_url as string) || null,
  };
}
