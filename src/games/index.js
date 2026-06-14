import { golfGame } from './golf';
import { gurkaGame } from './gurka';

export const gameModules = {
  [golfGame.key]: golfGame,
  [gurkaGame.key]: gurkaGame,
};

export const defaultGame = golfGame;
