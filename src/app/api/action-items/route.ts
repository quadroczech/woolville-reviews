import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const country = searchParams.get("country");

  // Severity is sorted client-side (varchar ordering here would put "high" before
  // "low" alphabetically but "medium" last, not high/medium/low).
  let query = supabase
    .from("country_action_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && status !== "all") query = query.eq("status", status);
  if (country && country !== "all") query = query.eq("country_code", country);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
