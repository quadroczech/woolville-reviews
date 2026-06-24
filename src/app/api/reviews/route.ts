import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = request.nextUrl;

  const status = searchParams.get("status");
  const platform = searchParams.get("platform");
  const country = searchParams.get("country");

  let query = supabase
    .from("reviews")
    .select("*, order:orders(*)")
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }
  if (platform && platform !== "all") {
    query = query.eq("platform_source", platform);
  }
  if (country && country !== "all") {
    query = query.eq("country_code", country);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
