import { AudienceView } from "./AudienceView";

type Props = {
  params: Promise<{ code: string }>;
};

/**
 * /e/[code] — Live audience participation view.
 * DESIGN §3 — bright, mobile-first, SSE-driven.
 * Server wrapper — the actual interactive view is a Client Component.
 */
export default async function AudiencePage({ params }: Props) {
  const { code } = await params;
  return <AudienceView code={code.toUpperCase()} />;
}
