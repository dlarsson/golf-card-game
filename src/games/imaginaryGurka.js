const SUITS = ['C', 'D', 'H', 'S'];
const SUIT_SYMBOLS = { C: '♣', D: '♦', H: '♥', S: '♠' };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const HAND_SIZE = 5;
const defaultT = (key, values = {}, fallback = key) => fallback;

export const variants = {
  imaginary: {
    key: 'imaginary',
    name: 'Imaginary Gurka',
    subtitle: 'Gurka with claimed cards, duplicate challenges, and no physical hands.',
    rows: 1,
    columns: 5,
    opening: 'Each player has five imaginary cards and chooses a rank and suit when playing.',
    showOwnHidden: true,
  },
};

export const defaultVariant = variants.imaginary;

export const rules = [
  'Imaginary Gurka follows Gurka play: five cards per player, same-rank response if possible, otherwise higher if possible, otherwise the lowest card. Since hands are imaginary, players choose the rank and suit they claim to play.',
  'A claimed card is open to challenge before it is accepted. If that exact rank and suit has already been accepted earlier, the challenge succeeds and the player must choose another card.',
  'A successful challenge is counted against the player who made the duplicate claim. A failed challenge is counted against the challenger, and the claimed card stands.',
  'The app tracks accepted cards as referee state, shows each player’s latest accepted card, and shows how many imaginary cards remain in each hand.',
  'When everyone has played their last imaginary card, the player with the highest latest accepted card loses the round.',
];

export function getRules(t = defaultT) {
  return [
    {
      items: rules.map((rule, index) => t(`games.imaginary-gurka.rules.${index}`, {}, rule)),
    },
  ];
}

function cardId(rank, suit) {
  return `${rank}${suit}`;
}

export function cardImage(card, back = false) {
  if (back || !card || card.hidden || card.imaginary) {
    return `${import.meta.env.BASE_URL}assets/cards/Blue_Back.svg`;
  }
  return `${import.meta.env.BASE_URL}assets/cards/${card.rank}${card.suit}.svg`;
}

function rankValue(cardOrRank) {
  const rank = typeof cardOrRank === 'string' ? cardOrRank : cardOrRank?.rank;
  return RANKS.indexOf(rank);
}

function nextTurn(game, fromTurn = game.turn) {
  return (fromTurn + 1) % game.players.length;
}

function placeholderCards(count, playerId) {
  return Array.from({ length: count }, (_, index) => ({
    id: `imaginary-${playerId}-${index}`,
    imaginary: true,
    hidden: true,
  }));
}

function allOutOfCards(game) {
  return game.players.every((player) => player.cards.length === 0);
}

function finishHand(game, log) {
  const losers = game.players
    .map((player) => ({ ...player, finalCard: player.latestPlayedCard }))
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
  game.pendingClaim = null;
  game.match = {
    ...(game.match || {}),
    roundScores,
    totalScores,
    complete: Boolean(roundLimitReached || scoreLimitReached),
  };
  game.log = [
    `${losingPlayers.map((player) => player.name).join(', ')} loses with ${losers[0]?.finalCard?.rank || '-'}.`,
    log,
    ...game.log,
  ];
}

function acceptedCardIds(game) {
  return new Set((game.acceptedCards || []).map((card) => card.id || cardId(card.rank, card.suit)));
}

function acceptClaim(game, logPrefix = '') {
  const claim = game.pendingClaim;
  if (!claim) return;
  const player = game.players.find((item) => item.id === claim.playerId);
  if (!player || !player.cards.length) return;

  const playedCard = { id: cardId(claim.rank, claim.suit), rank: claim.rank, suit: claim.suit };
  player.cards = placeholderCards(player.cards.length - 1, player.id);
  player.playedCards = [...(player.playedCards || []), playedCard];
  player.latestPlayedCard = playedCard;
  game.acceptedCards = [...(game.acceptedCards || []), playedCard];

  let startsNewRound = false;
  if (!game.currentCard) {
    game.twoMode = playedCard.rank === '2';
    game.twoStarterId = game.twoMode ? player.id : null;
  } else if (rankValue(playedCard) < rankValue(game.currentCard)) {
    startsNewRound = true;
  }

  if (game.twoMode && game.twoStarterId === player.id && game.currentCard) {
    game.twoMode = false;
    game.twoStarterId = null;
    startsNewRound = false;
  }

  const log = `${logPrefix}${player.name} plays ${playedCard.rank}${SUIT_SYMBOLS[playedCard.suit]}.`;
  game.pendingClaim = null;

  if (allOutOfCards(game)) {
    finishHand(game, log);
    return;
  }

  game.turn = nextTurn(game);
  if (startsNewRound) {
    game.currentCard = null;
    game.currentCardPlayerId = null;
    game.twoMode = false;
    game.twoStarterId = null;
    game.log = [log, `${game.players[game.turn].name} starts a new round.`, ...game.log];
  } else {
    game.currentCard = playedCard;
    game.currentCardPlayerId = player.id;
    game.log = [log, `${game.players[game.turn].name}'s turn.`, ...game.log];
  }
}

function botClaim(game, player) {
  const used = acceptedCardIds(game);
  const legalRanks = game.twoMode && game.twoStarterId !== player.id ? ['2'] : RANKS;
  const available = legalRanks.flatMap((rank) => SUITS.map((suit) => ({ rank, suit, id: cardId(rank, suit) }))).filter((card) => !used.has(card.id));
  const candidates = available.length ? available : RANKS.flatMap((rank) => SUITS.map((suit) => ({ rank, suit, id: cardId(rank, suit) })));

  if (game.currentCard && !game.twoMode) {
    const sameRank = candidates.filter((card) => card.rank === game.currentCard.rank);
    if (sameRank.length) return sameRank[0];
    const higher = candidates.filter((card) => rankValue(card) > rankValue(game.currentCard)).sort((a, b) => rankValue(a) - rankValue(b));
    if (higher.length) return higher[0];
  }

  return candidates.sort((a, b) => rankValue(a) - rankValue(b))[0];
}

export function dealPlayers(players, variant = defaultVariant, matchConfig = {}, previousMatch = null) {
  const startingTurn = previousMatch ? previousMatch.roundNumber % players.length : 0;
  const nextPlayers = players.map((player) => ({
    ...player,
    cards: placeholderCards(HAND_SIZE, player.id),
    revealed: Array.from({ length: HAND_SIZE }, () => true),
    known: Array.from({ length: HAND_SIZE }, () => true),
    ready: true,
    playedCards: [],
    latestPlayedCard: null,
    successfulChallengesAgainst: 0,
    failedChallengesIssued: 0,
    knocked: false,
  }));

  return {
    gameKey: imaginaryGurkaGame.key,
    players: nextPlayers,
    deck: [],
    discard: [],
    drawn: null,
    turn: startingTurn,
    status: 'playing',
    log: [`${nextPlayers[startingTurn].name} starts.`],
    round: crypto.randomUUID(),
    variantKey: variant.key,
    currentCard: null,
    currentCardPlayerId: null,
    twoMode: false,
    twoStarterId: null,
    pendingClaim: null,
    acceptedCards: [],
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

export function reduceGame(prev, action, actorId) {
  if (!prev) return prev;
  const next = structuredClone(prev);
  const actor = next.players.find((item) => item.id === actorId);
  if (!actor || next.status !== 'playing') return prev;

  if (next.pendingClaim) {
    const challenged = next.players.find((item) => item.id === next.pendingClaim.playerId);
    const claimedCard = `${next.pendingClaim.rank}${SUIT_SYMBOLS[next.pendingClaim.suit]}`;

    if (action.type === 'challengeClaim' && actor.id !== challenged?.id) {
      if (next.pendingClaim.duplicate) {
        challenged.successfulChallengesAgainst = (challenged.successfulChallengesAgainst || 0) + 1;
        next.log = [
          `${actor.name} successfully challenges ${challenged.name}'s ${claimedCard}. ${challenged.name} must choose another card.`,
          ...next.log,
        ];
        next.pendingClaim = null;
      } else {
        actor.failedChallengesIssued = (actor.failedChallengesIssued || 0) + 1;
        acceptClaim(next, `${actor.name} fails to challenge ${challenged.name}. `);
      }
      return next;
    }

    if (action.type === 'acceptClaim') {
      acceptClaim(next);
      return next;
    }

    return prev;
  }

  const active = next.players[next.turn];
  if (active?.id !== actorId || action.type !== 'claimCard' || !RANKS.includes(action.rank) || !SUITS.includes(action.suit)) return prev;
  if (!active.cards.length) return prev;

  const id = cardId(action.rank, action.suit);
  next.pendingClaim = {
    playerId: active.id,
    rank: action.rank,
    suit: action.suit,
    duplicate: acceptedCardIds(next).has(id),
  };
  next.log = [`${active.name} claims ${action.rank}${SUIT_SYMBOLS[action.suit]}. Waiting for challenges.`, ...next.log];
  return next;
}

export function gameForPlayer(game) {
  return game;
}

export function getBotAction(game) {
  if (!game || game.status !== 'playing') return null;

  if (game.pendingClaim) {
    const challenger = game.players.find((player) => player.type === 'bot' && player.id !== game.pendingClaim.playerId);
    if (!challenger) return null;
    return {
      action: { type: game.pendingClaim.duplicate ? 'challengeClaim' : 'acceptClaim' },
      actorId: challenger.id,
    };
  }

  const player = game.players[game.turn];
  if (!player || player.type !== 'bot') return null;
  const claim = botClaim(game, player);
  if (!claim) return null;
  return { action: { type: 'claimCard', rank: claim.rank, suit: claim.suit }, actorId: player.id };
}

export function getTableActions() {
  return [];
}

export function getHandAction() {
  return {
    action: { type: 'noop' },
    selectable: false,
    selected: false,
    visible: false,
  };
}

export function getPlayedPile(game, player, t = defaultT) {
  if (!game || game.gameKey !== imaginaryGurkaGame.key) return null;
  return {
    label: t('games.imaginary-gurka.latestCard', {}, 'Latest card'),
    cards: player.latestPlayedCard ? [player.latestPlayedCard] : [],
  };
}

export function getRoundBanner(game, isLocalPlayer, t = defaultT) {
  if (game?.pendingClaim) {
    const player = game.players.find((item) => item.id === game.pendingClaim.playerId);
    const card = `${game.pendingClaim.rank}${SUIT_SYMBOLS[game.pendingClaim.suit]}`;
    return {
      title: t('games.imaginary-gurka.banner.challenge.title', {}, 'Challenge window'),
      body: t('games.imaginary-gurka.banner.challenge.body', { player: player?.name || t('app.player', {}, 'Player'), card }, `${player?.name || 'Player'} claimed ${card}. Challenge it or let it stand.`),
    };
  }
  if (game?.twoMode) {
    return {
      title: t('games.imaginary-gurka.banner.two.title', {}, 'Two is active'),
      body:
        game.twoStarterId === game.players[game.turn]?.id
          ? t('games.imaginary-gurka.banner.two.owner', {}, 'The 2-starter may now claim any card.')
          : t('games.imaginary-gurka.banner.two.others', {}, 'Players must claim their lowest imaginary card.'),
    };
  }
  return null;
}

export function getTurnControls(game, context = {}) {
  if (!game || game.status !== 'playing') return null;
  const t = context.t || defaultT;
  const currentPlayer = game.players[game.turn];
  const claim = context.claim || { rank: 'A', suit: 'H' };
  const claimLabel = `${claim.rank}${SUIT_SYMBOLS[claim.suit]}`;

  if (game.pendingClaim) {
    const challenged = game.players.find((player) => player.id === game.pendingClaim.playerId);
    const canChallenge = context.isLocalPlayer?.(context.localPlayer) && context.localPlayer?.id !== challenged?.id;
    const canAccept = context.isLocalPlayer?.(challenged) || context.mode !== 'online';
    return {
      type: 'challenge',
      title: t(
        'games.imaginary-gurka.controls.claimed',
        { player: challenged?.name || t('app.player', {}, 'Player'), card: `${game.pendingClaim.rank}${SUIT_SYMBOLS[game.pendingClaim.suit]}` },
        `${challenged?.name || 'Player'} claimed ${game.pendingClaim.rank}${SUIT_SYMBOLS[game.pendingClaim.suit]}`,
      ),
      canChallenge,
      canAccept,
      challengeAction: { type: 'challengeClaim' },
      acceptAction: { type: 'acceptClaim' },
    };
  }

  return {
    type: 'claim',
    title: t('games.imaginary-gurka.controls.choose', { player: currentPlayer?.name || t('app.player', {}, 'Player') }, `${currentPlayer?.name || 'Player'} chooses an imaginary card`),
    ranks: RANKS,
    suits: SUITS.map((suit) => ({ value: suit, label: SUIT_SYMBOLS[suit] })),
    claimLabel,
    canClaim: context.localCanAct,
    claimAction: { type: 'claimCard', rank: claim.rank, suit: claim.suit },
  };
}

export function scoreCards(cards = []) {
  return cards.length ? rankValue(cards[0]) + 2 : 0;
}

export function visibleScore(player) {
  return player?.cards?.length || 0;
}

export function getPlayerSummary(player, game, variant = defaultVariant, t = defaultT) {
  const losses = game?.match?.totalScores?.[player.id] || 0;
  return t('games.imaginary-gurka.summary', { count: player.cards?.length || 0, losses }, `${player.cards?.length || 0} cards · Losses: ${losses}`);
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

export const imaginaryGurkaGame = {
  key: 'imaginary-gurka',
  name: 'Imaginary Gurka',
  maxPlayers: 10,
  rules,
  getRules,
  variants,
  defaultVariant,
  cardImage,
  canDrawFromDeck,
  dealPlayers,
  gameForPlayer,
  getBotAction,
  getHandAction,
  getPlayerSummary,
  getPlayedPile,
  getRoundBanner,
  getStandings,
  getTableActions,
  getTurnControls,
  reduceGame,
  scoreCards,
  visibleScore,
};
