function parseArgs(argv: string[]): { websocketUrl: string; userId: string; to: string } {
  let websocketUrl = "";
  let userId = "";
  let to = "";

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--websocketUrl" && argv[i + 1]) {
      websocketUrl = argv[i + 1];
      i++;
    } else if (argv[i] === "--userId" && argv[i + 1]) {
      userId = argv[i + 1];
      i++;
    } else if (argv[i] === "--to" && argv[i + 1]) {
      to = argv[i + 1];
      i++;
    }
  }

  if (!websocketUrl || !userId || !to) {
    console.error(
      "Usage: bun run tokendraft-daemon.ts --websocketUrl <url> --userId <id> --to <chatId>"
    );
    process.exit(1);
  }

  return { websocketUrl, userId, to };
}

const args = parseArgs(process.argv.slice(2));
const PING_INTERVAL_MS = 20_000;

function connect() {
  const url = `${args.websocketUrl}?userId=${args.userId}`;
  console.log(`Connecting to ${url}...`);

  const ws = new WebSocket(url);
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  ws.onopen = () => {
    console.log("Connected to TokenDraft API");
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, PING_INTERVAL_MS);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(String(event.data));
      console.log(`Received: ${data.type}`);

      if (data.type === "your_turn") {
        console.log("It's your turn! Notifying agent...");
        Bun.spawn([
          "openclaw",
          "agent",
          "--to",
          args.to,
          "--message",
          "It's your turn! Tell the user it's your turn",
        ]);
      }
    } catch {
      // Non-JSON message (e.g. pong) — ignore
    }
  };

  ws.onclose = () => {
    if (pingTimer) clearInterval(pingTimer);
    console.log("Connection closed. Reconnecting in 3s...");
    setTimeout(connect, 3000);
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    ws.close();
  };
}

connect();
