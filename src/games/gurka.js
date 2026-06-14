const SUITS = ['C', 'D', 'H', 'S'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const HAND_SIZE = 5;

export const variants = {
  classic: {
    key: 'classic',
    name: 'Gurka',
    subtitle: 'Swedish five-card shedding game where the highest last card loses.',
    rows: 1,
    columns: 5,
    opening: 'Each player is dealt five cards and may swap cards before play starts.',
    showOwnHidden: true,
  },
};

export const defaultVariant = variants.classic;

export const rules = [
  'Gurka is played with up to 10 players. Each player is dealt five cards, then may swap cards before play starts.',
  'The swap limit is normally five cards, but with many players it is reduced so the deck can supply every possible swap.',
  'The lead player may play any card. The following player must play the same rank if possible, otherwise a higher card if possible, otherwise their lowest card.',
  'If a player must play lower than the previous card, the next player starts a new round of play.',
  'A 2 played to start a round is special: everyone must play their lowest card until play returns to the 2-starter, who then may choose any card.',
  'When everyone has one card left, the player with the highest remaining card loses.',
];

function cardId(rank, suit) {
  return `${rank}${suit}`;
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

export function cardImage(card, back = false) {
  const cardName = back || !card ? 'Blue_Back' : `${card.rank}${card.suit}`;
  return `${import.meta.env.BASE_URL}assets/cards/${cardName}.svg`;
}

function rankValue(cardOrRank) {
  const rank = typeof cardOrRank === 'string' ? cardOrRank : cardOrRank?.rank;
  return RANKS.indexOf(rank);
}

function sortHand(cards) {
  return [...cards].sort((a, b) => rankValue(a) - rankValue(b) || a.suit.localeCompare(b.suit));
}

function maxSwapCount(playerCount) {
  return Math.max(0, Math.min(5, Math.floor(52 / playerCount) - HAND_SIZE));
}

function lowestCardIndex(cards) {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => rankValue(a.card) - rankValue(b.card) || a.card.suit.localeCompare(b.card.suit))[0]?.index;
}

function highestCard(cards) {
  return [...cards].sort((a, b) => rankValue(b) - rankValue(a) || b.suit.localeCompare(a.suit))[0];
}

function legalCardIndexes(game, player) {
  if (!player?.cards?.length) return [];
  if (game.status === 'swap') return player.cards.map((_, index) => index);
  if (game.status !== 'playing' || player.cards.length <= 1) return [];
  if (game.twoMode && game.twoStarterId !== player.id) {
    return [lowestCardIndex(player.cards)];
  }
  if (game.twoMode && game.twoStarterId === player.id) {
    return player.cards.map((_, index) => index);
  }
  if (!game.currentCard) return player.cards.map((_, index) => index);

  const sameRank = player.cards.map((card, index) => ({ card, index })).filter((item) => item.card.rank === game.currentCard.rank);
  if (sameRank.length) return sameRank.map((item) => item.index);

  const higher = player.cards
    .map((card, index) => ({ card, index }))
    .filter((item) => rankValue(item.card) > rankValue(game.currentCard))
    .sort((a, b) => rankValue(a.card) - rankValue(b.card) || a.card.suit.localeCompare(b.card.suit));
  if (higher.length) return higher.map((item) => item.index);

  return [lowestCardIndex(player.cards)];
}

function nextTurn(game, fromTurn = game.turn) {
  return (fromTurn + 1) % game.players.length;
}

function allReady(game) {
  return game.players.every((player) => player.ready);
}

function allDownToOneCard(game) {
  return game.players.every((player) => player.cards.length <= 1);
}

function finishHand(game, log) {
  const losers = game.players
    .map((player) => ({ ...player, finalCard: player.cards[0] }))
    .sort((a, b) => rankValue(b.finalCard) - rankValue(a.finalCard));
  const highestValue = rankValue(losers[0]?.finalCard);
  const losingPlayers = losers.filter((player) => rankValue(player.finalCard) === highestValue);
  const roundScores = Object.fromEntries(game.players.map((player) => [player.id, losingPlayers.some((loser) => loser.id === player.id) ? 1 : 0]));
  const totalScores = Object.fromEntries(
    game.players.map((player) => [player.id, (game.match?.totalScores?.[player.id] || 0) + roundScores[player.id]]),
  );
  const roundLimitReached = game.match?.roundLimit && game.match.roundNumber >= game.match.roundLimit;
  const scoreLimitReached = game.match?.scoreLimit && Object.values(totalScores).some((score) => score >= game.match.scoreLimit);

  game.status = 'complete';
  game.match = {
    ...(game.match || {}),
    roundScores,
    totalScores,
    complete: Boolean(roundLimitReached || scoreLimitReached),
  };
  game.log = [
    `${losingPlayers.map((player) => player.name).join(', ')} loses with ${losers[0].finalCard.rank}.`,
    log,
    ...game.log,
  ];
}

export function dealPlayers(players, variant = defaultVariant, matchConfig = {}, previousMatch = null) {
  const deck = createDeck();
  const startingTurn = previousMatch ? previousMatch.roundNumber % players.length : 0;
  const swapLimit = maxSwapCount(players.length);
  const nextPlayers = players.map((player) => ({
    ...player,
    cards: sortHand(Array.from({ length: HAND_SIZE }, () => deck.pop())),
    revealed: Array.from({ length: HAND_SIZE }, () => true),
    known: Array.from({ length: HAND_SIZE }, () => true),
    ready: player.type === 'bot',
    selectedSwap: [],
    knocked: false,
  }));

  return {
    gameKey: gurkaGame.key,
    players: nextPlayers,
    deck,
    discard: [],
    drawn: null,
    turn: startingTurn,
    status: 'swap',
    log: [`Swap up to ${swapLimit} card${swapLimit === 1 ? '' : 's'}, then start play.`],
    round: crypto.randomUUID(),
    variantKey: variant.key,
    currentCard: null,
    currentCardPlayerId: null,
    twoMode: false,
    twoStarterId: null,
    swapLimit,
    match: {
      roundNumber: (previousMatch?.roundNumber || 0) + 1,
      roundLimit: matchConfig.roundLimit || previousMatch?.roundLimit || 9,
      scoreLimit: matchConfig.scoreLimit || previousMatch?.scoreLimit || 10,
      totalScores:
        previousMatch?.totalScores ||
        Object.fromEntries(nextPlayers.map((player) => [player.id, 0])),
      roundScores: {},
      complete: false,
    },
  };
}

function completeSwap(next, player) {
  const selected = [...new Set(player.selectedSwap || [])].filter((index) => Number.isInteger(index)).slice(0, next.swapLimit);
  const selectedSet = new Set(selected);
  player.cards = sortHand(player.cards.map((card, index) => (selectedSet.has(index) && next.deck.length ? next.deck.pop() : card)));
  player.selectedSwap = [];
  player.ready = true;
  if (allReady(next)) {
    next.status = 'playing';
    next.log = [`${next.players[next.turn].name} starts.`, `${player.name} is ready.`, ...next.log];
  } else {
    next.log = [`${player.name} is ready.`, ...next.log];
  }
}

export function reduceGame(prev, action, actorId) {
  if (!prev) return prev;
  const next = structuredClone(prev);
  const player = next.players.find((item) => item.id === actorId);
  if (!player) return prev;

  if (next.status === 'swap') {
    if (action.type === 'toggleSwap' && !player.ready && Number.isInteger(action.index)) {
      const selected = new Set(player.selectedSwap || []);
      if (selected.has(action.index)) selected.delete(action.index);
      else if (selected.size < next.swapLimit) selected.add(action.index);
      player.selectedSwap = [...selected].sort((a, b) => a - b);
      return next;
    }
    if (action.type === 'finishSwap' && !player.ready) {
      if (Array.isArray(action.selected)) {
        player.selectedSwap = action.selected.slice(0, next.swapLimit);
      }
      completeSwap(next, player);
      return next;
    }
    return prev;
  }

  const active = next.players[next.turn];
  if (next.status !== 'playing' || active?.id !== actorId || action.type !== 'playCard' || !Number.isInteger(action.index)) return prev;
  const legal = legalCardIndexes(next, active);
  if (!legal.includes(action.index)) return prev;

  const [playedCard] = active.cards.splice(action.index, 1);
  active.cards = sortHand(active.cards);
  next.discard.push(playedCard);

  let startsNewRound = false;
  if (!next.currentCard) {
    next.twoMode = playedCard.rank === '2';
    next.twoStarterId = next.twoMode ? active.id : null;
  } else if (rankValue(playedCard) < rankValue(next.currentCard)) {
    startsNewRound = true;
  }

  if (next.twoMode && next.twoStarterId === active.id && next.currentCard) {
    next.twoMode = false;
    next.twoStarterId = null;
    startsNewRound = false;
  }

  const log = `${active.name} plays ${playedCard.rank}${playedCard.suit}.`;
  if (allDownToOneCard(next)) {
    finishHand(next, log);
    return next;
  }

  next.turn = nextTurn(next);
  if (startsNewRound) {
    next.currentCard = null;
    next.currentCardPlayerId = null;
    next.twoMode = false;
    next.twoStarterId = null;
    next.log = [log, `${next.players[next.turn].name} starts a new round.`, ...next.log];
  } else {
    next.currentCard = playedCard;
    next.currentCardPlayerId = active.id;
    next.log = [log, `${next.players[next.turn].name}'s turn.`, ...next.log];
  }
  return next;
}

export function gameForPlayer(game, viewerId) {
  if (!game) return game;
  return {
    ...game,
    deck: Array.from({ length: game.deck.length }, (_, index) => ({ id: `hidden-deck-${index}`, hidden: true })),
    players: game.players.map((player) => ({
      ...player,
      cards: player.id === viewerId || game.status === 'complete' ? player.cards : player.cards.map((_, index) => ({ id: `hidden-${player.id}-${index}`, hidden: true })),
    })),
  };
}

export function getBotAction(game) {
  if (!game) return null;
  if (game.status === 'swap') {
    const player = game.players.find((item) => item.type === 'bot' && !item.ready);
    if (!player) return null;
    const selected = player.cards
      .map((card, index) => ({ card, index }))
      .sort((a, b) => rankValue(b.card) - rankValue(a.card))
      .slice(0, game.swapLimit)
      .map((item) => item.index);
    return { action: { type: 'finishSwap', selected }, actorId: player.id };
  }

  const player = game.players[game.turn];
  if (!player || player.type !== 'bot') return null;
  const legal = legalCardIndexes(game, player);
  if (!legal.length) return null;
  return { action: { type: 'playCard', index: legal[0] }, actorId: player.id };
}

export function getTableActions() {
  return [];
}

export function getHandAction(game, player, index, context = {}) {
  const { isLocalPlayer = false, localCanAct = false, playerIndex = -1 } = context;
  if (game?.status === 'swap') {
    return {
      action: { type: 'toggleSwap', index },
      selectable: isLocalPlayer && !player.ready,
      selected: isLocalPlayer && player.selectedSwap?.includes(index),
      visible: isLocalPlayer,
    };
  }
  const legal = legalCardIndexes(game, player);
  return {
    action: { type: 'playCard', index },
    selectable: localCanAct && playerIndex === game?.turn && legal.includes(index),
    selected: false,
    visible: isLocalPlayer || game?.status === 'complete',
  };
}

export function getRoundBanner(game, isLocalPlayer) {
  if (game?.status === 'swap') {
    const player = game.players.find((item) => isLocalPlayer(item));
    if (!player || player.ready) {
      return {
        title: 'Waiting for swaps',
        body: `Players may swap up to ${game.swapLimit} card${game.swapLimit === 1 ? '' : 's'}.`,
      };
    }
    return {
      title: 'Swap cards',
      body: `Select 0-${game.swapLimit} cards to replace, then keep or swap them.`,
      action: { label: player.selectedSwap?.length ? `Swap ${player.selectedSwap.length}` : 'Keep hand', action: { type: 'finishSwap' } },
    };
  }
  if (game?.twoMode) {
    return {
      title: 'Two is active',
      body: game.twoStarterId === game.players[game.turn]?.id ? 'The 2-starter may now play any card.' : 'Players must play their lowest card.',
    };
  }
  return null;
}

export function scoreCards(cards = []) {
  return cards.length ? rankValue(highestCard(cards)) + 2 : 0;
}

export function visibleScore(player, variant = defaultVariant, revealAll = false) {
  if (!player?.cards?.length) return 0;
  if (!revealAll && player.cards.some((card) => card.hidden)) return player.cards.length;
  return scoreCards(player.cards, variant);
}

export function getPlayerSummary(player, game) {
  const hand = player.cards?.some((card) => card.hidden) ? `${player.cards.length} cards` : `High: ${highestCard(player.cards)?.rank || '-'}`;
  const score = game?.match?.totalScores?.[player.id] || 0;
  return `${hand} · Losses: ${score}`;
}

export function getStandings(game) {
  if (!game) return [];
  return [...game.players]
    .map((player) => ({
      ...player,
      roundScore: game.match?.roundScores?.[player.id] || 0,
      totalScore: game.match?.totalScores?.[player.id] || 0,
    }))
    .sort((a, b) => a.totalScore - b.totalScore);
}

export function canDrawFromDeck() {
  return false;
}

export const gurkaGame = {
  key: 'gurka',
  name: 'Gurka',
  maxPlayers: 10,
  rules,
  variants,
  defaultVariant,
  cardImage,
  canDrawFromDeck,
  dealPlayers,
  gameForPlayer,
  getBotAction,
  getHandAction,
  getPlayerSummary,
  getRoundBanner,
  getStandings,
  getTableActions,
  reduceGame,
  scoreCards,
  visibleScore,
};
