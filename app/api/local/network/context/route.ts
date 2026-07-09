import { NextResponse } from "next/server";
import { buildContextNetwork } from "@/src/lib/network/network.service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "";
  return NextResponse.json(await buildContextNetwork(query));
}
