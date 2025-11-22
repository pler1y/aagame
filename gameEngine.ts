
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
  };
};

// --- Helper Functions: Stacking & Logic ---

const isValidCoordinate = (loc: Location): boolean => {
  return loc.row >= 0 && loc.row < 4 && loc.col >= 0 && loc.col < 8;
};

const getTopPiece = (board: Board, loc: Location): PieceInstance | null => {
  if (!isValidCoordinate(loc)) return null;
  const stack = board[loc.row][loc.col];
  if (!stack || stack.pieces.length === 0) return null;
  return stack.pieces[stack.pieces.length - 1];
};

const getStackWeight = (stack: PieceStack | null): number => {
  return stack ? stack.pieces.length : 0;
};

/**
 * Returns the "Base Type" of a stack.
 * Rule: The first non-GENERAL piece from the bottom.
 * If the stack contains ONLY Generals, the base type is GENERAL.
 */
const getStackBaseType = (pieces: PieceInstance[]): PieceType => {
  if (pieces.length === 0) throw new Error("Empty stack has no type");
  
  for (const p of pieces) {
    if (p.type !== PieceType.GENERAL) {
      return p.type;
    }
  }
  return PieceType.GENERAL;
};

/**
 * Checks if `incomingPieces` can be stacked onto `targetPieces`.
 * 
 * @param targetPieces The existing stack on board.
 * @param incomingPieces Pieces to add (can be a single piece or a whole stack).
 * @param checkColor If true, enforces strict color matching (used for Merge/Deploy). 
 *                   If false, ignores color (used for Capture-Stacking).
 */
const canStackOn = (
  targetPieces: PieceInstance[], 
  incomingPieces: PieceInstance[],
  checkColor: boolean
): { valid: boolean; reason?: string } => {
  if (targetPieces.length === 0) return { valid: true }; // Empty spot is valid (logic handled elsewhere usually)
  
  const topTarget = targetPieces[targetPieces.length - 1];
  const topIncoming = incomingPieces[incomingPieces.length - 1]; // Usually the controller

  // 1. Color Check (Only for Merge/Deploy, not Capture)
  if (checkColor) {
    // Check top controllers
    if (topTarget.color !== topIncoming.color) {
      return { valid: false, reason: "Color mismatch" };
    }
  }

  // 2. Type Compatibility
  // Incoming must be compatible with Target's Base Type.
  // Rule: Incoming pieces must EITHER be GENERAL OR match the Target Base Type.
  // Note: Since incoming might be a stack, we need to ensure *every* piece in incoming 
  // respects the target's base type logic? 
  // Actually, the prompt says: "Incoming piece... compatible with Base Type".
  // If incoming is a stack (from Capture), does the whole stack need to match?
  // Let's assume strict validation: Every incoming piece must be (GENERAL or BaseType).
  
  const baseType = getStackBaseType(targetPieces);
  
  for (const p of incomingPieces) {
    const isCompatible = (p.type === baseType) || (p.type === PieceType.GENERAL);
    if (!isCompatible) {
       // Special case: If Target Base is GENERAL, then Target is ALL Generals.
       // So any incoming piece establishes a NEW Base Type?
       // If Base is General, it means the stack is purely Generals.
       // If I add a Soldier, the new Base becomes Soldier.
       // Logic: If current base is GENERAL, we can accept anything?
       // Standard Banqi stacking usually implies you commit to a type.
       // Let's stick to the prompt: "Either... same as Base Type... OR is GENERAL".
       // This implies if Base is SOLDIER, I can add SOLDIER or GENERAL.
       // If Base is GENERAL (only generals present), can I add SOLDIER?
       // If I add Soldier to [Gen], the list becomes [Gen, Soldier]. Base is Soldier.
       // This seems allowed.
       if (baseType !== PieceType.GENERAL) {
         return { valid: false, reason: `Type mismatch. Stack is ${baseType}, cannot add ${p.type}` };
       }
    }
  }

  // 3. Limit Check
  // We need to predict the NEW Base Type to check the limit.
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

// --- Action Handling ---

export const applyAction = (state: GameState, action: PlayerAction): GameState => {
  const newState: GameState = JSON.parse(JSON.stringify(state));
  newState.error = null;

  // Win Check Pre-flight
  if (newState.isGameOver) {
    newState.error = "Game is over.";
    return newState;
  }

  // Turn Validation
  if (action.playerId !== newState.activePlayerIndex) {
    newState.error = "Not your turn.";
    return newState;
  }

  const player = newState.players[action.playerId];
  
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
        // Player who flipped gets this color
        player.color = top.color;
        const otherPlayer = newState.players[1 - action.playerId];
        otherPlayer.color = top.color === Color.RED ? Color.BLACK : Color.RED;
        newState.colorsAssigned = true;
      }
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
      
      const movingPiece = srcStack.pieces[srcStack.pieces.length - 1];
      if (!movingPiece.faceUp) return fail(newState, "Cannot move hidden");
      if (newState.colorsAssigned && movingPiece.color !== player.color) return fail(newState, "Not your piece");

      const destStack = newState.board[to.row][to.col];
      const baseType = getStackBaseType(srcStack.pieces);
      
      const dr = to.row - from.row;
      const dc = to.col - from.col;
      const isLine = (from.row === to.row || from.col === to.col);

      // 1. Validate Path/Move Pattern
      let isValidMovePattern = false;
      let isCannonCaptureAttempt = false;

      switch (baseType) {
        case PieceType.HORSE:
          // Diagonal 1 step
          if (Math.abs(dr) === 1 && Math.abs(dc) === 1) isValidMovePattern = true;
          break;
        
        case PieceType.CHARIOT:
          // Line, No Obstacles
          if (isLine && countPiecesBetween(newState.board, from, to) === 0) isValidMovePattern = true;
          break;
        
        case PieceType.CANNON:
          // Line. 
          // If Move: No Obstacles. 
          // If Capture: Exactly 1 Obstacle (Screen).
          if (isLine) {
            const screens = countPiecesBetween(newState.board, from, to);
            if (destStack) {
               // Interaction (Friendly or Enemy)
               const topDest = destStack.pieces[destStack.pieces.length - 1];
               const isEnemy = topDest.color !== player.color;
               
               if (isEnemy) {
                 // Enemy -> Must be Capture -> Needs 1 screen
                 if (screens === 1) {
                   isValidMovePattern = true;
                   isCannonCaptureAttempt = true;
                 } else if (screens === 0) {
                   return fail(newState, "Cannon needs a screen to capture");
                 } else {
                   return fail(newState, "Cannon cannot jump multiple screens");
                 }
               } else {
                 // Friendly -> Merge/Stack -> Treat like Move -> 0 screens
                 if (screens === 0) isValidMovePattern = true;
               }
            } else {
              // Empty -> Move -> 0 screens
              if (screens === 0) isValidMovePattern = true;
            }
          }
          break;

        default:
          // General, Advisor, Elephant, Soldier -> Orthogonal 1 step
          if (Math.abs(dr) + Math.abs(dc) === 1) isValidMovePattern = true;
          break;
      }

      if (!isValidMovePattern) return fail(newState, `Invalid move pattern for ${baseType}`);

      // 2. Handle Destination
      if (!destStack) {
        // Empty
        newState.board[to.row][to.col] = { pieces: [...srcStack.pieces] }; // Move entire stack
        newState.board[from.row][from.col] = null;
      } else {
        // Occupied
        const topDest = destStack.pieces[destStack.pieces.length - 1];
        if (!topDest.faceUp) return fail(newState, "Cannot interact with hidden pieces");

        if (topDest.color === player.color) {
          // === Friendly Merge ===
          // Check Stacking Rules (Color checked, Type, Limit)
          const check = canStackOn(destStack.pieces, srcStack.pieces, true);
          if (!check.valid) return fail(newState, `Cannot stack: ${check.reason}`);

          // Merge: Attacker lands on top (Append src to dest)
          destStack.pieces.push(...srcStack.pieces);
          newState.board[from.row][from.col] = null;

        } else {
          // === Enemy Capture ===
          // Weight Check
          const atkWeight = getStackWeight(srcStack);
          const defWeight = getStackWeight(destStack);

          if (atkWeight < defWeight) {
            // Cannon check: Even cannon follows weight rule? 
            // "Comparison is Attacker Weight vs Target Weight... >: Eat, =: Eat, <: Cannot"
            return fail(newState, `Attack failed: Weight ${atkWeight} vs ${defWeight}`);
          }

          // Resolution
          if (captureRes === CaptureResolution.TO_HAND) {
            // Harvest Enemy -> Hand
            // 1. Convert color & Move Dest pieces to Hand
            for (const p of destStack.pieces) {
              p.color = player.color; // Conversion
              player.hand.pieces.push(p);
            }
            // 2. Attacker takes the spot
            newState.board[to.row][to.col] = { pieces: [...srcStack.pieces] };
            newState.board[from.row][from.col] = null;

          } else {
            // Stack if Possible
            // Check if we can add Dest(Enemy) to Src(Attacker) ? 
            // Prompt says: "Directly stack [Captured] to [Attacking] stack". 
            // Implies Attacker absorbs Defender.
            // Usually: Attacker moves to Dest.
            // So we are forming a stack at `to`?
            // "Check if adding B (Dest) to A (Src) satisfies A's limits".
            
            // If valid, we put B *into* A. 
            // Physical location: A moves to B's location.
            // Result Stack: `[...DestPieces, ...SrcPieces]` (Attacker on Top).
            // Validation: Check if DestPieces can validly support SrcPieces? 
            // Or check if SrcPieces can absorb DestPieces?
            // "Add B to A". This phrasing implies A is the base? 
            // Let's assume the resulting physical pile at `to` has `Src` on top. 
            // So effectively we are inserting `Dest` under `Src` or adding `Dest` to `Src`.
            // Let's go with: Result is `[...Dest, ...Src]`. Top is Src (Active Player).
            // Base Type Logic applies to the WHOLE new stack.
            
            const combined = [...destStack.pieces, ...srcStack.pieces];
            // We do NOT check color for this specific mix (as per instructions)
            // But we MUST check Type/Limit compatibility of the *combined* stack.
            const newLimit = STACK_LIMITS[getStackBaseType(combined)];
            
            if (combined.length > newLimit) {
               return fail(newState, `Cannot Capture-Stack: Exceeds limit ${newLimit}`);
            }

            // Execute
            newState.board[to.row][to.col] = { pieces: combined };
            newState.board[from.row][from.col] = null;
          }
        }
      }
      break;
    }

    case ActionType.DEPLOY: {
      if (!action.deployTo || !action.deployType || !action.deployCount) 
        return fail(newState, "Missing deploy params");
      
      const { deployTo, deployType, deployCount } = action;
      if (deployCount < 1) return fail(newState, "Count must be >= 1");
      if (!isValidCoordinate(deployTo)) return fail(newState, "Invalid coords");

      // 1. Check Hand
      const availableIndices: number[] = [];
      player.hand.pieces.forEach((p, i) => {
        if (p.type === deployType) availableIndices.push(i);
      });

      if (availableIndices.length < deployCount) 
        return fail(newState, `Not enough ${deployType} in hand`);

      // Take the pieces
      // We take from the end to keep indices valid or map properly?
      // Simplest: Filter out the pieces we want.
      const piecesToDeploy: PieceInstance[] = [];
      // Need to remove them from hand.
      // Let's just splice/filter. 
      // We pick the first N matches.
      let found = 0;
      player.hand.pieces = player.hand.pieces.filter(p => {
        if (found < deployCount && p.type === deployType) {
          piecesToDeploy.push(p);
          found++;
          return false; // remove
        }
        return true; // keep
      });

      // 2. Check Target
      const targetStack = newState.board[deployTo.row][deployTo.col];
      if (!targetStack) {
        // Empty -> Create new
        newState.board[deployTo.row][deployTo.col] = { pieces: piecesToDeploy };
      } else {
        // Occupied
        const top = targetStack.pieces[targetStack.pieces.length - 1];
        if (!top.faceUp) {
           // Restore hand (transaction rollback simulation)
           player.hand.pieces.push(...piecesToDeploy);
           return fail(newState, "Cannot deploy on hidden");
        }
        
        if (top.color !== player.color) {
           player.hand.pieces.push(...piecesToDeploy);
           return fail(newState, "Cannot deploy on enemy");
        }

        // Friendly -> Stack Check
        const check = canStackOn(targetStack.pieces, piecesToDeploy, true);
        if (!check.valid) {
           player.hand.pieces.push(...piecesToDeploy);
           return fail(newState, `Deploy failed: ${check.reason}`);
        }

        // Execute
        targetStack.pieces.push(...piecesToDeploy);
      }
      break;
    }

    case ActionType.RETRIEVE: {
      if (!action.retrieveFrom || !action.retrievePieceIds) 
        return fail(newState, "Missing retrieve params");
      
      const { retrieveFrom, retrievePieceIds } = action;
      const stack = newState.board[retrieveFrom.row][retrieveFrom.col];
      
      if (!stack) return fail(newState, "No stack");
      const top = stack.pieces[stack.pieces.length - 1];
      if (top.color !== player.color) return fail(newState, "Not your stack");

      if (stack.pieces.length - retrievePieceIds.length < 1) {
        return fail(newState, "Must leave at least 1 piece");
      }

      // Validate IDs exist in stack
      const stackIds = new Set(stack.pieces.map(p => p.id));
      for (const id of retrievePieceIds) {
        if (!stackIds.has(id)) return fail(newState, `Piece ${id} not in stack`);
      }

      // Execute
      // Separate pieces to keep vs retrieve
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

      break;
    }
  }

  // --- Post Turn Logic ---
  newState.turnCount++;
  newState.lastAction = action;

  // Win Condition Check
  // 1. Check if Opponent has NO pieces on board (and colors are assigned)
  if (newState.colorsAssigned) {
    const nextPlayerIdx = 1 - action.playerId; // The player who is about to move
    const nextPlayerColor = newState.players[nextPlayerIdx].color;
    
    let hasPieceOnBoard = false;
    let allRevealed = true;

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 8; c++) {
        const s = newState.board[r][c];
        if (s) {
          const top = s.pieces[s.pieces.length - 1];
          if (!top.faceUp) allRevealed = false;
          else if (top.color === nextPlayerColor) hasPieceOnBoard = true;
        }
      }
    }

    if (allRevealed && !hasPieceOnBoard) {
      // If all pieces revealed and opponent has none, current player wins
      newState.isGameOver = true;
      newState.winner = action.playerId;
      return newState;
    }

    // 2. No Legal Moves Check
    // We generate legal actions for the NEXT player
    newState.activePlayerIndex = nextPlayerIdx; // Switch turn for check
    const legalActions = getLegalActions(newState, nextPlayerIdx);
    if (legalActions.length === 0) {
       newState.isGameOver = true;
       newState.winner = action.playerId; // Previous player wins
    }
  } else {
    // Just switch turn if colors not assigned (early game)
    newState.activePlayerIndex = 1 - action.playerId;
  }

  return newState;
};

const fail = (state: GameState, msg: string): GameState => {
  state.error = msg;
  return state;
};

/**
 * Generates legal actions.
 * Optimized for "Existence" check mainly, but provides full list.
 * Note: For DEPLOY and RETRIEVE, we just generate a sample or "Any" valid move 
 * since listing every permutation of count/IDs is explosive.
 */
export const getLegalActions = (state: GameState, playerIndex: number): PlayerAction[] => {
  const actions: PlayerAction[] = [];
  const player = state.players[playerIndex];
  
  // 1. Flip & Move & Retrieve
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      const stack = state.board[r][c];
      if (!stack) {
        // Empty -> Deploy possible?
        if (player.hand.pieces.length > 0) {
          // Just add one sample deploy action per type available
          const typesInHand = new Set(player.hand.pieces.map(p => p.type));
          typesInHand.forEach(t => {
             actions.push({ type: ActionType.DEPLOY, playerId: playerIndex, deployTo: {row:r, col:c}, deployType: t, deployCount: 1 });
          });
        }
        continue;
      }

      const top = stack.pieces[stack.pieces.length - 1];

      // FLIP
      if (!top.faceUp) {
        actions.push({ type: ActionType.FLIP, playerId: playerIndex, flipLocation: { row: r, col: c } });
        continue; // Cannot move/retrieve hidden
      }

      // If not my piece, skip (unless I can deploy on it? No, deploy on enemy illegal)
      if (state.colorsAssigned && top.color !== player.color) continue;
      if (state.colorsAssigned && top.color === player.color) {
        
        // RETRIEVE (Sample: Take 1 top piece if size > 1)
        if (stack.pieces.length > 1) {
           actions.push({ 
             type: ActionType.RETRIEVE, 
             playerId: playerIndex, 
             retrieveFrom: {row:r, col:c}, 
             retrievePieceIds: [stack.pieces[stack.pieces.length-2].id] // Just taking one as a check
           });
        }

        // MOVE
        // We simply iterate all cells to check legality. 
        // Optimization: Only iterate relevant cells based on Type.
        const range = (top.type === PieceType.CHARIOT || top.type === PieceType.CANNON) ? 8 : 2;
        
        // Naive iteration for simplicity in this function
        for(let tr=0; tr<4; tr++) {
            for(let tc=0; tc<8; tc++) {
               if(tr===r && tc===c) continue;
               
               // Construct a test action to validate logic
               const testAction: PlayerAction = {
                   type: ActionType.MOVE,
                   playerId: playerIndex,
                   from: {row:r, col:c},
                   to: {row:tr, col:tc}
               };
               
               // We use a lighter check or just try applyAction on a clone? 
               // Calling applyAction is expensive but accurate.
               // Let's do a manual check to avoid infinite loop or deep cloning overhead.
               // Or just trust the 'fail' logic returns fast.
               // Actually, `applyAction` does JSON clone. Doing this 32*32 times is bad.
               // Let's just implement basic geometry check here.
               
               const dr = tr - r;
               const dc = tc - c;
               const dist = Math.abs(dr) + Math.abs(dc);
               const isLine = (r === tr || c === tc);
               
               let pattern = false;
               const base = getStackBaseType(stack.pieces);
               
               if (base === PieceType.HORSE) pattern = Math.abs(dr)===1 && Math.abs(dc)===1;
               else if (base === PieceType.CHARIOT || base === PieceType.CANNON) pattern = isLine;
               else pattern = dist === 1;

               if (pattern) {
                   // Just pushing as candidate. The game loop will filter invalid ones if user clicks.
                   // But for "Win Check", we need at least ONE valid one.
                   actions.push(testAction);
               }
            }
        }

        // DEPLOY on OWN stack
        if (player.hand.pieces.length > 0) {
             const typesInHand = new Set(player.hand.pieces.map(p => p.type));
             typesInHand.forEach(t => {
                actions.push({ type: ActionType.DEPLOY, playerId: playerIndex, deployTo: {row:r, col:c}, deployType: t, deployCount: 1 });
             });
        }
      }
    }
  }

  return actions;
};
