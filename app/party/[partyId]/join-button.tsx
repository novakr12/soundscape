"use client";

import { JoinParty } from "@/components/listening-party";
import { usePlayer } from "@/components/player";

export default function JoinButton({ id, host }: { id: string; host: string }) {
  const { party } = usePlayer();
  return <JoinParty id={id} host={host} controls={party} />;
}
