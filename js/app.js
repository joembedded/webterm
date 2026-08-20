"use strict";

const BAUD_RATE = 115200;
const MAX_TIME_MS = 999999;

const connectButton = document.querySelector("#connect-button");
const clearButton = document.querySelector("#clear-button");
const sendForm = document.querySelector("#send-form");
const sendButton = document.querySelector("#send-button");
const commandInput = document.querySelector("#command-input");
const history = document.querySelector("#history");
const statusElement = document.querySelector("#status");

let port = null;
let reader = null;
let readLoop = null;
let commandStartedAt = performance.now();
let currentReceiveLine = null;
let pendingCarriageReturn = false;

function elapsedMilliseconds() {
  return Math.min(MAX_TIME_MS, Math.max(0, Math.round(performance.now() - commandStartedAt)));
}

function formatTime(milliseconds) {
  return String(milliseconds).padStart(6, "0");
}

function scrollToLatest() {
  history.scrollTop = history.scrollHeight;
}

// Hier generell Zeile anfuegen 
function createLine(type, text, direction) {
  const line = document.createElement("div");
  line.className = `line ${type}`;

  const time = document.createElement("span");
  time.className = "timestamp";
  const timestamp = type === "sent" ? 0 : elapsedMilliseconds();
  time.textContent = `[${formatTime(timestamp)}]`;

  const marker = document.createElement("span");
  marker.className = "direction";
  marker.textContent = direction;

  const content = document.createElement("span");
  content.className = "content";
  content.textContent = text;

  line.append(time, marker, content);
  history.append(line);
  scrollToLatest();
  return line;
}

function addSystemLine(text) {
  createLine("system", text, "·");
}

function appendReceivedCharacter(character) {
  if (!currentReceiveLine) {
    currentReceiveLine = createLine("received", "", "<");
  }

  currentReceiveLine.querySelector(".content").textContent += character;
}

function finishReceivedLine() {
  if (!currentReceiveLine) {
    currentReceiveLine = createLine("received", "", "<");
  }

  currentReceiveLine = null;
  scrollToLatest();
}

function processReceivedText(text) {
  for (const character of text) {
    if (pendingCarriageReturn) {
      finishReceivedLine();
      pendingCarriageReturn = false;

      if (character === "\n") {
        continue;
      }
    }

    if (character === "\r") {
      pendingCarriageReturn = true;
    } else if (character === "\n") {
      finishReceivedLine();
    } else {
      appendReceivedCharacter(character);
    }
  }

  scrollToLatest();
}

function setConnected(connected) {
  connectButton.textContent = connected ? "Trennen" : "Port verbinden";
  commandInput.disabled = !connected;
  sendButton.disabled = !connected;
  statusElement.classList.toggle("connected", connected);
  statusElement.textContent = connected
    ? `Verbunden · ${BAUD_RATE} Baud`
    : `Nicht verbunden · ${BAUD_RATE} Baud`;

  if (connected) {
    commandInput.focus();
  }
}

async function readSerialData() {
  const decoder = new TextDecoder();
  reader = port.readable.getReader();

  try {
    // Das ist der kontinuierliche Read-Loop - START
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      if (value) {
        processReceivedText(decoder.decode(value, { stream: true }));
      }
    }
    // Read-Loop - ENDE

    const remainingText = decoder.decode();
    if (remainingText) {
      processReceivedText(remainingText);
    }
  } catch (error) {
    if (error.name !== "NetworkError") {
      addSystemLine(`Lesefehler: ${error.message}`);
    }
  } finally {
    reader.releaseLock();
    reader = null;
  }
}

async function connect() {
  if (!("serial" in navigator)) {
    addSystemLine("Web Serial wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden.");
    return;
  }

  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: BAUD_RATE });
    setConnected(true);
    addSystemLine(`Serielle Verbindung mit ${BAUD_RATE} Baud geöffnet.`);
    readLoop = readSerialData();
  } catch (error) {
    port = null;
    if (error.name !== "NotFoundError") {
      addSystemLine(`Verbindung fehlgeschlagen: ${error.message}`);
    }
  }
}

async function disconnect() {
  try {
    if (reader) {
      await reader.cancel();
    }

    if (readLoop) {
      await readLoop;
    }

    if (port) {
      await port.close();
    }
  } catch (error) {
    addSystemLine(`Trennen fehlgeschlagen: ${error.message}`);
  } finally {
    port = null;
    readLoop = null;
    currentReceiveLine = null;
    pendingCarriageReturn = false;
    setConnected(false);
  }
}

async function sendCommand(command) {
  if (!port?.writable || command.length === 0) {
    return;
  }

  commandStartedAt = performance.now();
  currentReceiveLine = null;
  pendingCarriageReturn = false;
  createLine("sent", command, ">");

  const writer = port.writable.getWriter();
  try {
    await writer.write(new TextEncoder().encode(`${command}\r\n`));
  } catch (error) {
    addSystemLine(`Senden fehlgeschlagen: ${error.message}`);
  } finally {
    writer.releaseLock();
  }
}

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  if (port) {
    await disconnect();
  } else {
    await connect();
  }
  connectButton.disabled = false;
});

clearButton.addEventListener("click", () => {
  history.replaceChildren();
  currentReceiveLine = null;
  pendingCarriageReturn = false;
});

sendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const command = commandInput.value;

  if (!command) {
    return;
  }

  commandInput.value = "";
  await sendCommand(command);
  commandInput.focus();
});

navigator.serial?.addEventListener("disconnect", (event) => {
  if (event.target === port) {
    addSystemLine("Das serielle Gerät wurde getrennt.");
    void disconnect();
  }
});

if (!("serial" in navigator)) {
  connectButton.disabled = true;
  statusElement.textContent = "Web Serial nicht verfügbar · Chrome oder Edge verwenden";
}
