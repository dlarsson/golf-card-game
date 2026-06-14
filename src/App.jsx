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
import { defaultGame, gameModules } from './games';

const DEFAULT_PLAYER_NAME = 'Player 1';
const APP_COMMIT = __APP_COMMIT__;

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
  const [selectedGameModuleKey, setSelectedGameModuleKey] = useState(defaultGame.key);
  const [selectedGameKey, setSelectedGameKey] = useState('');
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

  const ACTIVE_GAME = gameModules[game?.gameKey || selectedGameModuleKey] || defaultGame;
  const GAME_VARIANTS = ACTIVE_GAME.variants;
  const DEFAULT_VARIANT = ACTIVE_GAME.defaultVariant;
  const selectedGame = GAME_VARIANTS[selectedGameKey] || null;
  const activeVariant = GAME_VARIANTS[game?.variantKey] || selectedGame || DEFAULT_VARIANT;
  const currentPlayer = game?.players[game.turn];
  const activeLobbyConnections = network.connections.filter((conn) => conn.open !== false);
  const joinedPlayers = activeLobbyConnections.map((conn, index) => conn.metadata?.name || `Player ${index + 2}`);
  const invitedBots = Array.from({ length: onlineBotCount }, (_, index) => `Computer ${index + 1}`);
  const lobbySeatCount = joinedPlayers.length + invitedBots.length;
  const matchConfig = { roundLimit, scoreLimit };
  const localPlayerName = playerNameOrDefault(playerName);
  const maxPlayerCount = ACTIVE_GAME.maxPlayers || 4;
  const maxComputerPlayers = Math.max(1, maxPlayerCount - 1);
  const maxOnlineBotCount = Math.max(0, maxPlayerCount - joinedPlayers.length - 1);
  const isLocalPlayer = (player) => {
    if (!player) return false;
    if (mode !== 'online') return player.type === 'human';
    if (network.role === 'host') return player.id === 'host';
    if (network.role === 'guest') return player.id === network.peerId;
    return false;
  };
  const localCanAct = game?.status === 'playing' && isLocalPlayer(currentPlayer);
  const visibleDrawn = game?.drawn && (isLocalPlayer(currentPlayer) || game.status === 'complete');
  const tableActions = ACTIVE_GAME.getTableActions(game);
  const roundBanner = ACTIVE_GAME.getRoundBanner(game, isLocalPlayer);
  const gameLink =
    network.role === 'host' && network.peerId
      ? `${window.location.origin}${window.location.pathname}?game=${network.peerId}&type=${ACTIVE_GAME.key}&variant=${activeVariant.key}`
      : '';

  useEffect(() => {
    const gameId = new URLSearchParams(window.location.search).get('game');
    const gameType = new URLSearchParams(window.location.search).get('type');
    const variantKey = new URLSearchParams(window.location.search).get('variant');
    const gameModule = gameModules[gameType] || defaultGame;
    if (gameType && gameModules[gameType]) {
      setSelectedGameModuleKey(gameType);
    }
    if (variantKey && gameModule.variants[variantKey]) {
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
    setGame(ACTIVE_GAME.dealPlayers(players, selectedGame, matchConfig));
  }, [game, localPlayerName, invitedGameId, matchConfig, selectedGame]);

  useEffect(() => {
    if (!ACTIVE_GAME.getBotAction(game)) return;
    const timeout = window.setTimeout(() => runBotTurn(), 700);
    return () => window.clearTimeout(timeout);
  }, [ACTIVE_GAME, currentPlayer?.id, game?.status, game?.drawn, game?.pendingReveal, game?.players]);

  function appendLog(message) {
    setGame((prev) => (prev ? { ...prev, log: [message, ...prev.log].slice(0, 30) } : prev));
  }

  function chooseGame(variantKey, gameModuleKey = selectedGameModuleKey) {
    const gameModule = gameModules[gameModuleKey] || defaultGame;
    const variant = gameModule.variants[variantKey];
    if (!variant) return;
    closeNetwork();
    setSelectedGameModuleKey(gameModule.key);
    setSelectedGameKey(variantKey);
    setMode('computer');
    setSetupVisible(true);
    const players = distinctPlayerNames([defaultPlayer(localPlayerName, 'host', 'human'), defaultPlayer('Computer 1', 'bot-1', 'bot')]);
    setGame(gameModule.dealPlayers(players, variant, matchConfig));
  }

  function startComputerGame() {
    closeNetwork();
    const humans = [defaultPlayer(localPlayerName, 'host', 'human')];
    const clampedBotCount = Math.min(botCount, maxComputerPlayers);
    const bots = Array.from({ length: clampedBotCount }, (_, index) => defaultPlayer(`Computer ${index + 1}`, `bot-${index + 1}`, 'bot'));
    setMode('computer');
    setGame(ACTIVE_GAME.dealPlayers(distinctPlayerNames([...humans, ...bots]), activeVariant, matchConfig));
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
    const clampedOnlineBotCount = Math.min(onlineBotCount, maxOnlineBotCount);
    const botPlayers = Array.from({ length: clampedOnlineBotCount }, (_, index) => defaultPlayer(`Computer ${index + 1}`, `bot-${index + 1}`, 'bot'));
    const players = distinctPlayerNames([defaultPlayer(localPlayerName, 'host', 'human'), ...remotePlayers, ...botPlayers]);
    setGame(ACTIVE_GAME.dealPlayers(players, activeVariant, matchConfig));
    setSetupVisible(false);
  }

  function startNextRound() {
    if (!game || game.status !== 'complete' || game.match?.complete) {
      if (mode === 'online') startHostedRound();
      else startComputerGame();
      return;
    }
    setGame(ACTIVE_GAME.dealPlayers(distinctPlayerNames(tablePlayersFromGame(game)), activeVariant, matchConfig, game.match));
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
    conn.send({ type: 'state', game: ACTIVE_GAME.gameForPlayer(fullGame, conn.peer), hostName: localPlayerName });
  }

  function broadcastState(fullGame) {
    connectionsRef.current.forEach((conn) => sendState(conn, fullGame));
  }

  function applyAction(action, actorId = 'host') {
    if (mode === 'online' && network.role === 'guest') {
      connectionsRef.current[0]?.send({ type: 'action', action });
      return;
    }
    setGame((prev) => ACTIVE_GAME.reduceGame(prev, action, actorId));
  }

  function runBotTurn() {
    const botTurn = ACTIVE_GAME.getBotAction(game);
    if (!botTurn) return;
    applyAction(botTurn.action, botTurn.actorId);
  }

  const standings = useMemo(
    () => ACTIVE_GAME.getStandings(game, activeVariant),
    [ACTIVE_GAME, activeVariant, game],
  );

  const rulesModalNode = (
    <Modal opened={rulesOpened} onClose={rulesModal.close} title={`${ACTIVE_GAME.name} rules`} size="lg" centered>
      <Stack>
        {ACTIVE_GAME.rules.map((rule) => (
          <Text key={rule}>{rule}</Text>
        ))}
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
                <Title order={1}>{ACTIVE_GAME.name}</Title>
                <Text c="rgba(255,255,255,0.78)" mt="xs">
                  Pick a table layout, then play against computers or host an online table.
                </Text>
                <Text size="xs" c="rgba(255,255,255,0.58)" mt={4}>
                  Version {APP_COMMIT}
                </Text>
              </div>
              <Button variant="default" leftSection={<IconQuestionMark size={18} />} onClick={rulesModal.open}>
                Rules
              </Button>
          </Group>
          {Object.values(gameModules).map((gameModule) => (
            <div key={gameModule.key}>
              <Title order={2} mt="xl">
                {gameModule.name}
              </Title>
              <div className="choiceGrid">
                {Object.values(gameModule.variants).map((variant) => (
                  <button key={`${gameModule.key}-${variant.key}`} className="gameChoice" onClick={() => chooseGame(variant.key, gameModule.key)}>
                    <Text fw={800}>{variant.name}</Text>
                    <Text size="sm">{variant.subtitle}</Text>
                    <Badge variant="light" mt="md">
                      {variant.rows} x {variant.columns}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          ))}
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
              <Title order={1}>{ACTIVE_GAME.name}</Title>
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
              mb="sm"
              value={ACTIVE_GAME.key}
              onChange={(gameModuleKey) => {
                const nextGame = gameModules[gameModuleKey] || defaultGame;
                chooseGame(nextGame.defaultVariant.key, nextGame.key);
              }}
              data={Object.values(gameModules).map((gameModule) => ({
                label: gameModule.name,
                value: gameModule.key,
              }))}
            />
            <SegmentedControl
              fullWidth
              value={activeVariant.key}
              onChange={(variantKey) => chooseGame(variantKey, ACTIVE_GAME.key)}
              data={Object.values(GAME_VARIANTS).map((variant) => ({
                label: variant.name,
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
                <NumberInput
                  label="Computer players"
                  min={1}
                  max={maxComputerPlayers}
                  value={Math.min(botCount, maxComputerPlayers)}
                  onChange={(value) => setBotCount(value || 1)}
                />
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
                    max={maxOnlineBotCount}
                    value={Math.min(onlineBotCount, maxOnlineBotCount)}
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
          <Text size="xs" c="dimmed">
            Version {APP_COMMIT}
          </Text>
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
            <Text c="rgba(255,255,255,0.58)" size="xs">
              Version {APP_COMMIT}
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

        {roundBanner && (
          <Paper className="standings" withBorder p="md">
            <Group justify="space-between" align="center">
              <div>
                <Text fw={800}>{roundBanner.title}</Text>
                <Text size="sm" c="dimmed">
                  {roundBanner.body}
                </Text>
              </div>
              {roundBanner.action && <Button onClick={() => applyAction(roundBanner.action.action)}>{roundBanner.action.label}</Button>}
            </Group>
          </Paper>
        )}

        {(tableActions.length > 0 || visibleDrawn) && (
          <section className="drawArea" aria-label="Table actions">
            {tableActions.map((tableAction) => (
              <button
                key={tableAction.key}
                className={tableAction.className || 'pile'}
                style={{ backgroundImage: tableAction.image ? `url(${tableAction.image})` : undefined }}
                onClick={() => localCanAct && applyAction(tableAction.action)}
                disabled={!localCanAct || tableAction.disabled}
                aria-label={tableAction.label}
              />
            ))}
            {visibleDrawn && (
              <div className="drawnSlot">
                <Text className="eyebrow">In hand</Text>
                <button
                  className="cardButton"
                  style={{ backgroundImage: `url(${ACTIVE_GAME.cardImage(game.drawn)})` }}
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
            )}
          </section>
        )}

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
                  {ACTIVE_GAME.getPlayerSummary(player, game, activeVariant)}
                </Badge>
              </Group>
              <div className="cardGrid" style={{ '--grid-columns': activeVariant.columns }}>
                {player.cards.map((card, index) => {
                  const handAction = ACTIVE_GAME.getHandAction(game, player, index, {
                    activeVariant,
                    isLocalPlayer: isLocalPlayer(player),
                    localCanAct,
                    playerIndex,
                  });
                  return (
                    <button
                      key={`${card.id}-${index}`}
                      className={`cardButton ${handAction.selectable ? 'selectable' : ''} ${handAction.selected ? 'selected' : ''}`}
                      style={{ backgroundImage: `url(${ACTIVE_GAME.cardImage(card, !handAction.visible)})` }}
                      disabled={!handAction.selectable}
                      aria-label={`${player.name} card ${index + 1}`}
                      onClick={() => applyAction(handAction.action)}
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
