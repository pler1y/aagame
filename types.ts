
// types.ts

export enum Color {
  RED = 'RED',
  BLACK = 'BLACK',
  UNKNOWN = 'UNKNOWN', // Used before colors are assigned
}

export enum PieceType {
  GENERAL = 'GENERAL', // 帅/将
  ADVISOR = 'ADVISOR', // 仕/士
  ELEPHANT = 'ELEPHANT', // 相/象
  CHARIOT = 'CHARIOT', // 車
  HORSE = 'HORSE', // 馬
  CANNON = 'CANNON', // 炮
  SOLDIER = 'SOLDIER', // 兵/卒
}

export const PIECE_RANKS: Record<PieceType, number> = {
  [PieceType.GENERAL]: 6,
  [PieceType.ADVISOR]: 5,
  [PieceType.ELEPHANT]: 4,
  [PieceType.CHARIOT]: 3,
  [PieceType.HORSE]: 2,
  [PieceType.CANNON]: 1,
  [PieceType.SOLDIER]: 0,
};

export interface PieceInstance {
  id: string; // Unique ID
  type: PieceType;
  color: Color;
  faceUp: boolean;
}

export interface PieceStack {
  pieces: PieceInstance[]; // Index 0 is Bottom, Last Index is Top
}

export type Board = (PieceStack | null)[][];

export interface HandState {
  pieces: PieceInstance[];
}

export interface PlayerState {
  color: Color; // Strictly RED, BLACK, or UNKNOWN
  hand: HandState;
}

export interface Location {
  row: number;
  col: number;
}

export interface GameState {
  board: Board;
  players: [PlayerState, PlayerState];
  activePlayerIndex: number; // 0 or 1
  colorsAssigned: boolean;
  turnCount: number;
  isGameOver: boolean;
  winner: number | null;
  lastAction: PlayerAction | null;
  error: string | null;
  
  // Logic for Chain Captures
  pendingChainCapture: Location | null; // If set, active player MUST move piece at this location to Capture, or Pass
}

export enum ActionType {
  FLIP = 'FLIP',
  MOVE = 'MOVE',
  DEPLOY = 'DEPLOY',
  RETRIEVE = 'RETRIEVE',
  PASS = 'PASS', // Used to end turn during Chain Capture
}

export enum CaptureResolution {
  TO_HAND = 'TO_HAND',     // Harvest captured pieces to hand (Color Converts)
  STACK_IF_POSSIBLE = 'STACK_IF_POSSIBLE', // Stack captured pieces under attacker (No Color Convert)
}

export interface PlayerAction {
  type: ActionType;
  playerId: number;
  
  // For FLIP
  flipLocation?: Location;

  // For MOVE
  from?: Location;
  to?: Location;
  captureResolution?: CaptureResolution; // Default to TO_HAND if undefined

  // For DEPLOY
  deployType?: PieceType; // Which type to deploy
  deployCount?: number;   // How many
  deployTo?: Location;    // Target grid

  // For RETRIEVE
  retrieveFrom?: Location;
  retrievePieceIds?: string[]; // Which specific pieces to pull
}

// --- Constants & Config ---

export const STACK_LIMITS: Record<PieceType, number> = {
  [PieceType.SOLDIER]: 12,
  [PieceType.GENERAL]: 2, // When General is the base
  [PieceType.ADVISOR]: 6,
  [PieceType.ELEPHANT]: 6,
  [PieceType.CHARIOT]: 6,
  [PieceType.HORSE]: 6,
  [PieceType.CANNON]: 6,
};

// Initial distribution counts (Total 32)
export const INITIAL_PIECE_COUNTS: Record<PieceType, number> = {
  [PieceType.GENERAL]: 1,
  [PieceType.ADVISOR]: 2,
  [PieceType.ELEPHANT]: 2,
  [PieceType.CHARIOT]: 2,
  [PieceType.HORSE]: 2,
  [PieceType.CANNON]: 2,
  [PieceType.SOLDIER]: 5,
};
