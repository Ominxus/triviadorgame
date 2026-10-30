# Trivia Realms Online

A complete two-player, room-code multiplayer edition of Trivia Realms. Each player joins on their own computer in a browser. No account or installation is required for players once you deploy the game.

## Features

- Private 6-character room codes and shareable invitation links
- Real-time synchronized map with 18 territories and 2 castles
- 96 trivia questions from 9 categories, chosen on the server
- Two campaign lengths: 30 or 42 turns
- 20-second server-controlled question timer
- Simultaneous private trivia answers in battles (no answer key sent before a result)
- One 50:50 hint per player, scores, castle shields, match winner, and rematches
- Automatic reconnection to the same seat after a browser refresh or temporary network interruption
- Automatic timer pause on disconnect, and resume when both players are online
- Mobile-friendly layout and keyboard shortcuts (1–4 for answers)

## Requirements

- Node.js 22 or newer, for hosting
- No third-party Node dependencies; `npm ci` works without downloading packages

## Run on your own computer

In Terminal, open the game folder and type:

```bash
npm start
```

Visit **http://localhost:3000** in your browser. To test both players, open the game in two tabs (or two different browsers). One creates the room; the other joins using the displayed code.

**Important:** `localhost` only works on your computer. For your friend to join from another home or network, you must put the server on a publicly reachable host, e.g. Render.

## Put the game online using Render

1. Create a new GitHub repository such as `trivia-realms-multiplayer`.
2. Upload all files from **this folder** to the root of the repository, including `public`, `server`, `package.json`, `package-lock.json`, and `render.yaml`. Alternatively, run `git init`, `git add .`, and `git commit -m "Add online Trivia Realms"`, then connect the new repo using the GitHub instructions.
3. Open https://dashboard.render.com, choose **New → Web Service**, and connect the repository.
4. Use **Language: Node**, **Build Command: `npm ci`**, **Start Command: `npm start`**, and a **Free** instance if available. `render.yaml` also contains these settings for a Render Blueprint.
5. After the service deploys, open the Render-provided `https://your-service.onrender.com` address. Player 1 creates a room and shares the **Copy invite link** with Player 2. Player 2 opens that URL on their own computer, enters their name and joins.
6. Once both players show as online, Player 1 presses **Begin the conquest**.

The front end and real-time WebSocket server are served together on the **same Render Web Service**. Do not deploy only `public/index.html` as a static site: real-time multiplayer will not work without the server.

## Testing

Run:

```bash
npm test
```

Tests cover the board, question bank, scoring, privacy of question keys, room creation, joining, real-time state synchronization, answering a shared round, and reconnection.

## Hosting and game-lifetime limits

The game uses **in-memory rooms**, with no database. Rooms and ongoing games are **not durable**: restarting, redeploying, or sleeping the Node process erases them. Empty rooms are cleaned up after 30 minutes offline; otherwise rooms are cleaned up after 3 hours without state activity. Active live play on Render's Free plan generally remains awake while WebSocket messages continue, but platform restarts can still occur. The host must keep **one server instance** running; the in-memory room design is **not** intended for load-balanced multi-instance deployment.

The code has basic server-side input validation, random room codes and private reconnect tokens. Room codes are invitations, **not** a full account authentication system. For a production/public game with persistent matchmaking and durable saves, you would add a database and an authentication layer.

## File structure

```
trivia-realms-multiplayer/
  public/
    index.html          Game page
    app.js              Browser UI and WebSocket client
    style.css           Responsive design
    favicon.svg
  server/
    index.js            HTTP and room/event server
    websocket.js        Built-in WebSocket protocol support
    game.js             Server-authoritative rules and scoring
    data.js             Territory map and question bank
  tests/
    game.test.js
    multiplayer.test.js
  package.json
  package-lock.json
  render.yaml
  README.md
```

## About the original game

Trivia Realms is an original fan-made trivia conquest game inspired by the broader genre of territory-based quiz games. It is not affiliated with Triviador.
