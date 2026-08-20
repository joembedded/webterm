# WebUART Terminal

Ein kleines, dependency-freies Terminal für die Web Serial API.

## Start

Web Serial funktioniert aus Sicherheitsgründen nur in einem sicheren Kontext. Dieses Projekt wird mit der VS-Code-Erweiterung [Live Server](https://github.com/ritwickdey/vscode-live-server) gestartet:

1. Öffne den Projektordner in Visual Studio Code.
2. Installiere bei Bedarf die Erweiterung **Live Server**.
3. Öffne `index.html` und klicke unten in der VS-Code-Statusleiste auf **Go Live**. Alternativ kannst du im Editor **Open with Live Server** wählen.
4. Öffne die von Live Server bereitgestellte Adresse in Chrome oder Edge.
5. Klicke auf **Port verbinden** und wähle im Browser-Dialog den gewünschten seriellen Port aus.

Die serielle Verbindung wird mit **115200 Baud** geöffnet.

> Der Browser erlaubt Webseiten nicht, einen seriellen Port automatisch auszuwählen. Der gewünschte Port muss daher im geschützten Browser-Dialog bestätigt werden.

Kommandos werden mit `CRLF` abgeschlossen. Enter in der Eingabezeile und der Button **Senden** verhalten sich gleich. Zeitstempel werden mit sechs Stellen von `000000` bis `999999` Millisekunden dargestellt.

## Struktur

```text
webterm/
├── index.html
├── css/
│   └── styles.css
├── js/
│   └── app.js
└── readme.md
```

