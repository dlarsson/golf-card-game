import { golfGame } from './golf';
import { gurkaGame } from './gurka';
import { imaginaryGurkaGame } from './imaginaryGurka';

export const gameModules = {
  [golfGame.key]: golfGame,
  [gurkaGame.key]: gurkaGame,
  [imaginaryGurkaGame.key]: imaginaryGurkaGame,
};

export const defaultGame = golfGame;
