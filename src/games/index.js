import { golfGame } from './golf';
import { gurkaGame } from './gurka';
import { imaginaryGurkaGame } from './imaginaryGurka';

export const gameModules = {
  [golfGame.key]: golfGame,
  [gurkaGame.key]: gurkaGame,
  [imaginaryGurkaGame.key]: imaginaryGurkaGame,
};

export const defaultGame = golfGame;

export function getGameRules(gameModule, t) {
  if (typeof gameModule?.getRules === 'function') {
    return gameModule.getRules(t);
  }

  return [
    {
      items: gameModule?.rules || [],
    },
  ];
}

export function getRegisteredGameRules(modules = gameModules, t) {
  return Object.values(modules).map((gameModule) => ({
    key: gameModule.key,
    name: t?.(`games.${gameModule.key}.name`, {}, gameModule.name) || gameModule.name,
    sections: getGameRules(gameModule, t),
  }));
}
