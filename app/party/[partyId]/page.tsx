import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isPartyId, partyFor } from "@/lib/parties";
import { currentUserId } from "@/lib/session";
import JoinButton from "./join-button";

export const metadata: Metadata = { title: "Listening party · Soundscape" };

type Props = { params: Promise<{ partyId: string }> };

export default async function PartyPage({ params }: Props) {
  const { partyId } = await params;
  const userId = await currentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/party/${partyId}`)}`);
  const party = isPartyId(partyId) ? await partyFor(partyId, userId) : null;
  if (!party) {
    return (
      <>
        <h1>Listening party</h1>
        <p className="muted">This listening party has ended.</p>
        <p>
          <Link href="/">Back home</Link>
        </p>
      </>
    );
  }
  const listening = party.guests.length === 1 ? "1 person is" : `${party.guests.length} people are`;
  return (
    <>
      <h1>{party.role === "host" ? "Your listening party" : `${party.host}'s listening party`}</h1>
      <p className="muted">
        {party.track ? (
          <>
            Playing {party.track.title} by {party.track.artist}.
          </>
        ) : (
          "Nothing is playing right now."
        )}{" "}
        {party.guests.length > 0 && `${listening} listening along.`}
      </p>
      <JoinButton id={party.id} host={party.host} />
    </>
  );
}
