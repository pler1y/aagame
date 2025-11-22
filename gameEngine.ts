import {
  GameState,
  Board,
  PieceInstance,
  PieceType,
  Color,
  PlayerAction,
  ActionType,
  PieceStack,
  INITIAL_PIECE_COUNTS,
  PIECE_RANKS,
  Location,
} from './types';

// --- Helper Functions ---

/**
 * Generates a unique ID.
 */
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

/**
 * Shuffles an array in place using Fisher-Yates.
 */
const shuffle = <T,>(array: T[]): T[] => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

/**
 * Creates the initial deck of 32 pieces (shuffled).
 */
const createDeck = (): PieceInstance[] => {
  const deck: PieceInstance[] = [];
  const colors = [Color.RED, Color.BLACK];

  colors.forEach((color) => {
    Object.entries(INITIAL_PIECE_COUNTS).forEach(([type, count]) => {
      for (let i = 0; i < count; i++) {
        deck.push({
          id: generateId(),
          type: type as PieceType,
          color: color,
          faceUp: false,
        });
      }
    });
  });

  return shuffle(deck);
};

/**
 * Initializes a new random game state.
 */
export const initRandomGame = (): GameState => {
  const deck = createDeck();
  const board: Board = Array(4)
    .fill(null)
    .map(() => Array(8).fill(null));

  // Place 32 pieces on 4x8 board
  let deckIndex = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      if (deckIndex < deck.length) {
        board[r][c] = {
          pieces: [deck[deckIndex]],
        };
        deckIndex++;
      }
    }
  }

  return {
    board,
    players: [
      { color: null, hand: { pieces: [] }, capturedPoints: 0 },
      { color: null, hand: { pieces: [] }, capturedPoints: 0 },
    ],
    activePlayerIndex: 0, // Player 0 starts
    colorsAssigned: false,
    turnCount: 0,
    isGameOver: false,
    winner: null,
    lastAction: null,
    error: null,
  };
};

// --- Core Logic Logic ---

const isValidCoordinate = (loc: Location): boolean => {
  return loc.row >= 0 && loc.row < 4 && loc.col >= 0 && loc.col < 8;
};

const getTopPiece = (board: Board, loc: Location): PieceInstance | null => {
  if (!isValidCoordinate(loc)) return null;
  const stack = board[loc.row][loc.col];
  if (!stack || stack.pieces.length === 0) return null;
  return stack.pieces[stack.pieces.length - 1];
};

const canCapture = (attacker: PieceType, defender: PieceType): boolean => {
  const atkRank = PIECE_RANKS[attacker];
  const defRank = PIECE_RANKS[defender];

  // Special Case: Soldier (0) eats General (6)
  if (attacker === PieceType.SOLDIER && defender === PieceType.GENERAL) return true;
  // Special Case: General (6) cannot eat Soldier (0) - DEPENDS ON VARIANT
  // Standard Banqi: General cannot eat Soldier.
  if (attacker === PieceType.GENERAL && defender === PieceType.SOLDIER) return false;
  
  // Cannon (1) capture logic is handled in the move validation (needs screen),
  // but hierarchically it can capture anything if screened. 
  // We define hierarchy strictly here. 
  if (attacker === PieceType.CANNON) return true; // Checked elsewhere

  // Standard Rank Check
  return atkRank >= defRank;
};

const countPiecesBetween = (board: Board, from: Location, to: Location): number => {
  let count = 0;
  if (from.row === to.row) {
    // Horizontal
    const minC = Math.min(from.col, to.col);
    const maxC = Math.max(from.col, to.col);
    for (let c = minC + 1; c < maxC; c++) {
      if (board[from.row][c] !== null) count++;
    }
  } else if (from.col === to.col) {
    // Vertical
    const minR = Math.min(from.row, to.row);
    const maxR = Math.max(from.row, to.row);
    for (let r = minR + 1; r < maxR; r++) {
      if (board[r][from.col] !== null) count++;
    }
  }
  return count;
};

/**
 * Applies a player action to the current state.
 * Returns a NEW state object (immutability pattern) or the same state with an error.
 */
export const applyAction = (state: GameState, action: PlayerAction): GameState => {
  // Clone state for immutability (deep clone simplified for this exercise)
  // In production, use structuredClone or a library like Immer.
  const newState: GameState = JSON.parse(JSON.stringify(state));
  newState.error = null;

  // 1. Basic Validation
  if (newState.isGameOver) {
    newState.error = "Game is over.";
    return newState;
  }
  if (action.playerId !== newState.activePlayerIndex) {
    newState.error = "Not your turn.";
    return newState;
  }

  const player = newState.players[action.playerId];
  const opponent = newState.players[1 - action.playerId];

  // --- ACTION HANDLERS ---

  switch (action.type) {
    case ActionType.FLIP: {
      if (!action.flipLocation) {
        newState.error = "Missing flip location.";
        return newState;
      }
      const { row, col } = action.flipLocation;
      const stack = newState.board[row][col];
      
      // Validations
      if (!stack || stack.pieces.length === 0) {
        newState.error = "Nothing to flip.";
        return newState;
      }
      const topPiece = stack.pieces[stack.pieces.length - 1];
      if (topPiece.faceUp) {
        newState.error = "Top piece already revealed.";
        return newState;
      }

      // Execute Flip
      topPiece.faceUp = true;

      // Assign Colors if first move
      if (!newState.colorsAssigned) {
        player.color = topPiece.color;
        opponent.color = topPiece.color === Color.RED ? Color.BLACK : Color.RED;
        newState.colorsAssigned = true;
      }

      break;
    }

    case ActionType.MOVE: {
      if (!action.from || !action.to) {
        newState.error = "Missing from/to coordinates.";
        return newState;
      }
      const { from, to } = action;
      
      if (!isValidCoordinate(from) || !isValidCoordinate(to)) {
        newState.error = "Invalid coordinates.";
        return newState;
      }

      const srcStack = newState.board[from.row][from.col];
      const destStack = newState.board[to.row][to.col];

      // Src Validation
      if (!srcStack || srcStack.pieces.length === 0) {
        newState.error = "No piece at source.";
        return newState;
      }
      const movingPiece = srcStack.pieces[srcStack.pieces.length - 1];

      if (!movingPiece.faceUp) {
        newState.error = "Cannot move a hidden piece.";
        return newState;
      }
      if (newState.colorsAssigned && movingPiece.color !== player.color) {
        newState.error = "Cannot move opponent's piece.";
        return newState;
      }

      // Movement Rules
      const isOrthogonal = (from.row === to.row && Math.abs(from.col - to.col) === 1) ||
                           (from.col === to.col && Math.abs(from.row - to.row) === 1);
      const isJump = (from.row === to.row || from.col === to.col) && !isOrthogonal;

      // Determine interactions
      if (!destStack) {
        // Move to empty space
        if (movingPiece.type === PieceType.CANNON) {
            // Cannon moves like rook to empty space
            if ((from.row !== to.row && from.col !== to.col)) {
                 newState.error = "Cannon must move in straight line.";
                 return newState;
            }
             if (countPiecesBetween(newState.board, from, to) > 0) {
                newState.error = "Cannon cannot jump over pieces to an empty spot.";
                return newState;
            }
        } else if (!isOrthogonal) {
           newState.error = "Normal pieces move 1 step orthogonally.";
           return newState;
        }

        // Execute Move (Transfer piece)
        newState.board[to.row][to.col] = { pieces: [srcStack.pieces.pop()!] };
        if (srcStack.pieces.length === 0) newState.board[from.row][from.col] = null;

      } else {
        // Interaction with existing stack
        const targetPiece = destStack.pieces[destStack.pieces.length - 1];
        
        if (!targetPiece.faceUp) {
           newState.error = "Cannot capture/stack on hidden pieces (Standard Banqi rule).";
           return newState;
        }

        if (targetPiece.color === movingPiece.color) {
           // Friendly: Stack?
           if (!isOrthogonal) {
               newState.error = "Must be adjacent to stack.";
               return newState;
           }
           // Execute Stack
           destStack.pieces.push(srcStack.pieces.pop()!);
           if (srcStack.pieces.length === 0) newState.board[from.row][from.col] = null;

        } else {
           // Enemy: Capture?
           
           // Cannon Special Rule
           if (movingPiece.type === PieceType.CANNON) {
              const screens = countPiecesBetween(newState.board, from, to);
              if (screens !== 1) {
                 newState.error = "Cannon must jump over exactly one screen to capture.";
                 return newState;
              }
           } else {
              if (!isOrthogonal) {
                 newState.error = "Must be adjacent to capture.";
                 return newState;
              }
           }

           // Rank Check
           if (!canCapture(movingPiece.type, targetPiece.type)) {
             newState.error = `Rank too low: ${movingPiece.type} cannot eat ${targetPiece.type}`;
             return newState;
           }

           // Execute Capture
           // Remove enemy piece (put in attacker's HAND for re-deployment logic?)
           // Note: Standard Banqi removes from game. But prompt asked for "HandState". 
           // Let's add captured piece to Player's Hand.
           const captured = destStack.pieces.pop()!;
           captured.faceUp = true; // Ensure revealed (already was)
           captured.color = movingPiece.color; // OPTIONAL: Turncoat mechanic? Or keep original? 
           // Prompt implies standard chess pieces, so ownership usually doesn't change color.
           // But ownership of the *instance* changes. 
           // Let's keep original color but it is in 'player.hand'.
           // Note: If I catch a Black piece, does it become Red? No, usually.
           // But if I can Deploy it, I can deploy a Black piece? 
           // Let's assume "Capture" -> "Kill" (Removed) for now to keep it sane, 
           // UNLESS "Hand" is filled by "Retrieve". 
           // Let's put it in hand, but deploying enemy pieces might be weird.
           // Let's assume standard: Capture = Kill. Hand = From Retrieve.
           // *Revision*: Let's kill it.
           // destStack now has one less piece. If empty, moving piece lands there.
           // BUT wait, usually capture means taking the spot. 
           // If stack has multiple items, do we eat the top and sit on top of the rest?
           // Or eat the whole stack?
           // Let's assume: Eat top piece. Attacker moves to top of stack.
           
           // Actually, simple capture: Attacker replaces Defender.
           // If destStack had 1 piece, it's gone. Attacker lands.
           // If destStack had 2, top gone, attacker on top of bottom? 
           // Let's assume Attacker sits on top of remainder.
           
           // Remove target
           // (In this engine, we just discard captured pieces effectively, 
           // or add to a 'score' pile, not Hand).
           player.capturedPoints += PIECE_RANKS[targetPiece.type]; 
           
           // Move Attacker
           destStack.pieces.push(srcStack.pieces.pop()!);
           if (srcStack.pieces.length === 0) newState.board[from.row][from.col] = null;
        }
      }
      break;
    }

    case ActionType.DEPLOY: {
        // Deploy from Hand to Board
        if (!action.deployTo || !action.deployPieceId) {
            newState.error = "Missing deploy target or piece ID.";
            return newState;
        }

        const { deployTo, deployPieceId } = action;
        if (!isValidCoordinate(deployTo)) {
            newState.error = "Invalid coordinate.";
            return newState;
        }

        const handIndex = player.hand.pieces.findIndex(p => p.id === deployPieceId);
        if (handIndex === -1) {
            newState.error = "Piece not in hand.";
            return newState;
        }
        
        const pieceToDeploy = player.hand.pieces[handIndex];

        // Logic: Can deploy to empty or on top of OWN piece?
        // Let's assume: Can deploy to any empty spot or top of friendly stack.
        const targetStack = newState.board[deployTo.row][deployTo.col];
        
        if (targetStack) {
            const top = targetStack.pieces[targetStack.pieces.length-1];
            if (!top.faceUp || top.color !== player.color) {
                newState.error = "Can only deploy on top of own revealed pieces.";
                return newState;
            }
            // Add to stack
            targetStack.pieces.push(pieceToDeploy);
        } else {
            // Create new stack
            newState.board[deployTo.row][deployTo.col] = { pieces: [pieceToDeploy] };
        }

        // Remove from hand
        player.hand.pieces.splice(handIndex, 1);
        break;
    }

    case ActionType.RETRIEVE: {
        // Take piece from board to hand
        if (!action.retrieveFrom) {
            newState.error = "Missing retrieve location.";
            return newState;
        }
        
        const stack = newState.board[action.retrieveFrom.row][action.retrieveFrom.col];
        if (!stack || stack.pieces.length === 0) {
            newState.error = "Nothing to retrieve.";
            return newState;
        }

        const topPiece = stack.pieces[stack.pieces.length - 1];
        if (!topPiece.faceUp || topPiece.color !== player.color) {
            newState.error = "Can only retrieve your own revealed pieces.";
            return newState;
        }

        // Execute
        const retrieved = stack.pieces.pop()!;
        player.hand.pieces.push(retrieved);
        if (stack.pieces.length === 0) {
            newState.board[action.retrieveFrom.row][action.retrieveFrom.col] = null;
        }

        break;
    }
  }

  // --- Post Action Updates ---
  newState.lastAction = action;
  newState.turnCount++;
  newState.activePlayerIndex = newState.activePlayerIndex === 0 ? 1 : 0;

  return newState;
};


/**
 * Returns a list of all legal actions for the current state.
 * (Simplified implementation for checking game over)
 */
export const getLegalActions = (state: GameState): PlayerAction[] => {
  const actions: PlayerAction[] = [];
  const pid = state.activePlayerIndex;
  const player = state.players[pid];
  
  // 1. Board Iteration
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      const stack = state.board[r][c];
      if (stack && stack.pieces.length > 0) {
        const top = stack.pieces[stack.pieces.length - 1];
        
        // Case A: Hidden Piece (Any player can flip if no colors, or if neutral?) 
        // Usually in Banqi, you can flip any hidden piece regardless of turn color ownership (since it's unknown).
        if (!top.faceUp) {
           actions.push({ type: ActionType.FLIP, playerId: pid, flipLocation: { row: r, col: c } });
        } 
        // Case B: Own Piece - Move or Retrieve
        else if (state.colorsAssigned && top.color === player.color) {
             // Retrieve
             actions.push({ type: ActionType.RETRIEVE, playerId: pid, retrieveFrom: { row: r, col: c } });
             
             // Move (Adjacent)
             const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
             for(const d of dirs) {
                 const tr = r + d[0];
                 const tc = c + d[1];
                 // We generate potential moves, applyAction validation handles detailed rank logic
                 // Optimization: Check bounds here
                 if (tr >= 0 && tr < 4 && tc >= 0 && tc < 8) {
                     actions.push({ type: ActionType.MOVE, playerId: pid, from: {row:r, col:c}, to: {row:tr, col:tc} });
                 }
             }
             // Move (Cannon Jumps) - Loop all cells in row/col
             if (top.type === PieceType.CANNON) {
                 // Naive generation: try all spots in row/col
                 for(let i=0; i<8; i++) {
                     if (i!==c) actions.push({ type: ActionType.MOVE, playerId: pid, from: {row:r, col:c}, to: {row:r, col:i} });
                 }
                 for(let i=0; i<4; i++) {
                     if (i!==r) actions.push({ type: ActionType.MOVE, playerId: pid, from: {row:r, col:c}, to: {row:i, col:c} });
                 }
             }
        }
      } else {
          // Empty spot
          // Deploy?
          if (player.hand.pieces.length > 0) {
              // For every piece type in hand? Just take first of each type to save complexity
              const distinctPieces = new Set(player.hand.pieces.map(p => p.id)); // Just verify distinct logic
              distinctPieces.forEach(id => {
                  actions.push({ type: ActionType.DEPLOY, playerId: pid, deployTo: {row:r, col:c}, deployPieceId: id});
              })
          }
      }
    }
  }
  
  return actions;
};
