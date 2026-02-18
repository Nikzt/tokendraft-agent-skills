function parseArgs(argv: string[]): { websocketUrl: string; userId: string } {
  let websocketUrl = "";
  let userId = "";

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--websocketUrl" && argv[i + 1]) {
      websocketUrl = argv[i + 1];
      i++;
    } else if (argv[i] === "--userId" && argv[i + 1]) {
      userId = argv[i + 1];
      i++;
    }
  }

  if (!websocketUrl || !userId) {
    console.error(
      "Usage: bun run tokendraft-daemon.ts --websocketUrl <url> --userId <id>"
    );
    process.exit(1);
  }

  return { websocketUrl, userId };
}

const args = parseArgs(process.argv.slice(2));

function connect() {
  const url = `${args.websocketUrl}?userId=${args.userId}`;
  console.log(`Connecting to ${url}...`);

  const ws = new WebSocket(url);

  ws.onopen = () => {
    console.log("Connected to draft manager");
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
          "--message",
          "It's your turn! Tell the user it's your turn",
        ]);
      }
    } catch (e) {
      console.error("Failed to parse message:", e);
    }
  };

  ws.onclose = () => {
    console.log("Connection closed. Reconnecting in 3s...");
    setTimeout(connect, 3000);
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    ws.close();
  };
}

connect();
