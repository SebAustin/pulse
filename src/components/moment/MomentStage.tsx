"use client";

import type { Snapshot } from "@/lib/dynamo/types";
import { McPoll } from "./McPoll";
import { WordCloud } from "./WordCloud";
import { ReactionBurst } from "./ReactionBurst";
import { Trivia } from "./Trivia";

type Props = {
  snapshot: Snapshot;
  isHostVariant: boolean;
  participantId?: string;
  eventId: string;
  onCloseMoment?: () => void;
  hostToken?: string;
};

/**
 * MomentStage — presentational switch routing to the correct moment component.
 * PLAN §2, DESIGN §4.
 */
export function MomentStage({
  snapshot,
  isHostVariant,
  participantId,
  eventId,
  onCloseMoment,
  hostToken,
}: Props) {
  const moment = snapshot.activeMoment;
  if (!moment) return null;

  const commonProps = {
    eventId,
    momentId: moment.momentId,
    momentStatus: moment.status,
    isHostVariant,
    participantId,
    onClose: onCloseMoment,
    hostToken,
  };

  if (moment.momentType === "MC") {
    return (
      <McPoll
        {...commonProps}
        question={moment.question ?? ""}
        options={moment.options ?? []}
        tally={moment.tally ?? {}}
      />
    );
  }

  if (moment.momentType === "WORDCLOUD") {
    return (
      <WordCloud
        {...commonProps}
        prompt={moment.prompt ?? ""}
        words={moment.words ?? []}
      />
    );
  }

  if (moment.momentType === "REACTION") {
    return (
      <ReactionBurst
        {...commonProps}
        tally={moment.tally ?? {}}
      />
    );
  }

  if (moment.momentType === "TRIVIA") {
    return (
      <Trivia
        {...commonProps}
        question={moment.question ?? ""}
        options={moment.options ?? []}
        tally={moment.tally ?? {}}
        correctIndex={moment.correctIndex}
        timeLimitSec={moment.timeLimitSec}
        activatedAt={moment.activatedAt}
        leaderboard={snapshot.leaderboard}
      />
    );
  }

  return null;
}
