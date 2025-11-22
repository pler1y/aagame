
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
  STACK_LIMITS,
  PIECE_RANKS,
  Location,
  CaptureResolution,
} from './types';

// --- Helper Functions: IDs & Setup ---

const generateId = (): string => Math.random().toString(36).substring(2, 9);

const shuffle = <T,>(array: T[]): T[] => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

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

export const initRandomGame = (): GameState => {
  const deck = createDeck();
  const board: Board = Array(4).fill(null).map(() => Array(8).fill(null));

  let deckIndex = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      if (deckIndex < deck.length) {
        board[r][c] = { pieces: [deck[deckIndex++]] };
      }
    }
  }

  return {
    board,
    players: [
      { color: Color.UNKNOWN, hand: { pieces: [] } },
      { color: Color.UNKNOWN, hand: { pieces: [] } },
    ],
    activePlayerIndex: 0,
    colorsAssigned: false,
    turnCount: 0,
    isGameOver: false,
    winner: null,
    lastAction: null,
    error: null,
    pendingChainCapture: null,
  };
};

// --- Helper Functions: Stacking & Logic ---

export const isValidCoordinate = (loc: Location): boolean => {
  return loc.row >= 0 && loc.row < 4 && loc.col >= 0 && loc.col < 8;
};

const getStackWeight = (stack: PieceStack | null): number => {
  return stack ? stack.pieces.length : 0;
};

export const getStackBaseType = (pieces: PieceInstance[]): PieceType => {
  if (pieces.length === 0) throw new Error("Empty stack has no type");
  
  for (const p of pieces) {
    if (p.type !== PieceType.GENERAL) {
      return p.type;
    }
  }
  return PieceType.GENERAL;
};

const getTopPiece = (stack: PieceStack | null): PieceInstance | null => {
  if (!stack || stack.pieces.length === 0) return null;
  return stack.pieces[stack.pieces.length - 1];
};

/**
 * Checks if 'incomingPieces' can be stacked on top of 'targetPieces'.
 * @param checkColor If true, requires color match (Friendly Merge). If false, ignores color (Enemy Stack Capture).
 */
export const canStackOn = (
  targetPieces: PieceInstance[], 
  incomingPieces: PieceInstance[],
  checkColor: boolean
): { valid: boolean; reason?: string } => {
  if (targetPieces.length === 0) return { valid: true };
  
  const topTarget = targetPieces[targetPieces.length - 1];
  const topIncoming = incomingPieces[incomingPieces.length - 1];

  // 1. Color Check (Only for Friendly Merge)
  if (checkColor) {
    if (topTarget.color !== topIncoming.color) {
      return { valid: false, reason: "Color mismatch" };
    }
  }

  // 2. Type Compatibility
  const baseType = getStackBaseType(targetPieces);
  
  // If the base is GENERAL, it accepts ANY friendly piece.
  // Otherwise, incoming pieces must match base type OR be GENERAL.
  if (baseType !== PieceType.GENERAL) {
    for (const p of incomingPieces) {
      const isCompatible = (p.type === baseType) || (p.type === PieceType.GENERAL);
      if (!isCompatible) {
         return { valid: false, reason: `Type mismatch. Stack is ${baseType}, cannot add ${p.type}` };
      }
    }
  }

  // 3. Limit Check
  // Check limits based on the NEW identity.
  const combined = [...targetPieces, ...incomingPieces];
  const newBase = getStackBaseType(combined);
  const limit = STACK_LIMITS[newBase];

  if (combined.length > limit) {
    return { valid: false, reason: `Stack limit exceeded. Type ${newBase} max ${limit}, got ${combined.length}` };
  }

  return { valid: true };
};

const countPiecesBetween = (board: Board, from: Location, to: Location): number => {
  let count = 0;
  if (from.row === to.row) {
    const min = Math.min(from.col, to.col);
    const max = Math.max(from.col, to.col);
    for (let c = min + 1; c < max; c++) {
      if (board[from.row][c] !== null) count++;
    }
  } else if (from.col === to.col) {
    const min = Math.min(from.row, to.row);
    const max = Math.max(from.row, to.row);
    for (let r = min + 1; r < max; r++) {
      if (board[r][from.col] !== null) count++;
    }
  }
  return count;
};

// --- Move & Capture Validators ---

/**
 * Helper to determine if a specific move pattern is valid (ignoring interaction outcome).
 * Returns { valid, isCannonCapture, screens }
 */
const getMovePatternDetails = (board: Board, from: Location, to: Location, baseType: PieceType) => {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const isLine = (from.row === to.row || from.col === to.col);
  const dist = Math.abs(dr) + Math.abs(dc);

  let valid = false;
  let isCannonCapture = false;
  let screens = 0;

  switch (baseType) {
    case PieceType.HORSE:
      if (Math.abs(dr) === 1 && Math.abs(dc) === 1) valid = true;
      break;
    case PieceType.CHARIOT:
      if (isLine) {
        screens = countPiecesBetween(board, from, to);
        if (screens === 0) valid = true;
      }
      break;
    case PieceType.CANNON:
      if (isLine) {
        screens = countPiecesBetween(board, from, to);
        // Cannon Move (0 screens) OR Cannon Jump (1 screen)
        if (screens === 0 || screens === 1) {
          valid = true;
          if (screens === 1) isCannonCapture = true;
        }
      }
      break;
    default: // General, Advisor, Elephant, Soldier
      if (dist === 1) valid = true;
      break;
  }
  return { valid, isCannonCapture, screens };
};

/**
 * Can the piece at 'from' interact with the target at 'to'?
 * - If Enemy: Checks Rank/Weight.
 * - If Friend: Always true (assuming pattern is valid), because we can Retrieve/Merge.
 */
const canPieceCaptureTarget = (board: Board, from: Location, to: Location, attackerStack: PieceStack, defenderStack: PieceStack): boolean => {
  const baseType = getStackBaseType(attackerStack.pieces);
  const pattern = getMovePatternDetails(board, from, to, baseType);

  if (!pattern.valid) return false;

  const atkTop = getTopPiece(attackerStack)!;
  const defTop = getTopPiece(defenderStack)!;

  // Friendly? Always "Capture-able" (Retrieve/Merge)
  if (atkTop.color === defTop.color) return true;

  // Enemy Logic
  const atkWeight = getStackWeight(attackerStack);
  const defWeight = getStackWeight(defenderStack);

  if (atkWeight > defWeight) return true;
  if (atkWeight < defWeight) return false;

  // Weights Equal -> Check Rank
  const atkRank = PIECE_RANKS[atkTop.type];
  const defRank = PIECE_RANKS[defTop.type];

  // Cannon Exception: Jump ignores Rank check on tie
  if (baseType === PieceType.CANNON && pattern.screens === 1) {
    return true; 
  }

  // Soldier Exception: Soldier(0) beats General(6)
  if (atkTop.type === PieceType.SOLDIER && defTop.type === PieceType.GENERAL) {
    return true;
  }
  // General cannot eat Soldier
  if (atkTop.type === PieceType.GENERAL && defTop.type === PieceType.SOLDIER) {
    return false; 
  }

  return atkRank >= defRank;
};

/**
 * Scans for ANY valid interaction (Enemy Capture OR Friendly Retrieve/Merge) from 'loc'.
 */
const hasChainOptions = (gameState: GameState, loc: Location, playerColor: Color): boolean => {
  const { board } = gameState;
  const stack = board[loc.row][loc.col];
  if (!stack) return false;

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      if (r === loc.row && c === loc.col) continue;
      const target = board[r][c];
      if (target) {
        const targetTop = getTopPiece(target);
        // Must be face up
        if (targetTop && targetTop.faceUp) {
          // Scan BOTH Enemy (Capture) and Friend (Retrieve/Merge)
          if (canPieceCaptureTarget(board, loc, {row:r, col:c}, stack, target)) {
            return true;
          }
        }
      }
    }
  }
  return false;
};


// --- Action Handling ---

export const applyAction = (state: GameState, action: PlayerAction): GameState => {
  const newState: GameState = JSON.parse(JSON.stringify(state));
  newState.error = null;

  // Win Check Pre-flight
  if (newState.isGameOver) {
    newState.error = "游戏已结束 (Game is over).";
    return newState;
  }

  // Turn Validation
  if (action.playerId !== newState.activePlayerIndex) {
    newState.error = "不是你的回合 (Not your turn).";
    return newState;
  }

  const player = newState.players[action.playerId];

  // Pending Chain Capture Check
  if (newState.pendingChainCapture) {
    // Must be PASS or MOVE with the pending piece
    if (action.type === ActionType.PASS) {
      // End chain
      newState.pendingChainCapture = null;
      newState.activePlayerIndex = 1 - action.playerId;
      newState.turnCount++;
      return newState;
    } 
    
    if (action.type !== ActionType.MOVE) {
      return fail(newState, "连吃状态下必须继续吃子或跳过 (Must Continue Chain or Pass)");
    }

    if (!action.from || 
        action.from.row !== newState.pendingChainCapture.row || 
        action.from.col !== newState.pendingChainCapture.col) {
       return fail(newState, "连吃状态下只能移动当前棋子 (Must move the chaining piece)");
    }
  } else {
    if (action.type === ActionType.PASS) {
      return fail(newState, "Cannot pass when not chaining");
    }
  }

  // --- MECHANICS ---

  switch (action.type) {
    case ActionType.FLIP: {
      if (!action.flipLocation) return fail(newState, "Missing flip location");
      const { row, col } = action.flipLocation;
      const stack = newState.board[row][col];
      
      if (!stack || stack.pieces.length === 0) return fail(newState, "Empty cell");
      const top = stack.pieces[stack.pieces.length - 1];
      if (top.faceUp) return fail(newState, "Already revealed");

      top.faceUp = true;

      // Assign Colors logic
      if (!newState.colorsAssigned) {
        player.color = top.color;
        const otherPlayer = newState.players[1 - action.playerId];
        otherPlayer.color = top.color === Color.RED ? Color.BLACK : Color.RED;
        newState.colorsAssigned = true;
      }
      
      // Flip ends turn
      newState.activePlayerIndex = 1 - action.playerId;
      newState.turnCount++;
      break;
    }

    case ActionType.MOVE: {
      if (!action.from || !action.to) return fail(newState, "Missing coords");
      const { from, to } = action;
      const captureRes = action.captureResolution || CaptureResolution.TO_HAND;

      if (!isValidCoordinate(from) || !isValidCoordinate(to)) return fail(newState, "Invalid coords");
      if (from.row === to.row && from.col === to.col) return fail(newState, "Cannot move to self");

      const srcStack = newState.board[from.row][from.col];
      if (!srcStack) return fail(newState, "No source");
      
      const movingPiece = getTopPiece(srcStack)!;
      if (!movingPiece.faceUp) return fail(newState, "Cannot move hidden");
      if (newState.colorsAssigned && movingPiece.color !== player.color) return fail(newState, "Not your piece");

      const destStack = newState.board[to.row][to.col];
      const baseType = getStackBaseType(srcStack.pieces);
      
      // Check Pattern
      const pattern = getMovePatternDetails(newState.board, from, to, baseType);
      if (!pattern.valid) return fail(newState, `Invalid move pattern for ${baseType}`);

      let moveIsInteraction = false; // Capture or Merge or Retrieve

      if (!destStack) {
        // Empty cell -> Move
        // If chaining, only captures/interactions are allowed!
        if (newState.pendingChainCapture) {
          return fail(newState, "连吃状态下必须吃子 (Must capture/interact during chain)");
        }
        
        // Cannon cannot move if screens > 0 (Jump only for capture)
        if (baseType === PieceType.CANNON && pattern.screens > 0) {
          return fail(newState, "炮移动时不能跨子 (Cannon needs a target to jump)");
        }

        newState.board[to.row][to.col] = { pieces: [...srcStack.pieces] };
        newState.board[from.row][from.col] = null;
      } 
      else {
        // Occupied -> Interaction (Merge, Retrieve, or Capture)
        const topDest = getTopPiece(destStack)!;
        if (!topDest.faceUp) return fail(newState, "Cannot interact with hidden pieces");

        moveIsInteraction = true;
        
        const isFriendly = topDest.color === player.color;

        // --- INTERACTION LOGIC MATRIX ---

        if (captureRes === CaptureResolution.TO_HAND) {
            // CASE: "To Hand"
            // If Enemy: Standard Capture.
            // If Friend: "Retrieve Friend" (Eat friendly to save/chain).
            
            if (!isFriendly) {
               // Check Enemy Capture Validity
               if (!canPieceCaptureTarget(newState.board, from, to, srcStack, destStack)) {
                   return fail(newState, "Capture failed (Rank/Weight insufficient)");
               }
               // Cannon Check
               if (baseType === PieceType.CANNON && pattern.screens > 1) return fail(newState, "Invalid Cannon capture");
            }

            // Execute "To Hand" (Works for both Enemy and Friend)
            for (const p of destStack.pieces) {
              p.color = player.color; // Convert color (or keep same if friendly)
              player.hand.pieces.push(p);
            }
            // Source moves to Dest
            newState.board[to.row][to.col] = { pieces: [...srcStack.pieces] };
            newState.board[from.row][from.col] = null;

        } else {
            // CASE: "Stack"
            // If Enemy: "Stack Capture" (Crush them).
            // If Friend: "Merge" (Join forces).

            // Check Stack Validity
            // canStackOn param 3 (checkColor): If Friendly, true. If Enemy, false (we force stack).
            const stackCheck = canStackOn(destStack.pieces, srcStack.pieces, isFriendly);
            if (!stackCheck.valid) return fail(newState, `Cannot stack: ${stackCheck.reason}`);

            if (!isFriendly) {
                // Enemy Capture checks
                if (!canPieceCaptureTarget(newState.board, from, to, srcStack, destStack)) {
                   return fail(newState, "Capture failed (Rank/Weight insufficient)");
                }
                // Cannon Check
                if (baseType === PieceType.CANNON && pattern.screens > 1) return fail(newState, "Invalid Cannon capture");
            }

            // Execute Stack
            // Source goes ON TOP of Dest
            const combined = [...destStack.pieces, ...srcStack.pieces];
            newState.board[to.row][to.col] = { pieces: combined };
            newState.board[from.row][from.col] = null;
        }
      }

      // --- Post Move: Chain Logic ---
      // If we interacted (Captured/Merged/Retrieved), check if we can do it again!
      // IMPORTANT: Check from the NEW position ('to') using the NEW stack state.
      if (moveIsInteraction && hasChainOptions(newState, to, player.color)) {
        newState.pendingChainCapture = to;
        newState.lastAction = action; 
        // Do NOT increment turn count
      } else {
        newState.pendingChainCapture = null;
        newState.activePlayerIndex = 1 - action.playerId;
        newState.turnCount++;
      }

      break;
    }

    case ActionType.DEPLOY: {
      if (newState.pendingChainCapture) return fail(newState, "Cannot deploy during chain");

      if (!action.deployTo || !action.deployType || !action.deployCount) 
        return fail(newState, "Missing deploy params");
      
      const { deployTo, deployType, deployCount } = action;
      if (deployCount < 1) return fail(newState, "Count must be >= 1");
      if (!isValidCoordinate(deployTo)) return fail(newState, "Invalid coords");

      // Check Hand
      const availableIndices: number[] = [];
      player.hand.pieces.forEach((p, i) => {
        if (p.type === deployType) availableIndices.push(i);
      });

      if (availableIndices.length < deployCount) 
        return fail(newState, `Not enough ${deployType} in hand`);

      const piecesToDeploy: PieceInstance[] = [];
      let found = 0;
      player.hand.pieces = player.hand.pieces.filter(p => {
        if (found < deployCount && p.type === deployType) {
          piecesToDeploy.push(p);
          found++;
          return false;
        }
        return true;
      });

      const targetStack = newState.board[deployTo.row][deployTo.col];
      if (!targetStack) {
        newState.board[deployTo.row][deployTo.col] = { pieces: piecesToDeploy };
      } else {
        const top = getTopPiece(targetStack)!;
        if (!top.faceUp) {
           player.hand.pieces.push(...piecesToDeploy);
           return fail(newState, "Cannot deploy on hidden");
        }
        if (top.color !== player.color) {
           player.hand.pieces.push(...piecesToDeploy);
           return fail(newState, "Cannot deploy on enemy");
        }

        const check = canStackOn(targetStack.pieces, piecesToDeploy, true);
        if (!check.valid) {
           player.hand.pieces.push(...piecesToDeploy);
           return fail(newState, `Deploy failed: ${check.reason}`);
        }

        targetStack.pieces.push(...piecesToDeploy);
      }

      newState.activePlayerIndex = 1 - action.playerId;
      newState.turnCount++;
      break;
    }

    case ActionType.RETRIEVE: {
      if (newState.pendingChainCapture) return fail(newState, "Cannot retrieve during chain");

      if (!action.retrieveFrom || !action.retrievePieceIds) 
        return fail(newState, "Missing retrieve params");
      
      const { retrieveFrom, retrievePieceIds } = action;
      const stack = newState.board[retrieveFrom.row][retrieveFrom.col];
      
      if (!stack) return fail(newState, "No stack");
      const top = getTopPiece(stack)!;
      if (top.color !== player.color) return fail(newState, "Not your stack");

      if (stack.pieces.length - retrievePieceIds.length < 1) {
        return fail(newState, "Must leave at least 1 piece");
      }

      const stackIds = new Set(stack.pieces.map(p => p.id));
      for (const id of retrievePieceIds) {
        if (!stackIds.has(id)) return fail(newState, `Piece ${id} not in stack`);
      }

      const newStackPieces: PieceInstance[] = [];
      const retrievedPieces: PieceInstance[] = [];

      for (const p of stack.pieces) {
        if (retrievePieceIds.includes(p.id)) {
          retrievedPieces.push(p);
        } else {
          newStackPieces.push(p);
        }
      }
      
      stack.pieces = newStackPieces;
      player.hand.pieces.push(...retrievedPieces);

      newState.activePlayerIndex = 1 - action.playerId;
      newState.turnCount++;
      break;
    }
  }

  newState.lastAction = action;

  // Win Condition Check (After move resolved)
  if (newState.pendingChainCapture) return newState;

  if (newState.colorsAssigned) {
    const nextPlayerIdx = newState.activePlayerIndex;
    const nextPlayerColor = newState.players[nextPlayerIdx].color;
    
    let hasPieceOnBoard = false;
    let allRevealed = true;

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 8; c++) {
        const s = newState.board[r][c];
        if (s) {
          const top = getTopPiece(s)!;
          if (!top.faceUp) allRevealed = false;
          else if (top.color === nextPlayerColor) hasPieceOnBoard = true;
        }
      }
    }

    if (allRevealed && !hasPieceOnBoard) {
      newState.isGameOver = true;
      newState.winner = 1 - nextPlayerIdx; // Previous player wins
      return newState;
    }

    // No Legal Moves Check
    const legalActions = getLegalActions(newState, nextPlayerIdx);
    if (legalActions.length === 0) {
       newState.isGameOver = true;
       newState.winner = 1 - nextPlayerIdx;
    }
  }

  return newState;
};

const fail = (state: GameState, msg: string): GameState => {
  state.error = msg;
  return state;
};

/**
 * Generates all legal actions for the given player.
 * Used mainly for "Game Over" detection (Stalemate).
 */
export const getLegalActions = (state: GameState, playerIndex: number): PlayerAction[] => {
  const actions: PlayerAction[] = [];
  const player = state.players[playerIndex];
  const { board } = state;

  // 1. Chain Capture Logic
  if (state.pendingChainCapture) {
    actions.push({ type: ActionType.PASS, playerId: playerIndex });
    const { row, col } = state.pendingChainCapture;
    const stack = board[row][col];
    if (stack) {
       // Scan targets for that specific piece
       for(let tr=0; tr<4; tr++) {
         for(let tc=0; tc<8; tc++) {
            if(tr===row && tc===col) continue;
            const target = state.board[tr][tc];
            if (target) {
              const tTop = getTopPiece(target);
              if (tTop && tTop.faceUp) { 
                 // Can interact with any face up piece (Friendly or Enemy)
                 if (canPieceCaptureTarget(state.board, {row, col}, {row:tr, col:tc}, stack, target)) {
                    // Add standard Capture/Retrieve action
                    actions.push({
                      type: ActionType.MOVE,
                      playerId: playerIndex,
                      from: {row, col},
                      to: {row: tr, col: tc},
                      captureResolution: CaptureResolution.TO_HAND
                    });
                 }
              }
            }
         }
       }
    }
    return actions;
  }

  // 2. Global Scan
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
       const stack = board[r][c];

       // EMPTY: Deploy
       if (!stack) {
         if (player.hand.pieces.length > 0) {
             const handTypes = new Set(player.hand.pieces.map(p => p.type));
             handTypes.forEach(t => {
                actions.push({ 
                    type: ActionType.DEPLOY, 
                    playerId: playerIndex, 
                    deployTo: {row: r, col: c}, 
                    deployType: t, 
                    deployCount: 1 
                });
             });
         }
         continue;
       }

       const top = stack.pieces[stack.pieces.length - 1];

       // HIDDEN: Flip
       if (!top.faceUp) {
         actions.push({ type: ActionType.FLIP, playerId: playerIndex, flipLocation: {row: r, col: c} });
         continue;
       }

       // FRIENDLY: Move/Retrieve
       if (state.colorsAssigned && top.color === player.color) {
         // Retrieve
         if (stack.pieces.length > 1) {
            actions.push({
                type: ActionType.RETRIEVE,
                playerId: playerIndex,
                retrieveFrom: {row: r, col: c},
                retrievePieceIds: [top.id] 
            });
         }

         // Scan moves
         const baseType = getStackBaseType(stack.pieces);
         for (let tr = 0; tr < 4; tr++) {
           for (let tc = 0; tc < 8; tc++) {
             if (r === tr && c === tc) continue;

             // Pattern check first
             const pattern = getMovePatternDetails(board, {row:r, col:c}, {row:tr, col:tc}, baseType);
             if (!pattern.valid) continue;

             const targetStack = board[tr][tc];

             // Target Empty
             if (!targetStack) {
               if (baseType === PieceType.CANNON && pattern.screens > 0) continue;
               actions.push({ type: ActionType.MOVE, playerId: playerIndex, from: {row:r,col:c}, to: {row:tr,col:tc} });
               continue;
             }

             const targetTop = targetStack.pieces[targetStack.pieces.length - 1];
             if (!targetTop.faceUp) continue; // Cannot interact with hidden

             // Interaction (Capture or Merge)
             const isFriendly = targetTop.color === player.color;

             if (isFriendly) {
                // Merge
                if (canStackOn(targetStack.pieces, stack.pieces, true).valid) {
                    actions.push({ type: ActionType.MOVE, playerId: playerIndex, from: {row:r,col:c}, to: {row:tr,col:tc}, captureResolution: CaptureResolution.STACK_IF_POSSIBLE });
                }
                // Retrieve Friend (Capture to Hand) - Always possible for friends
                actions.push({ type: ActionType.MOVE, playerId: playerIndex, from: {row:r,col:c}, to: {row:tr,col:tc}, captureResolution: CaptureResolution.TO_HAND });
             } else {
                // Enemy
                if (canPieceCaptureTarget(board, {row:r,col:c}, {row:tr,col:tc}, stack, targetStack)) {
                     actions.push({ type: ActionType.MOVE, playerId: playerIndex, from: {row:r,col:c}, to: {row:tr,col:tc}, captureResolution: CaptureResolution.TO_HAND });
                     
                     if (canStackOn(targetStack.pieces, stack.pieces, false).valid) {
                        actions.push({ type: ActionType.MOVE, playerId: playerIndex, from: {row:r,col:c}, to: {row:tr,col:tc}, captureResolution: CaptureResolution.STACK_IF_POSSIBLE });
                     }
                }
             }
           }
         }
       }
    }
  }
  return actions;
};
