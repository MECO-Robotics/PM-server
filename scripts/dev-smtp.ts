import net from "node:net";

const host = process.env.SMTP_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.SMTP_PORT ?? 1025);
const serverName = process.env.SMTP_NAME?.trim() || "meco-local-smtp";

interface SessionState {
  buffer: string;
  collectingData: boolean;
  dataLines: string[];
  mailFrom: string | null;
  recipients: string[];
}

function writeLine(socket: net.Socket, line: string) {
  socket.write(`${line}\r\n`);
}

function writeReply(socket: net.Socket, code: number, lines: string[]) {
  if (lines.length === 0) {
    writeLine(socket, `${code} OK`);
    return;
  }

  lines.forEach((line, index) => {
    const separator = index === lines.length - 1 ? " " : "-";
    writeLine(socket, `${code}${separator}${line}`);
  });
}

function extractAddress(argument: string, label: "FROM" | "TO") {
  const bracketMatch = argument.match(new RegExp(`^${label}:\\s*<([^>]*)>`, "i"));
  if (bracketMatch?.[1]) {
    return bracketMatch[1].trim();
  }

  const plainMatch = argument.match(new RegExp(`^${label}:\\s*(.+)$`, "i"));
  return plainMatch?.[1]?.trim() ?? "";
}

function logMessage(session: SessionState) {
  const rawMessage = session.dataLines.join("\r\n");
  const codeMatch = rawMessage.match(/sign-in code is (\d{4,8})/i);

  console.log("");
  console.log(`[smtp] received message from ${session.mailFrom ?? "(unknown)"}`);
  console.log(
    `[smtp] recipients: ${session.recipients.length > 0 ? session.recipients.join(", ") : "(unknown)"}`,
  );
  if (codeMatch?.[1]) {
    console.log(`[smtp] sign-in code: ${codeMatch[1]}`);
  }
  console.log(rawMessage);
  console.log("[smtp] end message");
  console.log("");
}

const server = net.createServer((socket) => {
  socket.setEncoding("utf8");

  const session: SessionState = {
    buffer: "",
    collectingData: false,
    dataLines: [],
    mailFrom: null,
    recipients: [],
  };

  writeLine(socket, `220 ${serverName} ready`);

  socket.on("data", (chunk) => {
    session.buffer += chunk;

    while (true) {
      const newlineIndex = session.buffer.indexOf("\r\n");
      if (newlineIndex === -1) {
        return;
      }

      const line = session.buffer.slice(0, newlineIndex);
      session.buffer = session.buffer.slice(newlineIndex + 2);

      if (session.collectingData) {
        if (line === ".") {
          session.collectingData = false;
          logMessage(session);
          session.dataLines = [];
          writeReply(socket, 250, ["Message accepted"]);
          continue;
        }

        session.dataLines.push(line.startsWith("..") ? line.slice(1) : line);
        continue;
      }

      const trimmed = line.trim();
      if (trimmed.length === 0) {
        writeReply(socket, 500, ["Empty SMTP command"]);
        continue;
      }

      const [verb] = trimmed.split(/\s+/, 1);
      const upperVerb = verb.toUpperCase();
      const argument = trimmed.slice(verb.length).trim();

      if (upperVerb === "HELO" || upperVerb === "EHLO") {
        writeReply(socket, 250, [
          `${serverName}`,
          "SIZE 10485760",
          "8BITMIME",
          "SMTPUTF8",
        ]);
        continue;
      }

      if (upperVerb === "MAIL") {
        session.mailFrom = extractAddress(argument, "FROM");
        session.recipients = [];
        writeReply(socket, 250, ["Sender OK"]);
        continue;
      }

      if (upperVerb === "RCPT") {
        const recipient = extractAddress(argument, "TO");
        if (recipient.length > 0) {
          session.recipients.push(recipient);
        }

        writeReply(socket, 250, ["Recipient OK"]);
        continue;
      }

      if (upperVerb === "DATA") {
        session.collectingData = true;
        session.dataLines = [];
        writeLine(socket, "354 End data with <CR><LF>.<CR><LF>");
        continue;
      }

      if (upperVerb === "RSET") {
        session.collectingData = false;
        session.dataLines = [];
        session.mailFrom = null;
        session.recipients = [];
        writeReply(socket, 250, ["Reset state"]);
        continue;
      }

      if (upperVerb === "NOOP") {
        writeReply(socket, 250, ["OK"]);
        continue;
      }

      if (upperVerb === "QUIT") {
        writeLine(socket, "221 Bye");
        socket.end();
        return;
      }

      writeReply(socket, 502, ["Command not implemented"]);
    }
  });

  socket.on("error", (error) => {
    console.error("[smtp] socket error", error);
  });
});

server.on("error", (error) => {
  console.error("[smtp] server error", error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`[smtp] listening on smtp://${host}:${port}`);
});

function shutdown(signal: NodeJS.Signals) {
  console.log(`[smtp] received ${signal}, shutting down`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
