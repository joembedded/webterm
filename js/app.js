/* 
* WeUART Terminal
* ----------------
* Terminal für serielle Kommunikation mit Mikrocontrollern über Web Serial API 
*  
* 
* (C)JoEmbedded.de
*/

"use strict";

const BAUD_RATE = 115200;
const MAX_TIME_MS = 999999;
const MAX_DISPLAYED_LINES = 100;
const NAMED_CTRL_CHARS = new Map([
  [0x00, "\\0"],
  [0x07, "\\a"],
  [0x08, "\\b"],
  [0x09, "\\t"],
  [0x0a, "\\n"],
  [0x0b, "\\v"],
  [0x0c, "\\f"],
  [0x0d, "\\r"],
  [0x1b, "\\e"],
]);
const SCRIPTS = [
  { name: "Wecken" },
  { name: "Netz-Test" },
  { name: "Batterie" },
];

const connectButton = document.querySelector("#connect-button");
const clearButton = document.querySelector("#clear-button");
const sendForm = document.querySelector("#send-form");
const sendButton = document.querySelector("#send-button");
const commandInput = document.querySelector("#command-input");
const history = document.querySelector("#history");
const statusElement = document.querySelector("#status");
const showCtrlCharsCheckbox = document.querySelector("#show-ctrl-chars");
const noScrollCheckbox = document.querySelector("#no-scroll");
const scriptMenu = document.querySelector("#script-menu");
const scriptMenuButton = document.querySelector("#script-menu-button");
const scriptList = document.querySelector("#script-list");

let port = null;
let reader = null;
let readLoop = null;
let commandStartedAt = performance.now();
let currentReceiveLine = null;
let pendingCarriageReturn = false;
let nextLineId = 0;
const lineIdFifo = [];

function elapsedMilliseconds() {
  return Math.min(MAX_TIME_MS, Math.max(0, Math.round(performance.now() - commandStartedAt)));
}

function formatTime(milliseconds) {
  return String(milliseconds).padStart(6, "0");
}

function isAsciiControlCharacter(character) {
  const codePoint = character.codePointAt(0);
  return codePoint <= 0x1f || codePoint === 0x7f;
}

function formatControlCharacter(character) {
  const codePoint = character.codePointAt(0);
  return NAMED_CTRL_CHARS.get(codePoint)
    ?? `\\x${codePoint.toString(16).toUpperCase().padStart(2, "0")}`;
}

function scriptsInit() {
  scriptList.replaceChildren();

  for (const script of SCRIPTS) {
    const button = document.createElement("button");
    button.className = "script-button";
    button.type = "button";
    button.disabled = true;
    button.textContent = script.name;
    button.addEventListener("click", () => {
      alert(script.name);
      scriptMenu.open = false;
    });
    scriptList.append(button);
  }
}

function setScriptsEnabled(enabled) {
  scriptMenuButton.setAttribute("aria-disabled", String(!enabled));

  for (const button of scriptList.querySelectorAll(".script-button")) {
    button.disabled = !enabled;
  }

  if (!enabled) {
    scriptMenu.open = false;
  }
}

function scrollToLatest() {
  if (noScrollCheckbox.checked) {
    return;
  }

  history.scrollTop = history.scrollHeight;
}

function limitDisplayedLines() {
  while (lineIdFifo.length > MAX_DISPLAYED_LINES) {
    const oldestLineId = lineIdFifo.shift();
    const oldestLine = document.getElementById(oldestLineId);

    if (oldestLine === currentReceiveLine) {
      currentReceiveLine = null;
    }

    oldestLine?.remove();
  }
}

// Hier generell Zeile anfuegen 
function createLine(type, text, direction) {
  const line = document.createElement("div");
  line.id = `history-line-${nextLineId++}`;
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
  lineIdFifo.push(line.id);
  limitDisplayedLines();
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
      pendingCarriageReturn = false;

      if (character === "\n") {
        if (showCtrlCharsCheckbox.checked) {
          appendReceivedCharacter(formatControlCharacter(character));
        }
        finishReceivedLine();
        continue;
      }

      finishReceivedLine();
    }

    if (character === "\r") {
      pendingCarriageReturn = true;
      if (showCtrlCharsCheckbox.checked) {
        appendReceivedCharacter(formatControlCharacter(character));
      }
    } else if (character === "\n") {
      if (showCtrlCharsCheckbox.checked) {
        appendReceivedCharacter(formatControlCharacter(character));
      }
      finishReceivedLine();
    } else if (isAsciiControlCharacter(character)) {
      if (showCtrlCharsCheckbox.checked) {
        appendReceivedCharacter(formatControlCharacter(character));
      }
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
  setScriptsEnabled(connected);
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
  lineIdFifo.length = 0;
  nextLineId = 0;
  currentReceiveLine = null;
  pendingCarriageReturn = false;
});

noScrollCheckbox.addEventListener("change", () => {
  if (!noScrollCheckbox.checked) {
    scrollToLatest();
  }
});

scriptMenuButton.addEventListener("click", (event) => {
  if (scriptMenuButton.getAttribute("aria-disabled") === "true") {
    event.preventDefault();
  }
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

scriptsInit();

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
