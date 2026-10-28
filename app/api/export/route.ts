import { type ExportFormat, exportLines } from "@/lib/export";
import { currentUserId } from "@/lib/session";
import { localDay } from "@/lib/time";

export const dynamic = "force-dynamic";

const TYPES: Record<ExportFormat, string> = {
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Log in to export your plays" }, { status: 401 });

  const format: ExportFormat = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const lines = exportLines(userId, format);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await lines.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
    async cancel() {
      await lines.return(undefined);
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": TYPES[format],
      "Content-Disposition": `attachment; filename="soundscape-${userId}-${localDay(new Date())}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
