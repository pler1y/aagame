// types.ts

export enum Color {
  RED = 'RED',
  BLACK = 'BLACK',
  UNKNOWN = 'UNKNOWN', // Used before colors are assigned
}

export enum PieceType {
  GENERAL = 'GENERAL', // 帅/将 (Rank 6)
  ADVISOR = 'ADVISOR', // 仕/士 (Rank 5)
  ELEPHANT = 'ELEPHANT', // 相/象 (Rank 4)
  CHARIOT = 'CHARIOT', // 車 (Rank 3)
  HORSE = 'HORSE', // 馬 (Rank 2)
  CANNON = 'CANNON', // 炮 (Rank 1)
  SOLDIER = 'SOLDIER', // 兵/卒 (Rank 0)
}

export interface PieceInstance {
  id: string; // Unique ID for tracking
  type: PieceType;
  color: Color;
  faceUp: boolean; // Is the piece revealed?
}

export interface PieceStack {
  pieces: PieceInstance[]; // Bottom is index 0, Top is last index
}

export type Board = (PieceStack | null)[][];

export interface HandState {
  // We store actual instances to preserve IDs if they are returned from board
  pieces: PieceInstance[]; 
}

export interface PlayerState {
  color: Color | null; // Null until determined
  hand: HandState;
  capturedPoints: number; // Optional: track score
}

export interface GameState {
  board: Board;
  players: [PlayerState, PlayerState]; // Index 0 and 1
  activePlayerIndex: number; // 0 or 1
  colorsAssigned: boolean;
  turnCount: number;
  isGameOver: boolean;
  winner: number | null; // Index of winner, or null
  lastAction: PlayerAction | null;
  error: string | null; // To feedback logic errors
}

export enum ActionType {
  FLIP = 'FLIP',
  MOVE = 'MOVE', // Includes Capture if landing on enemy
  DEPLOY = 'DEPLOY',
  RETRIEVE = 'RETRIEVE',
}

export interface Location {
  row: number;
  col: number;
}

export interface PlayerAction {
  type: ActionType;
  playerId: number; // 0 or 1
  
  // For FLIP
  flipLocation?: Location;

  // For MOVE
  from?: Location;
  to?: Location;

  // For DEPLOY
  deployPieceId?: string; // Which piece ID from hand
  deployTo?: Location;

  // For RETRIEVE (Harvesting own stack)
  retrieveFrom?: Location;
  retrieveCount?: number; // How many from top?
}

// Helper for rank logic
export const PIECE_RANKS: Record<PieceType, number> = {
  [PieceType.GENERAL]: 6,
  [PieceType.ADVISOR]: 5,
  [PieceType.ELEPHANT]: 4,
  [PieceType.CHARIOT]: 3,
  [PieceType.HORSE]: 2,
  [PieceType.CANNON]: 1,
  [PieceType.SOLDIER]: 0,
};

// Initial distribution counts
export const INITIAL_PIECE_COUNTS: Record<PieceType, number> = {
  [PieceType.GENERAL]: 1,
  [PieceType.ADVISOR]: 2,
  [PieceType.ELEPHANT]: 2,
  [PieceType.CHARIOT]: 2,
  [PieceType.HORSE]: 2,
  [PieceType.CANNON]: 2,
  [PieceType.SOLDIER]: 5,
};
