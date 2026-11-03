import type { Difficulty } from '../core/BotAI';
import type { GameConfig } from '../core/config';
import type { ItemId } from '../core/data';
import type { Loadout } from '../core/gear';
import type { MapId } from '../core/Maps';
import type { Tank } from '../core/World';

// Messages between the browser and the room server, JSON over one WebSocket.
// The server owns the match: it validates every action, runs the same core
// simulation, and sends the true state at the start of every turn.

export const DEFAULT_PORT = 2567;

export type OnlineFormat = '1v1' | '2v2';
export const TEAM_SIZE: Record<OnlineFormat, number> = { '1v1': 1, '2v2': 2 };

export interface Profile {
  name: string;
  loadout: Loadout;
  items: ItemId[];
}

/** A player's account as the client sees it. */
export interface AccountView {
  username: string | null; // null = guest
  displayName: string;
  loadout: Loadout | null; // saved wardrobe, null until first saved
  items: ItemId[] | null;
  rating: number;
  played: number;
  wins: number;
  rankedPlayed: number;
}

export interface LeaderRow {
  displayName: string;
  rating: number;
  played: number;
  wins: number;
}

export interface RoomConfig {
  map: MapId;
  format: OnlineFormat;
  difficulty: Difficulty; // for the bots that fill empty seats
}

export interface PlayerView extends Profile {
  id: number;
  team: number;
  connected: boolean;
}

export interface RoomView {
  code: string;
  /** A ranked match from the queue: no lobby, no bots, no equipment. */
  ranked: boolean;
  hostId: number;
  config: RoomConfig;
  players: PlayerView[];
  playing: boolean;
}

export interface TurnInfo {
  active: number; // tank id
  turnNumber: number;
  wind: number;
  waterY: number | null; // null = no water yet
  timeLeft: number; // seconds
}

export interface MatchView {
  config: RoomConfig;
  /** The server's game numbers: applied before the match so both sides simulate alike. */
  game: GameConfig;
  tanks: Tank[];
  terrain: number[]; // run-length mask, see encodeMask
  turn: TurnInfo;
  you: number; // your tank id, -1 if you have none
}

/** The active player's live position/aim, streamed so everyone watches them move. */
export interface MoveMsg {
  x: number;
  y: number;
  facing: 1 | -1;
  angle: number;
  power: number;
}

export interface FireMsg extends MoveMsg {
  drill: boolean;
}

export type ClientMsg =
  | { t: 'auth'; token: string } // first message after connecting, when signed in
  | ({ t: 'queue' } & Profile) // look for a ranked 1v1
  | { t: 'unqueue' }
  | ({ t: 'create' } & Profile)
  | ({ t: 'join'; code: string } & Profile)
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'leave' }
  | ({ t: 'profile' } & Profile)
  | { t: 'team'; team: number }
  | { t: 'config'; config: RoomConfig }
  | { t: 'start' }
  | { t: 'resume' } // back from the lobby into a running match
  | { t: 'away' } // left the battle screen; don't wait for their animations
  | ({ t: 'move' } & MoveMsg)
  | { t: 'item'; slot: number }
  | { t: 'skill' }
  | ({ t: 'fire' } & FireMsg)
  | { t: 'settled'; turn: number }
  | { t: 'needTerrain' };

export type ServerMsg =
  | { t: 'account'; account: AccountView; ratingChange?: number } // signed in, or numbers after a match
  | { t: 'queue'; waiting: boolean }
  | { t: 'joined'; code: string; token: string; you: number; game: GameConfig }
  | { t: 'room'; room: RoomView }
  | { t: 'error'; msg: string }
  | { t: 'left' }
  | { t: 'match'; match: MatchView }
  | { t: 'turn'; turn: TurnInfo; tanks: Tank[]; hash: number }
  | ({ t: 'move'; id: number } & MoveMsg)
  | { t: 'item'; id: number; slot: number }
  | { t: 'skill'; id: number }
  | ({ t: 'shot'; id: number } & FireMsg)
  | { t: 'terrain'; terrain: number[] }
  | { t: 'over'; winner: number; tanks: Tank[] };
