import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppShell,
  Badge,
  Button,
  Card,
  CopyButton,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure, useLocalStorage } from '@mantine/hooks';
import {
  IconCards,
  IconCopy,
  IconDeviceGamepad2,
  IconLink,
  IconPlayerPlay,
  IconQuestionMark,
  IconRefresh,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import { Peer } from 'peerjs';

const SUITS = ['C', 'D', 'H', 'S'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const GAME_VARIANTS = {
  four: {
    key: 'four',
    name: 'Four-card Golf',
    subtitle: 'Fast two-by-two table with two cards known up front.',
    rows: 2,
    columns: 2,
    opening: 'Each player has four face-down cards in a 2 x 2 grid and privately views two before play starts.',
    initialKnown: 2,
    showOwnHidden: false,
  },
  memoryFour: {
    key: 'memoryFour',
    name: 'Four-card Memory Golf',
    subtitle: 'Two cards known up front, locked face-up replacements, Jack scores 0.',
    rows: 2,
    columns: 2,
    opening: 'Each player has four face-down cards; two are privately shown to their owner before play starts.',
    initialKnown: 2,
    showOwnHidden: false,
    lockRevealedCards: true,
    discardRequiresReveal: true,
    pairCancellation: true,
    jackZero: true,
    kingZero: false,
  },
  six: {
    key: 'six',
    name: 'Six-card Golf',
    subtitle: 'Classic two-by-three table with two cards known up front.',
    rows: 2,
    columns: 3,
    opening: 'Each player has six face-down cards in a 2 x 3 grid and privately views two before play starts.',
    initialKnown: 2,
    showOwnHidden: false,
  },
  nine: {
    key: 'nine',
    name: 'Nine-card Golf',
    subtitle: 'Larger three-by-three table with two cards known up front.',
    rows: 3,
    columns: 3,
    opening: 'Each player has nine face-down cards in a 3 x 3 grid and privately views two before play starts.',
    initialKnown: 2,
    showOwnHidden: false,
  },
};
const DEFAULT_VARIANT = GAME_VARIANTS.six;
const DEFAULT_PLAYER_NAME = 'Player 1';

function cardId(rank, suit) {
  return `${rank}${suit}`;
}

function cardImage(card, back = false) {
  const cardName = back || !card ? 'Blue_Back' : `${card.rank}${card.suit}`;
  return `${import.meta.env.BASE_URL}assets/cards/${cardName}.svg`;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createDeck() {
  return shuffle(SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: cardId(rank, suit), rank, suit }))));
}

function cardValue(card, variant = DEFAULT_VARIANT) {
  if (!card) return 0;
  if (card.rank === 'J' && variant.jackZero) return 0;
  if (card.rank === 'K' && variant.kingZero !== false) return 0;
  if (card.rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  const numericValue = Number(card.rank);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function scoreCards(cards, variant = DEFAULT_VARIANT) {
  const safeCards = Array.isArray(cards) ? cards.filter(Boolean) : [];
  if (variant.pairCancellation) {
    const cardsByRank = safeCards.reduce(
      (groups, card) => ({
        ...groups,
        [card.rank]: [...(groups[card.rank] || []), card],
      }),
      {},
    );
    return Object.values(cardsByRank).reduce((total, rankCards) => {
      const unpairedCount = rankCards.length % 2;
      return total + unpairedCount * cardValue(rankCards[0], variant);
    }, 0);
  }

  return Array.from({ length: variant.columns }).reduce((total, _, column) => {
    const columnCards = Array.from({ length: variant.rows }, (__, row) => cards?.[row * variant.columns + column]).filter(Boolean);
    const cancels = columnCards.length > 1 && columnCards.every((card) => card.rank === columnCards[0].rank);
    return cancels ? total : total + columnCards.reduce((columnTotal, card) => columnTotal + cardValue(card, variant), 0);
  }, 0);
}

function visibleScore(player, variant = DEFAULT_VARIANT, revealAll = false) {
  if (!player?.cards) return 0;
  const cards = revealAll ? player.cards : player.cards.map((card, index) => (player.revealed[index] ? card : null));
  return scoreCards(cards, variant);
}

function averageCardValue(variant = DEFAULT_VARIANT) {
  const total = RANKS.reduce((sum, rank) => sum + cardValue({ rank }, variant), 0);
  return total / RANKS.length;
}

function botKnowsCard(player, index) {
  return Boolean(player?.revealed?.[index] || player?.known?.[index]);
}

function botVisibleCards(player) {
  return player.cards.map((card, index) => (botKnowsCard(player, index) ? card : null));
}

function estimatedBotScore(player, variant = DEFAULT_VARIANT) {
  const hiddenUnknownCount = player.cards.filter((_, index) => !botKnowsCard(player, index)).length;
  return scoreCards(botVisibleCards(player), variant) + hiddenUnknownCount * averageCardValue(variant);
}

function findBotReplacement(player, drawnCard, variant = DEFAULT_VARIANT) {
  const beforeScore = estimatedBotScore(player, variant);
  const candidates = player.cards
    .map((card, index) => ({ card, index, known: botKnowsCard(player, index), revealed: player.revealed[index] }))
    .filter((item) => !variant.lockRevealedCards || !item.revealed)
    .map((item) => {
      const nextCards = botVisibleCards(player);
      nextCards[item.index] = drawnCard;
      const remainingUnknownCount = player.cards.filter((_, index) => index !== item.index && !botKnowsCard(player, index)).length;
      const afterScore = scoreCards(nextCards, variant) + remainingUnknownCount * averageCardValue(variant);
      return {
        index: item.index,
        improvement: beforeScore - afterScore,
        known: item.known,
        oldValue: item.known ? cardValue(item.card, variant) : averageCardValue(variant),
      };
    })
    .sort((a, b) => b.improvement - a.improvement || b.oldValue - a.oldValue);

  return candidates[0] || null;
}

function createsUnpairedThirdKnownRank(player, drawnCard, targetIndex) {
  if (!drawnCard) return false;
  const matchingKnownCards = player.cards.filter((card, index) => index !== targetIndex && botKnowsCard(player, index) && card.rank === drawnCard.rank);
  return matchingKnownCards.length % 2 === 0 && matchingKnownCards.length >= 2;
}

function chooseBotReveal(player, variant = DEFAULT_VARIANT) {
  return player.cards
    .map((card, index) => ({ index, known: botKnowsCard(player, index), value: cardValue(card, variant), revealed: player.revealed[index] }))
    .filter((item) => !item.revealed)
    .sort((a, b) => Number(b.known) - Number(a.known) || a.value - b.value)[0];
}

function dealPlayers(players, variant = DEFAULT_VARIANT, matchConfig = {}, previousMatch = null) {
  const deck = createDeck();
  const cardCount = variant.rows * variant.columns;
  const nextPlayers = players.map((player) => ({
    ...player,
    cards: Array.from({ length: cardCount }, () => deck.pop()),
    revealed: Array.from({ length: cardCount }, () => false),
    known: Array.from({ length: cardCount }, (_, index) => index < (variant.initialKnown || 0)),
    ready: player.type === 'bot' || !variant.initialKnown,
    knocked: false,
  }));
  const preview = variant.initialKnown > 0;
  const discard = [deck.pop()];
  return {
    players: nextPlayers,
    deck,
    discard,
    drawn: null,
    turn: 0,
    status: preview ? 'preview' : 'playing',
    log: preview ? ['Review your two known cards, then hide them to start.'] : [`${nextPlayers[0].name} starts the round.`],
    round: crypto.randomUUID(),
    variantKey: variant.key,
    match: {
      roundNumber: (previousMatch?.roundNumber || 0) + 1,
      roundLimit: matchConfig.roundLimit || previousMatch?.roundLimit || 9,
      scoreLimit: matchConfig.scoreLimit || previousMatch?.scoreLimit || 100,
      totalScores:
        previousMatch?.totalScores ||
        Object.fromEntries(nextPlayers.map((player) => [player.id, 0])),
      roundScores: {},
      complete: false,
    },
  };
}

function playerNameOrDefault(name, fallback = DEFAULT_PLAYER_NAME) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed || fallback;
}

function nextAvailablePlayerName(usedNames) {
  let number = 1;
  while (usedNames.has(`Player ${number}`)) number += 1;
  return `Player ${number}`;
}

function distinctPlayerNames(players) {
  const usedNames = new Set();
  const baseCounts = new Map();

  return players.map((player) => {
    const fallbackName = player.type === 'bot' ? player.name : nextAvailablePlayerName(usedNames);
    const originalName = playerNameOrDefault(player.name, fallbackName);
    const defaultMatch = originalName.match(/^Player\s+\d+$/i);
    const baseName = defaultMatch ? 'Player' : originalName;
    let nextName;

    if (defaultMatch) {
      nextName = nextAvailablePlayerName(usedNames);
    } else {
      const count = (baseCounts.get(baseName) || 0) + 1;
      baseCounts.set(baseName, count);
      nextName = count === 1 && !usedNames.has(baseName) ? baseName : `${baseName} #${count}`;
      while (usedNames.has(nextName)) {
        const nextCount = (baseCounts.get(baseName) || count) + 1;
        baseCounts.set(baseName, nextCount);
        nextName = `${baseName} #${nextCount}`;
      }
    }

    usedNames.add(nextName);
    return { ...player, name: nextName };
  });
}

function defaultPlayer(name, id = 'host', type = 'human', fallbackName = DEFAULT_PLAYER_NAME) {
  return {
    id,
    name: playerNameOrDefault(name, fallbackName),
    type,
    cards: [],
    revealed: [],
    known: [],
    ready: false,
    knocked: false,
  };
}

function tablePlayersFromGame(game) {
  return game.players.map((player) => defaultPlayer(player.name, player.id, player.type));
}

function resolveRoundScores(players, variant = DEFAULT_VARIANT) {
  return Object.fromEntries(players.map((player) => [player.id, scoreCards(player.cards, variant)]));
}

function hiddenCard(playerId, index) {
  return { id: `hidden-${playerId}-${index}`, hidden: true };
}

function canViewerSeeCard(game, player, index, viewerId, variant = DEFAULT_VARIANT) {
  return (
    player.revealed[index] ||
    game.status === 'complete' ||
    (player.id === viewerId && game.status === 'preview' && !player.ready && player.known?.[index]) ||
    (player.id === viewerId && variant.showOwnHidden !== false)
  );
}

function gameForPlayer(game, viewerId, variant = DEFAULT_VARIANT) {
  if (!game) return game;
  const currentPlayer = game.players[game.turn];
  return {
    ...game,
    deck: Array.from({ length: game.deck.length }, (_, index) => hiddenCard('deck', index)),
    drawn: currentPlayer?.id === viewerId || game.status === 'complete' ? game.drawn : null,
    players: game.players.map((player) => ({
      ...player,
      cards: player.cards.map((card, index) => (canViewerSeeCard(game, player, index, viewerId, variant) ? card : hiddenCard(player.id, index))),
    })),
  };
}

function parseSharedGameId(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.searchParams.get('game') || value.trim();
  } catch {
    return value.trim();
  }
}

export default function App() {
  const [mode, setMode] = useState('computer');
  const [botCount, setBotCount] = useState(1);
  const [onlineBotCount, setOnlineBotCount] = useState(0);
  const [roundLimit, setRoundLimit] = useState(9);
  const [scoreLimit, setScoreLimit] = useState(100);
  const [playerName, setPlayerName] = useLocalStorage({ key: 'golf-player-name', defaultValue: DEFAULT_PLAYER_NAME });
  const [rulesOpened, rulesModal] = useDisclosure(false);
  const [selectedGameKey, setSelectedGameKey] = useState('');
  const selectedGame = GAME_VARIANTS[selectedGameKey] || null;
  const [game, setGame] = useState(null);
  const [network, setNetwork] = useState({ role: 'offline', peerId: '', connections: [], status: 'No online table yet.', lobbyOpen: false });
  const [joinCode, setJoinCode] = useState('');
  const [invitedGameId, setInvitedGameId] = useState('');
  const [setupVisible, setSetupVisible] = useState(true);
  const peerRef = useRef(null);
  const connectionsRef = useRef([]);
  const autoJoinRef = useRef(false);
  const gameRef = useRef(null);
  const lobbyOpenRef = useRef(false);

  const activeVariant = GAME_VARIANTS[game?.variantKey] || selectedGame || DEFAULT_VARIANT;
  const currentPlayer = game?.players[game.turn];
  const activeLobbyConnections = network.connections.filter((conn) => conn.open !== false);
  const joinedPlayers = activeLobbyConnections.map((conn, index) => conn.metadata?.name || `Player ${index + 2}`);
  const invitedBots = Array.from({ length: onlineBotCount }, (_, index) => `Computer ${index + 1}`);
  const lobbySeatCount = joinedPlayers.length + invitedBots.length;
  const matchConfig = { roundLimit, scoreLimit };
  const localPlayerName = playerNameOrDefault(playerName);
  const isLocalPlayer = (player) => {
    if (!player) return false;
    if (mode !== 'online') return player.type === 'human';
    if (network.role === 'host') return player.id === 'host';
    if (network.role === 'guest') return player.id === network.peerId;
    return false;
  };
  const localCanAct = game?.status === 'playing' && isLocalPlayer(currentPlayer);
  const visibleDrawn = game?.drawn && (isLocalPlayer(currentPlayer) || game.status === 'complete');
  const gameLink =
    network.role === 'host' && network.peerId
      ? `${window.location.origin}${window.location.pathname}?game=${network.peerId}&variant=${activeVariant.key}`
      : '';

  useEffect(() => {
    const gameId = new URLSearchParams(window.location.search).get('game');
    const variantKey = new URLSearchParams(window.location.search).get('variant');
    if (variantKey && GAME_VARIANTS[variantKey]) {
      setSelectedGameKey(variantKey);
    }
    if (gameId) {
      setMode('online');
      setJoinCode(gameId);
      setInvitedGameId(gameId);
      setSetupVisible(false);
    }
  }, []);

  useEffect(() => {
    if (!invitedGameId || autoJoinRef.current || network.role !== 'offline') return;
    autoJoinRef.current = true;
    joinGame(invitedGameId);
  }, [invitedGameId, network.role]);

  useEffect(() => {
    if (mode !== 'online' || invitedGameId || network.role !== 'offline') return;
    hostGame();
  }, [mode, invitedGameId, network.role]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (mode !== 'online' || network.role !== 'host' || !game) return;
    broadcastState(game);
  }, [game, localPlayerName, mode, network.role]);

  useEffect(() => {
    if (mode === 'online') return;
    setGame((prev) => {
      if (!prev) return prev;
      let renamed = false;
      const players = prev.players.map((player) => {
        if (player.type !== 'human' || player.name === localPlayerName) return player;
        renamed = true;
        return { ...player, name: localPlayerName };
      });
      return renamed ? { ...prev, players } : prev;
    });
  }, [localPlayerName, mode, network.peerId, network.role]);

  useEffect(() => {
    if (!selectedGame || game || invitedGameId) return;
    const players = distinctPlayerNames([defaultPlayer(localPlayerName, 'host', 'human'), defaultPlayer('Computer 1', 'bot-1', 'bot')]);
    setGame(dealPlayers(players, selectedGame, matchConfig));
  }, [game, localPlayerName, invitedGameId, matchConfig, selectedGame]);

  useEffect(() => {
    if (currentPlayer?.type !== 'bot' || game?.status !== 'playing') return;
    const timeout = window.setTimeout(() => runBotTurn(), 700);
    return () => window.clearTimeout(timeout);
  }, [currentPlayer?.id, game?.status, game?.drawn, game?.pendingReveal]);

  function appendLog(message) {
    setGame((prev) => (prev ? { ...prev, log: [message, ...prev.log].slice(0, 30) } : prev));
  }

  function chooseGame(variantKey) {
    const variant = GAME_VARIANTS[variantKey];
    if (!variant) return;
    closeNetwork();
    setSelectedGameKey(variantKey);
    setMode('computer');
    setSetupVisible(true);
    const players = distinctPlayerNames([defaultPlayer(localPlayerName, 'host', 'human'), defaultPlayer('Computer 1', 'bot-1', 'bot')]);
    setGame(dealPlayers(players, variant, matchConfig));
  }

  function startComputerGame() {
    closeNetwork();
    const humans = [defaultPlayer(localPlayerName, 'host', 'human')];
    const bots = Array.from({ length: botCount }, (_, index) => defaultPlayer(`Computer ${index + 1}`, `bot-${index + 1}`, 'bot'));
    setMode('computer');
    setGame(dealPlayers(distinctPlayerNames([...humans, ...bots]), activeVariant, matchConfig));
  }

  function startHostedRound() {
    if (network.role !== 'host') {
      appendLog('Host an online game before starting the table.');
      return;
    }
    lobbyOpenRef.current = false;
    setNetwork((prev) => ({ ...prev, lobbyOpen: false, status: 'Table started. New players cannot join.' }));
    const activeConnections = connectionsRef.current.filter((conn) => conn.open !== false);
    const remotePlayers = activeConnections.map((conn, index) =>
      defaultPlayer(conn.metadata?.name, conn.peer, 'remote', `Player ${index + 2}`),
    );
    const botPlayers = Array.from({ length: onlineBotCount }, (_, index) => defaultPlayer(`Computer ${index + 1}`, `bot-${index + 1}`, 'bot'));
    const players = distinctPlayerNames([defaultPlayer(localPlayerName, 'host', 'human'), ...remotePlayers, ...botPlayers]);
    setGame(dealPlayers(players, activeVariant, matchConfig));
    setSetupVisible(false);
  }

  function startNextRound() {
    if (!game || game.status !== 'complete' || game.match?.complete) {
      if (mode === 'online') startHostedRound();
      else startComputerGame();
      return;
    }
    setGame(dealPlayers(distinctPlayerNames(tablePlayersFromGame(game)), activeVariant, matchConfig, game.match));
  }

  function hostGame() {
    closeNetwork();
    const peer = new Peer();
    peerRef.current = peer;
    lobbyOpenRef.current = true;
    setNetwork({ role: 'host', peerId: '', connections: [], status: 'Opening host table...', lobbyOpen: true });
    peer.on('open', (id) => setNetwork((prev) => ({ ...prev, peerId: id, status: 'Host table is open. Share the game link.' })));
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (!lobbyOpenRef.current) {
          conn.send({ type: 'rejected', reason: 'This table has already started.' });
          conn.close();
          setNetwork((prev) => ({ ...prev, status: 'A player tried to join after the table started.' }));
          return;
        }
        connectionsRef.current = [...connectionsRef.current, conn];
        setNetwork((prev) => ({
          ...prev,
          connections: [...connectionsRef.current],
          status: `${connectionsRef.current.length} player${connectionsRef.current.length === 1 ? '' : 's'} in the lobby.`,
        }));
      });
      conn.on('data', (message) => handleRemoteMessage(conn, message));
      conn.on('close', () => {
        connectionsRef.current = connectionsRef.current.filter((item) => item.peer !== conn.peer);
        setNetwork((prev) => ({
          ...prev,
          connections: connectionsRef.current,
          status: prev.lobbyOpen
            ? `${connectionsRef.current.length} player${connectionsRef.current.length === 1 ? '' : 's'} in the lobby.`
            : 'A player disconnected.',
        }));
      });
    });
    peer.on('error', (error) => setNetwork((prev) => ({ ...prev, status: error.message })));
  }

  function joinGame(value = joinCode) {
    const remoteId = parseSharedGameId(value);
    if (!remoteId) return;
    closeNetwork();
    const peer = new Peer();
    peerRef.current = peer;
    lobbyOpenRef.current = false;
    setNetwork({ role: 'guest', peerId: '', connections: [], status: 'Connecting to host...', lobbyOpen: false });
    peer.on('open', (id) => {
      const conn = peer.connect(remoteId, { metadata: { name: localPlayerName } });
      connectionsRef.current = [conn];
      setNetwork((prev) => ({ ...prev, peerId: id, connections: [conn] }));
      conn.on('open', () => {
        setNetwork((prev) => ({ ...prev, status: 'Connected. Waiting for the host to start.' }));
        setSetupVisible(false);
        conn.send({ type: 'hello', name: localPlayerName });
      });
      conn.on('data', (message) => {
        if (message.type === 'rejected') {
          setNetwork((prev) => ({ ...prev, status: message.reason || 'This table is no longer accepting players.' }));
          setSetupVisible(true);
          conn.close();
          return;
        }
        if (message.type === 'state') {
          setGame(message.game);
          setSetupVisible(false);
        }
      });
      conn.on('error', (error) => setNetwork((prev) => ({ ...prev, status: error.message })));
    });
  }

  function closeNetwork() {
    connectionsRef.current.forEach((conn) => conn.close());
    connectionsRef.current = [];
    peerRef.current?.destroy();
    peerRef.current = null;
    lobbyOpenRef.current = false;
    setNetwork({ role: 'offline', peerId: '', connections: [], status: 'No online table yet.', lobbyOpen: false });
  }

  function handleRemoteMessage(conn, message) {
    if (message.type === 'hello') {
      conn.metadata = { ...(conn.metadata || {}), name: message.name };
      setNetwork((prev) => ({
        ...prev,
        connections: [...connectionsRef.current],
        status: `${connectionsRef.current.length} player${connectionsRef.current.length === 1 ? '' : 's'} in the lobby.`,
      }));
    }
    if (message.type === 'action') applyAction(message.action, conn.peer);
  }

  function sendState(conn, fullGame) {
    if (!conn.open || !fullGame) return;
    const variant = GAME_VARIANTS[fullGame.variantKey] || DEFAULT_VARIANT;
    conn.send({ type: 'state', game: gameForPlayer(fullGame, conn.peer, variant), hostName: localPlayerName });
  }

  function broadcastState(fullGame) {
    connectionsRef.current.forEach((conn) => sendState(conn, fullGame));
  }

  function applyAction(action, actorId = 'host') {
    if (mode === 'online' && network.role === 'guest') {
      connectionsRef.current[0]?.send({ type: 'action', action });
      return;
    }
    setGame((prev) => reduceGame(prev, action, actorId));
  }

  function reduceGame(prev, action, actorId) {
    if (!prev) return prev;
    const variant = GAME_VARIANTS[prev.variantKey] || DEFAULT_VARIANT;
    if (action.type === 'ready') {
      const next = structuredClone(prev);
      const readyPlayer = next.players.find((player) => player.id === actorId);
      if (!readyPlayer || readyPlayer.ready) return prev;
      readyPlayer.ready = true;
      const allReady = next.players.every((player) => player.ready);
      next.status = allReady ? 'playing' : 'preview';
      next.log = allReady
        ? [`${next.players[next.turn].name}'s turn.`, `${readyPlayer.name} is ready.`, ...next.log]
        : [`${readyPlayer.name} is ready.`, ...next.log];
      return next;
    }

    const active = prev.players[prev.turn];
    if (!active || active.id !== actorId) return prev;
    const next = structuredClone(prev);
    const player = next.players[next.turn];
    const logName = player.name;

    if (action.type === 'drawDeck' && !next.drawn && next.pendingReveal === undefined) {
      next.drawn = next.deck.pop();
      next.log = [`${logName} draws from the deck.`, ...next.log];
      return next;
    }

    if (action.type === 'drawDiscard' && !next.drawn && next.discard.length && next.pendingReveal === undefined) {
      next.drawn = next.discard.pop();
      next.log = [`${logName} takes the discard.`, ...next.log];
      return next;
    }

    if (action.type === 'replace' && next.drawn && Number.isInteger(action.index)) {
      if (variant.lockRevealedCards && player.revealed[action.index]) return prev;
      const old = player.cards[action.index];
      player.cards[action.index] = next.drawn;
      player.revealed[action.index] = true;
      player.known[action.index] = true;
      next.discard.push(old);
      next.drawn = null;
      advanceTurn(next, `${logName} replaces a card.`);
      return next;
    }

    if (action.type === 'discardDrawn' && next.drawn) {
      next.discard.push(next.drawn);
      next.drawn = null;
      if (variant.discardRequiresReveal && player.revealed.includes(false)) {
        next.pendingReveal = next.turn;
        next.log = [`${logName} discards the drawn card and must reveal one hidden card.`, ...next.log];
        return next;
      }
      advanceTurn(next, `${logName} discards the drawn card.`);
      return next;
    }

    if (action.type === 'reveal' && !next.drawn && Number.isInteger(action.index)) {
      if (next.pendingReveal !== undefined && next.pendingReveal !== next.turn) return prev;
      if (player.revealed[action.index]) return prev;
      player.revealed[action.index] = true;
      player.known[action.index] = true;
      if (next.pendingReveal !== undefined) {
        delete next.pendingReveal;
      }
      advanceTurn(next, `${logName} reveals a card.`);
      return next;
    }

    return prev;
  }

  function advanceTurn(next, log) {
    if (!next.players[next.turn].revealed.includes(false)) {
      next.players[next.turn].knocked = true;
    }
    const allDone = next.players.every((player) => !player.revealed.includes(false));
    if (allDone) {
      const variant = GAME_VARIANTS[next.variantKey] || DEFAULT_VARIANT;
      const roundScores = resolveRoundScores(next.players, variant);
      const totalScores = Object.fromEntries(
        next.players.map((player) => [player.id, (next.match?.totalScores?.[player.id] || 0) + roundScores[player.id]]),
      );
      const scoreLimitReached = next.match?.scoreLimit && Object.values(totalScores).some((score) => score >= next.match.scoreLimit);
      const roundLimitReached = next.match?.roundLimit && next.match.roundNumber >= next.match.roundLimit;
      next.status = 'complete';
      next.match = {
        ...(next.match || {}),
        roundScores,
        totalScores,
        complete: Boolean(scoreLimitReached || roundLimitReached),
      };
      next.log = [
        next.match.complete ? `Game complete. Lowest total score wins.` : `Round complete. Lowest total score wins after all rounds.`,
        log,
        ...next.log,
      ];
      return;
    }
    next.turn = (next.turn + 1) % next.players.length;
    next.log = [log, `${next.players[next.turn].name}'s turn.`, ...next.log];
  }

  function runBotTurn() {
    if (!game) return;
    const player = game.players[game.turn];
    if (!player || player.type !== 'bot') return;
    if (game.pendingReveal === game.turn) {
      const reveal = chooseBotReveal(player, activeVariant);
      if (reveal) applyAction({ type: 'reveal', index: reveal.index }, player.id);
      return;
    }

    if (game.drawn) {
      const target = findBotReplacement(player, game.drawn, activeVariant);
      applyAction(target && target.improvement > 0.25 ? { type: 'replace', index: target.index } : { type: 'discardDrawn' }, player.id);
      return;
    }

    const topDiscard = game.discard.at(-1);
    const discardTarget = topDiscard ? findBotReplacement(player, topDiscard, activeVariant) : null;
    const shouldTakeDiscard =
      discardTarget && discardTarget.improvement > 0.75 && !createsUnpairedThirdKnownRank(player, topDiscard, discardTarget.index);
    applyAction({ type: shouldTakeDiscard ? 'drawDiscard' : 'drawDeck' }, player.id);
  }

  const standings = useMemo(
    () =>
      game
        ? [...game.players]
            .map((player) => ({
              ...player,
              roundScore: game.match?.roundScores?.[player.id] ?? scoreCards(player.cards, activeVariant),
              totalScore: game.match?.totalScores?.[player.id] ?? 0,
            }))
            .sort((a, b) => a.totalScore - b.totalScore)
        : [],
    [activeVariant, game],
  );

  const rulesModalNode = (
    <Modal opened={rulesOpened} onClose={rulesModal.close} title="Golf rules" size="lg" centered>
      <Stack>
        <Text>
          Golf is a low-score card game. Each player has a face-down grid. On your turn, draw from the deck or take the top discard, then either
          replace one of your grid cards or discard the drawn card. You can reveal a hidden card instead of drawing.
        </Text>
        <Text>
          Card values: King is 0, Ace is 1, number cards are face value, and Jack/Queen are 10. When every card in a vertical column has the same
          rank, that whole column scores 0.
        </Text>
        <Text>
          Four-card Memory Golf uses a different score card: Jack is 0, Ace is 1, King and Queen are 10, and any same-rank pair scores 0.
          In that variant, two face-down cards are privately shown to their owner before play starts, discarded draws must be followed by revealing
          one hidden card, and face-up cards are locked.
        </Text>
        <Text>
          A full game is played across the configured number of rounds, or until any player reaches the configured total score limit. Round scores
          are added to each player's match total, and the lowest total wins.
        </Text>
        <Stack gap="xs">
          {Object.values(GAME_VARIANTS).map((variant) => (
            <Paper key={variant.key} withBorder p="sm" radius="sm">
              <Text fw={700}>{variant.name}</Text>
              <Text size="sm" c="dimmed">
                {variant.opening}{' '}
                {variant.pairCancellation ? 'Same-rank pairs cancel to 0.' : `A matching column of ${variant.rows} cards cancels to 0.`}
              </Text>
            </Paper>
          ))}
        </Stack>
      </Stack>
    </Modal>
  );

  if (!selectedGame && !invitedGameId) {
    return (
      <main className="tableShell chooserShell">
        <section className="gameChooser">
          <Group justify="space-between" align="start">
            <div>
              <Text className="eyebrow">Choose a game</Text>
              <Title order={1}>Golf Cards</Title>
              <Text c="rgba(255,255,255,0.78)" mt="xs">
                Pick a table layout, then play against computers or host an online table.
              </Text>
            </div>
            <Button variant="default" leftSection={<IconQuestionMark size={18} />} onClick={rulesModal.open}>
              Rules
            </Button>
          </Group>
          <div className="choiceGrid">
            {Object.values(GAME_VARIANTS).map((variant) => (
              <button key={variant.key} className="gameChoice" onClick={() => chooseGame(variant.key)}>
                <Text fw={800}>{variant.name}</Text>
                <Text size="sm">{variant.subtitle}</Text>
                <Badge variant="light" mt="md">
                  {variant.rows} x {variant.columns}
                </Badge>
              </button>
            ))}
          </div>
        </section>
        {rulesModalNode}
      </main>
    );
  }

  return (
    <AppShell navbar={{ width: setupVisible ? 350 : 0, breakpoint: 'md' }} padding={0}>
      <AppShell.Navbar className={`sidebar ${setupVisible ? '' : 'sidebarHidden'}`}>
        <Stack gap="md">
          <Button variant="default" onClick={() => setSetupVisible(false)}>
            Show table
          </Button>
          <div>
            <Group gap="xs" align="center">
              <IconCards size={34} stroke={1.7} />
              <Title order={1}>Golf Cards</Title>
            </Group>
            <Text c="dimmed" mt="xs">
              {activeVariant.name} with computer opponents and PeerJS tables.
            </Text>
          </div>

          <Card withBorder>
            <Group justify="space-between" mb="sm">
              <Title order={2}>Game</Title>
              <Button size="xs" variant="default" leftSection={<IconQuestionMark size={15} />} onClick={rulesModal.open}>
                Rules
              </Button>
            </Group>
            <SegmentedControl
              fullWidth
              value={activeVariant.key}
              onChange={chooseGame}
              data={Object.values(GAME_VARIANTS).map((variant) => ({
                label: variant.rows * variant.columns,
                value: variant.key,
              }))}
            />
            <Text size="sm" c="dimmed" mt="sm">
              {activeVariant.name}: {activeVariant.subtitle}
            </Text>
          </Card>

          <Card withBorder>
            <Title order={2} mb="sm">
              Player
            </Title>
            <TextInput
              label="Your name"
              value={playerName}
              placeholder={DEFAULT_PLAYER_NAME}
              maxLength={28}
              onChange={(event) => setPlayerName(event.currentTarget.value)}
              onBlur={() => setPlayerName(localPlayerName)}
            />
          </Card>

          <Card withBorder>
            <Title order={2} mb="sm">
              Table
            </Title>
            <Group grow mb="md">
              <NumberInput
                label="Rounds"
                min={1}
                max={36}
                value={roundLimit}
                onChange={(value) => setRoundLimit(value || 9)}
              />
              <NumberInput
                label="Score limit"
                min={1}
                max={500}
                value={scoreLimit}
                onChange={(value) => setScoreLimit(value || 100)}
              />
            </Group>
            <SegmentedControl
              fullWidth
              value={mode}
              onChange={setMode}
              data={[
                { label: 'Computer', value: 'computer' },
                { label: 'Online', value: 'online' },
              ]}
            />
            {mode === 'computer' ? (
              <Stack mt="md">
                <NumberInput label="Computer players" min={1} max={3} value={botCount} onChange={(value) => setBotCount(value || 1)} />
                <Button leftSection={<IconPlayerPlay size={18} />} onClick={startComputerGame}>
                  Start game
                </Button>
              </Stack>
            ) : (
              <Stack mt="md">
                <Group grow>
                  <Button leftSection={<IconDeviceGamepad2 size={18} />} onClick={hostGame}>
                    Host game
                  </Button>
                  <Button variant="default" leftSection={<IconLink size={18} />} onClick={joinGame}>
                    Join
                  </Button>
                </Group>
                <TextInput label="Game link or id" value={joinCode} onChange={(event) => setJoinCode(event.currentTarget.value)} />
                {network.role === 'host' && (
                  <NumberInput
                    label="Computer players"
                    min={0}
                    max={3}
                    value={onlineBotCount}
                    onChange={(value) => setOnlineBotCount(value || 0)}
                  />
                )}
                <Button
                  variant="default"
                  leftSection={<IconUsers size={18} />}
                  disabled={network.role !== 'host' || !network.peerId || !network.lobbyOpen || lobbySeatCount === 0}
                  onClick={startHostedRound}
                >
                  Start hosted table
                </Button>
                {network.role === 'host' && (
                  <Paper withBorder p="sm" radius="sm">
                    <Group justify="space-between" mb={lobbySeatCount ? 'xs' : 0}>
                      <Text size="sm" fw={700}>
                        Lobby
                      </Text>
                      <Badge variant="light">{lobbySeatCount} invited</Badge>
                    </Group>
                    {lobbySeatCount ? (
                      <Stack gap={4}>
                        {joinedPlayers.map((name, index) => (
                          <Text key={`${name}-${index}`} size="sm" c="dimmed">
                            {name}
                          </Text>
                        ))}
                        {invitedBots.map((name, index) => (
                          <Text key={`${name}-${index}`} size="sm" c="dimmed">
                            {name}
                          </Text>
                        ))}
                      </Stack>
                    ) : (
                      <Text size="sm" c="dimmed">
                        Waiting for players to join.
                      </Text>
                    )}
                  </Paper>
                )}
                {gameLink && (
                  <Paper withBorder p="sm" radius="sm">
                    <Text size="sm" fw={700}>
                      Invite link
                    </Text>
                    <Text className="shareLink" size="xs" c="dimmed">
                      {gameLink}
                    </Text>
                    <CopyButton value={gameLink}>
                      {({ copied, copy }) => (
                        <Button mt="xs" fullWidth variant="default" leftSection={<IconCopy size={18} />} onClick={copy}>
                          {copied ? 'Copied invite link' : 'Copy invite link'}
                        </Button>
                      )}
                    </CopyButton>
                  </Paper>
                )}
                <Text size="sm" c="dimmed">
                  {network.status}
                </Text>
              </Stack>
            )}
          </Card>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main className="tableShell">
        <Group justify="space-between" align="start" className="tableHeader">
          <div>
            <Text className="eyebrow">Round</Text>
            <Title order={2}>
              {game?.match?.complete
                ? 'Game complete'
                : game?.status === 'complete'
                  ? 'Round complete'
                  : `${currentPlayer?.name || 'Ready'} to act`}
            </Title>
            <Text c="rgba(255,255,255,0.74)" size="sm">
              {activeVariant.name}
              {game?.match ? ` · Round ${game.match.roundNumber} of ${game.match.roundLimit} · Score limit ${game.match.scoreLimit}` : ''}
            </Text>
          </div>
          <Group>
            {!setupVisible && (
              <Button variant="default" onClick={() => setSetupVisible(true)}>
                Setup
              </Button>
            )}
            <CopyButton value={gameLink}>
              {({ copied, copy }) => (
                <Button variant="default" leftSection={<IconCopy size={18} />} disabled={!gameLink} onClick={copy}>
                  {copied ? 'Copied' : 'Copy game link'}
                </Button>
              )}
            </CopyButton>
            <Button
              variant="default"
              leftSection={<IconRefresh size={18} />}
              disabled={mode === 'online' && network.role === 'guest'}
              onClick={startNextRound}
            >
              {game?.status === 'complete' && !game?.match?.complete ? 'Next round' : 'New game'}
            </Button>
          </Group>
        </Group>

        {game && (
          <Paper className="standings" withBorder p="md">
            <Group justify="space-between" mb="xs">
              <Text fw={800}>Match totals</Text>
              <Text size="sm" c="dimmed">
                Lowest score wins
              </Text>
            </Group>
            <Group gap="sm">
              {standings.map((player, index) => (
                <Badge key={player.id} size="lg" color={index === 0 ? 'yellow' : 'gray'} variant={index === 0 ? 'filled' : 'light'}>
                  {player.name}: {player.totalScore}
                  {game.status === 'complete' ? ` (+${player.roundScore})` : ''}
                </Badge>
              ))}
            </Group>
          </Paper>
        )}

        {game?.status === 'preview' && (
          <Paper className="standings" withBorder p="md">
            <Group justify="space-between" align="center">
              <div>
                <Text fw={800}>Memorize your shown cards</Text>
                <Text size="sm" c="dimmed">
                  Hide them when you are ready. Normal play starts after every player is ready.
                </Text>
              </div>
              {game.players.some((player) => isLocalPlayer(player) && !player.ready) && (
                <Button onClick={() => applyAction({ type: 'ready' })}>Hide cards and start</Button>
              )}
            </Group>
          </Paper>
        )}

        <section className="drawArea" aria-label="Draw area">
          <button
            className="pile deckPile"
            style={{ backgroundImage: `url(${cardImage(null, true)})` }}
            onClick={() => localCanAct && applyAction({ type: 'drawDeck' })}
            disabled={!localCanAct || Boolean(game?.drawn)}
            aria-label="Draw from deck"
          />
          <button
            className="pile discardPile"
            style={{ backgroundImage: `url(${cardImage(game?.discard.at(-1))})` }}
            onClick={() => localCanAct && applyAction({ type: 'drawDiscard' })}
            disabled={!localCanAct || Boolean(game?.drawn) || !game?.discard.length}
            aria-label="Draw from discard"
          />
          <div className="drawnSlot">
            <Text className="eyebrow">In hand</Text>
            <button
              className={`cardButton ${visibleDrawn ? '' : 'placeholder'}`}
              style={{ backgroundImage: visibleDrawn ? `url(${cardImage(game.drawn)})` : undefined }}
              aria-label="Drawn card"
              disabled
            />
            <Button
              size="xs"
              variant="default"
              leftSection={<IconTrash size={15} />}
              disabled={!localCanAct || !game?.drawn}
              onClick={() => applyAction({ type: 'discardDrawn' })}
            >
              Discard
            </Button>
          </div>
        </section>

        <section className="players">
          {game?.players.map((player, playerIndex) => (
            <Paper key={player.id} className={`playerBoard ${playerIndex === game.turn ? 'active' : ''}`} withBorder>
              <Group justify="space-between" mb="sm">
                <div>
                  <Group gap="xs">
                    <Title order={3}>{player.name}</Title>
                    {isLocalPlayer(player) && <Badge color="yellow">Your hand</Badge>}
                  </Group>
                  <Text size="sm" c="rgba(255,255,255,0.74)">
                    {isLocalPlayer(player) ? 'You' : player.type === 'bot' ? 'Computer' : player.type === 'remote' ? 'Remote player' : 'Opponent'}
                  </Text>
                </div>
                <Badge color="gray" size="lg">
                  {game?.status === 'complete' ? 'Final' : 'Shown'}: {visibleScore(player, activeVariant, game?.status === 'complete')} · Total:{' '}
                  {game?.match?.totalScores?.[player.id] || 0}
                </Badge>
              </Group>
              <div className="cardGrid" style={{ '--grid-columns': activeVariant.columns }}>
                {player.cards.map((card, index) => {
                  const visible =
                    player.revealed[index] ||
                    game?.status === 'complete' ||
                    (game?.status === 'preview' && isLocalPlayer(player) && !player.ready && player.known?.[index]) ||
                    (isLocalPlayer(player) && activeVariant.showOwnHidden !== false);
                  const cardIsLocked = activeVariant.lockRevealedCards && player.revealed[index];
                  const selectable =
                    localCanAct &&
                    playerIndex === game?.turn &&
                    (game?.pendingReveal === game?.turn ? !player.revealed[index] : game?.drawn ? !cardIsLocked : !player.revealed[index]);
                  return (
                    <button
                      key={`${card.id}-${index}`}
                      className={`cardButton ${selectable ? 'selectable' : ''}`}
                      style={{ backgroundImage: `url(${cardImage(card, !visible)})` }}
                      disabled={!selectable}
                      aria-label={`${player.name} card ${index + 1}`}
                      onClick={() => applyAction(game?.drawn ? { type: 'replace', index } : { type: 'reveal', index })}
                    />
                  );
                })}
              </div>
            </Paper>
          ))}
        </section>

        <Card withBorder className="logPanel">
          <Group justify="space-between">
            <Title order={2}>Table log</Title>
            <Badge variant="light">{game?.deck.length || 0} cards left</Badge>
          </Group>
          <Divider my="sm" />
          <ScrollArea h={150}>
            <Stack gap={5}>
              {(game?.log || []).map((item, index) => (
                <Text key={`${item}-${index}`} size="sm" c="dimmed">
                  {item}
                </Text>
              ))}
            </Stack>
          </ScrollArea>
        </Card>
      </AppShell.Main>

      {rulesModalNode}
    </AppShell>
  );
}
