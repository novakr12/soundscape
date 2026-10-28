import type { Metadata } from "next";
import { requireUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Export · Soundscape" };

export default async function ExportPage() {
  await requireUserId();

  return (
    <>
      <h1>Export your plays</h1>
      <p className="muted">
        Download every play you have, oldest first. The JSON file can be imported again with{" "}
        <code>npm run import:json</code>, and the CSV opens in any spreadsheet.
      </p>
      <div className="export-buttons">
        {(["json", "csv"] as const).map((format) => (
          <form key={format} action="/api/export" method="get">
            <input type="hidden" name="format" value={format} />
            <button type="submit">Download {format.toUpperCase()}</button>
          </form>
        ))}
      </div>
    </>
  );
}
