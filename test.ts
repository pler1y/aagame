import { initRandomGame, applyAction, getLegalActions } from './gameEngine';
import { ActionType, GameState } from './types';

export const runTests = () => {
  const logs: string[] = [];
  const log = (msg: string) => logs.push(msg);

  log("=== Starting Test Suite ===");

  // 1. Init Game
  let state = initRandomGame();
  log("Game Initialized.");
  log(`Board Size: ${state.board.length}x${state.board[0].length}`);
  
  // 2. Random Flip (Start Game)
  // Find a valid flip location (0,0 usually has a piece)
  log("--- Action 1: Player 0 Flips (0,0) ---");
  const flipAction = {
      type: ActionType.FLIP,
      playerId: 0,
      flipLocation: { row: 0, col: 0 }
  };
  state = applyAction(state, flipAction);
  
  if (state.error) {
      log(`Error: ${state.error}`);
  } else {
      const revealed = state.board[0][0]?.pieces[0];
      log(`Result: Piece revealed at (0,0) is [${revealed?.color} ${revealed?.type}].`);
      log(`Colors Assigned: Red=${state.players[state.activePlayerIndex === 0 ? 1 : 0].color === 'RED' ? 'P0' : 'P1' } (Logic depends on turn switch)`);
      log(`Active Player is now: ${state.activePlayerIndex}`);
  }

  // 3. Attempt Illegal Move (Hidden piece)
  log("--- Action 2: Player 1 tries to move a hidden piece at (0,1) ---");
  const illegalMove = {
      type: ActionType.MOVE,
      playerId: state.activePlayerIndex,
      from: { row: 0, col: 1 },
      to: { row: 0, col: 2 }
  };
  const errorState = applyAction(state, illegalMove);
  log(`Result: ${errorState.error ? "Caught Expected Error: " + errorState.error : "UNEXPECTED SUCCESS"}`);

  // 4. Valid Flip by Player 1
  log("--- Action 3: Player 1 Flips (0,1) ---");
  const flipAction2 = {
      type: ActionType.FLIP,
      playerId: state.activePlayerIndex,
      flipLocation: { row: 0, col: 1 }
  };
  state = applyAction(state, flipAction2);
  log(`Result: Piece revealed at (0,1). Active Player now: ${state.activePlayerIndex}`);

  // 5. Check Legal Actions
  const legalActions = getLegalActions(state);
  log(`Legal Actions Available: ${legalActions.length}`);
  
  // 6. Retrieve Test (Hypothetical: if P0 revealed piece at 0,0 is theirs, try to retrieve)
  // Force state for testing logic
  log("--- Test: Retrieve Mechanic ---");
  // Let's hack the state to ensure (0,0) belongs to current player for testing
  const pIndex = state.activePlayerIndex;
  if(state.board[0][0]) {
      state.board[0][0]!.pieces[0].color = state.players[pIndex].color!; // Force ownership
      state.board[0][0]!.pieces[0].faceUp = true;
  }
  
  const retrieveAction = {
      type: ActionType.RETRIEVE,
      playerId: pIndex,
      retrieveFrom: { row: 0, col: 0 }
  };
  state = applyAction(state, retrieveAction);
  if(state.error) {
      log(`Retrieve Error: ${state.error}`);
  } else {
      log(`Retrieve Success. Hand count for P${pIndex}: ${state.players[pIndex].hand.pieces.length}`);
      log(`Board at (0,0) is now: ${state.board[0][0] ? 'Occupied' : 'Empty'}`);
  }
  
  // 7. Deploy Test
  log("--- Test: Deploy Mechanic ---");
  if (state.players[pIndex].hand.pieces.length > 0) {
      const pieceId = state.players[pIndex].hand.pieces[0].id;
      const deployAction = {
          type: ActionType.DEPLOY,
          playerId: pIndex, // Technically turn switched after retrieve, so this might fail if we don't reset turn or valid player.
          // Wait, applyAction switched turn. So we must use current active player.
          // But current active player is the OTHER one who has empty hand.
          // So we expect failure unless we cheat turn.
      };
      
      // Let's try to deploy with the CURRENT active player (likely empty hand) -> Error expected
      const deployAttempt = {
           type: ActionType.DEPLOY,
           playerId: state.activePlayerIndex,
           deployTo: { row: 0, col: 0 },
           deployPieceId: "fake_id"
      };
      const res = applyAction(state, deployAttempt);
      log(`Deploy Attempt (Empty Hand/Wrong ID): ${res.error}`);
  }

  return logs;
};
