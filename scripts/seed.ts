/**
 * scripts/seed.ts
 *
 * Seeds a demo event with all four moment types for local development.
 * Run with: npm run seed
 *
 * SC7: App runs locally end-to-end with npm run dev + seed.
 */

// Bootstrap env before importing local modules
process.env.PULSE_DB_MODE = "local";
process.env.PULSE_TABLE_NAME = process.env.PULSE_TABLE_NAME ?? "Pulse";
process.env.AWS_REGION = "us-east-1";
process.env.DYNAMODB_LOCAL_ENDPOINT =
  process.env.DYNAMODB_LOCAL_ENDPOINT ?? "http://localhost:8000";
process.env.SHARD_COUNT = "10";
process.env.JUDGING_WINDOW_DAYS = "30";
process.env.REACTION_TTL_SEC = "600";
process.env.PRESENCE_TTL_SEC = "15";
process.env.OPS_WRITES_TTL_SEC = "60";
process.env.OPS_WINDOW_SEC = "5";

// We import after env setup so the singleton picks up the right config
const { createEvent, launchMoment, registerParticipant } = await import(
  "../src/lib/dynamo/repository.js"
);
const { generateHostToken, hashToken } = await import(
  "../src/lib/auth/hostToken.js"
);

async function main(): Promise<void> {
  console.log("Seeding demo event on DynamoDB Local...");

  const hostToken = generateHostToken();
  const hostTokenHash = hashToken(hostToken);
  const eventId = "DEMO0001";
  const code = "DEMO01";

  // Create event
  const event = await createEvent({
    eventId,
    title: "Pulse Demo Event — Live!",
    code,
    hostTokenHash,
  });

  console.log(`Event created: ${event.eventId} (code: ${event.code})`);
  console.log(`Host token: ${hostToken}`);
  console.log(`Host URL: http://localhost:3000/host/${event.eventId}/${hostToken}`);
  console.log(`Audience URL: http://localhost:3000/e/${event.code}`);

  // Seed some participants
  for (let i = 0; i < 5; i++) {
    await registerParticipant({
      eventId,
      participantId: `u_seed_${i}`,
      displayName: `Audience Member ${i + 1}`,
    });
  }
  console.log("Registered 5 demo participants.");

  // Launch an MC poll moment (will be the active moment)
  const pollMoment = await launchMoment({
    eventId,
    momentId: "m_poll_001",
    momentType: "MC",
    question: "Which DynamoDB feature are you most excited about?",
    options: ["Write Sharding", "Global Tables", "TTL", "Streams"],
  });

  console.log(`Launched MC poll: ${pollMoment.momentId}`);
  console.log("\nSeed complete! Try:");
  console.log(`  1. Open http://localhost:3000/e/${event.code} in a browser`);
  console.log(`  2. Enter any display name to join`);
  console.log(`  3. Vote on the active poll`);
  console.log(`  4. Open the host console to see live results:`);
  console.log(`     http://localhost:3000/host/${event.eventId}/${hostToken}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
