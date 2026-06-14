const SUITS = ['C', 'D', 'H', 'S'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const variants = {
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

export const defaultVariant = variants.six;

export const rules = [
  'Golf is a low-score card game. Each player has a face-down grid. On your turn, draw from the deck or take the top discard, then either replace one of your grid cards or discard the drawn card. You can reveal a hidden card instead of drawing.',
  'Card values: King is 0, Ace is 1, number cards are face value, and Jack/Queen are 10. When every card in a vertical column has the same rank, that whole column scores 0.',
  'Four-card Memory Golf uses a different score card: Jack is 0, Ace is 1, King and Queen are 10, and any same-rank pair scores 0. In that variant, two face-down cards are privately shown to their owner before play starts, discarded draws must be followed by revealing one hidden card, and face-up cards are locked.',
  "A full game is played across the configured number of rounds, or until any player reaches the configured total score limit. Round scores are added to each player's match total, and the lowest total wins.",
];

export function cardImage(card, back = false) {
  const cardName = back || !card ? 'Blue_Back' : `${card.rank}${card.suit}`;
  return `${import.meta.env.BASE_URL}assets/cards/${cardName}.svg`;
}

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

export function canDrawFromDeck(game) {
  return Boolean(game?.deck?.length || game?.discard?.length > 1);
}

function recycleDiscardIntoDeck(game) {
  if (game.deck.length || game.discard.length <= 1) return false;
  const topDiscard = game.discard.at(-1);
  game.deck = shuffle(game.discard.slice(0, -1));
  game.discard = [topDiscard];
  return true;
}

function variantFor(gameOrKey) {
  const key = typeof gameOrKey === 'string' ? gameOrKey : gameOrKey?.variantKey;
  return variants[key] || defaultVariant;
}

function cardValue(card, variant = defaultVariant) {
  if (!card) return 0;
  if (card.rank === 'J' && variant.jackZero) return 0;
  if (card.rank === 'K' && variant.kingZero !== false) return 0;
  if (card.rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  const numericValue = Number(card.rank);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function scoreCards(cards, variant = defaultVariant) {
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

export function visibleScore(player, variant = defaultVariant, revealAll = false) {
  if (!player?.cards) return 0;
  const cards = revealAll ? player.cards : player.cards.map((card, index) => (player.revealed[index] ? card : null));
  return scoreCards(cards, variant);
}

function averageCardValue(variant = defaultVariant) {
  const total = RANKS.reduce((sum, rank) => sum + cardValue({ rank }, variant), 0);
  return total / RANKS.length;
}

function botKnowsCard(player, index) {
  return Boolean(player?.revealed?.[index] || player?.known?.[index]);
}

function botVisibleCards(player) {
  return player.cards.map((card, index) => (botKnowsCard(player, index) ? card : null));
}

function estimatedBotScore(player, variant = defaultVariant) {
  const hiddenUnknownCount = player.cards.filter((_, index) => !botKnowsCard(player, index)).length;
  return scoreCards(botVisibleCards(player), variant) + hiddenUnknownCount * averageCardValue(variant);
}

function findBotReplacement(player, drawnCard, variant = defaultVariant) {
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

function chooseBotReveal(player, variant = defaultVariant) {
  return player.cards
    .map((card, index) => ({ index, known: botKnowsCard(player, index), value: cardValue(card, variant), revealed: player.revealed[index] }))
    .filter((item) => !item.revealed)
    .sort((a, b) => Number(b.known) - Number(a.known) || a.value - b.value)[0];
}

export function dealPlayers(players, variant = defaultVariant, matchConfig = {}, previousMatch = null) {
  const deck = createDeck();
  const cardCount = variant.rows * variant.columns;
  const startingTurn = previousMatch ? previousMatch.roundNumber % players.length : 0;
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
    turn: startingTurn,
    status: preview ? 'preview' : 'playing',
    log: preview ? ['Review your two known cards, then hide them to start.'] : [`${nextPlayers[startingTurn].name} starts the round.`],
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

function resolveRoundScores(players, variant = defaultVariant) {
  return Object.fromEntries(players.map((player) => [player.id, scoreCards(player.cards, variant)]));
}

function advanceTurn(next, log) {
  if (!next.players[next.turn].revealed.includes(false)) {
    next.players[next.turn].knocked = true;
  }
  const allDone = next.players.every((player) => !player.revealed.includes(false));
  if (allDone) {
    const variant = variantFor(next);
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

export function reduceGame(prev, action, actorId) {
  if (!prev) return prev;
  const variant = variantFor(prev);
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
    const recycled = recycleDiscardIntoDeck(next);
    const card = next.deck.pop();
    if (!card) return prev;
    next.drawn = card;
    next.log = [recycled ? `${logName} reshuffles the discard pile and draws from the deck.` : `${logName} draws from the deck.`, ...next.log];
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

function hiddenCard(playerId, index) {
  return { id: `hidden-${playerId}-${index}`, hidden: true };
}

function canViewerSeeCard(game, player, index, viewerId, variant = defaultVariant) {
  return (
    player.revealed[index] ||
    game.status === 'complete' ||
    (player.id === viewerId && game.status === 'preview' && !player.ready && player.known?.[index]) ||
    (player.id === viewerId && variant.showOwnHidden !== false)
  );
}

export function gameForPlayer(game, viewerId) {
  if (!game) return game;
  const variant = variantFor(game);
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

export function getBotAction(game) {
  if (!game) return null;
  const variant = variantFor(game);
  const player = game.players[game.turn];
  if (!player || player.type !== 'bot') return null;

  if (game.pendingReveal === game.turn) {
    const reveal = chooseBotReveal(player, variant);
    return reveal ? { action: { type: 'reveal', index: reveal.index }, actorId: player.id } : null;
  }

  if (game.drawn) {
    const target = findBotReplacement(player, game.drawn, variant);
    return {
      action: target && target.improvement > 0.25 ? { type: 'replace', index: target.index } : { type: 'discardDrawn' },
      actorId: player.id,
    };
  }

  const topDiscard = game.discard.at(-1);
  const discardTarget = topDiscard ? findBotReplacement(player, topDiscard, variant) : null;
  const shouldTakeDiscard =
    !canDrawFromDeck(game) ||
    (discardTarget && discardTarget.improvement > 0.75 && !createsUnpairedThirdKnownRank(player, topDiscard, discardTarget.index));
  if (shouldTakeDiscard && !topDiscard) return null;
  return { action: { type: shouldTakeDiscard ? 'drawDiscard' : 'drawDeck' }, actorId: player.id };
}

export const golfGame = {
  key: 'golf',
  name: 'Golf Cards',
  rules,
  variants,
  defaultVariant,
  cardImage,
  canDrawFromDeck,
  dealPlayers,
  gameForPlayer,
  getBotAction,
  reduceGame,
  scoreCards,
  visibleScore,
};
