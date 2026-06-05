# Golf Cards

A React, Vite, and Mantine browser-based six-card Golf game. It supports:

- Local play against one to three computer players.
- PeerJS browser-to-browser tables with shareable game links.
- A simple saved player name, defaulting to `Player 1`.
- Card art copied from `GitHub/playcard-redux/src/assets/cards/`.

## Run

Install dependencies and run Vite:

```sh
npm install
npm run dev
```

Then open the printed localhost URL.

## Multiplayer

Click **Online**, then **Host game**. Share the generated game link with other players. Joining browsers connect to the host through PeerJS. The host owns the authoritative game state and broadcasts updates after every action.
