import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { categorizeReview, generateReply } from "@/lib/ai-worker";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: review, error: fetchError } = await supabase
    .from("reviews")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  try {
    const categorization = await categorizeReview(
      review.review_text ?? "",
      review.country_code
    );

    const reply = await generateReply(
      review.review_text ?? "",
      review.rating,
      review.country_code,
      review.match_confidence ?? "unverified"
    );

    const { data: updated, error: updateError } = await supabase
      .from("reviews")
      .update({
        review_text_cz: categorization.translation_cz,
        ai_sentiment: categorization.sentiment,
        ai_category: categorization.category,
        response_draft: reply,
      })
      .eq("id", id)
      .select("*, order:orders(*)")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
