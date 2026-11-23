"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { Review } from "@shared/review-types";
import { ReviewSchema } from "../lib/schema";

export default function Page() {
  const { data } = useQuery({
    queryKey: ["review"],
    queryFn: async (): Promise<Review> => ReviewSchema.parse(await (await fetch("/api/review")).json()),
  });
  return (
    <main>
      <Link href="/reviews">Reviews</Link>
      <p>{data?.summary} · {format(new Date(), "yyyy-MM-dd")}</p>
    </main>
  );
}
