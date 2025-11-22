
import { initRandomGame, applyAction, getLegalActions } from './gameEngine';
import { ActionType, GameState, PieceType, CaptureResolution, PIECE_RANKS } from './types';

export const runTests = () => {
  const logs: string[] = [];
  const log = (msg: string) => logs.push(msg);

  log("=== NEW TESTS: Rank, Chain, General Stacking ===");

  let state = initRandomGame();
  
  // Flip to assign colors
  state = applyAction(state, {
      type: ActionType.FLIP,
      playerId: 0,
      flipLocation: { row: 0, col: 0 }
  });
  const p0Color = state.players[0].color;
  const p1Color = state.players[1].color;
  log(`P0 is ${p0Color}, P1 is ${p1Color}`);

  // --- TEST 1: RANK LOGIC (Soldier vs General) ---
  log("\n--- Test 1: Soldier vs General (Rank) ---");
  state.board[0][0] = { pieces: [{id:'s1', type: PieceType.SOLDIER, color: p0Color, faceUp: true}] };
  state.board[0][1] = { pieces: [{id:'g1', type: PieceType.GENERAL, color: p1Color, faceUp: true}] };
  // Reset turn to P0
  state.activePlayerIndex = 0;

  // Soldier (Rank 0) attacking General (Rank 6) -> Should Win
  state = applyAction(state, {
      type: ActionType.MOVE,
      playerId: 0,
      from: {row:0, col:0},
      to: {row:0, col:1},
      captureResolution: CaptureResolution.TO_HAND
  });
  
  if (state.error) log(`FAIL: Soldier vs General error: ${state.error}`);
  else log(`SUCCESS: Soldier ate General.`);

  // --- TEST 2: CHAIN CAPTURE ---
  log("\n--- Test 2: Chain Capture (Chariot) ---");
  // Setup: P0 Chariot at (2,0). Enemies at (2,2) and (2,4).
  state.board[2][0] = { pieces: [{id:'c1', type: PieceType.CHARIOT, color: p0Color, faceUp: true}] };
  state.board[2][1] = null;
  state.board[2][2] = { pieces: [{id:'e1', type: PieceType.SOLDIER, color: p1Color, faceUp: true}] }; // Enemy 1
  state.board[2][3] = null;
  state.board[2][4] = { pieces: [{id:'e2', type: PieceType.SOLDIER, color: p1Color, faceUp: true}] }; // Enemy 2
  
  state.activePlayerIndex = 0;
  
  // 1. First Capture
  log("Move 1: Chariot (2,0) -> (2,2) Capture");
  state = applyAction(state, {
      type: ActionType.MOVE,
      playerId: 0,
      from: {row:2, col:0},
      to: {row:2, col:2}
  });

  if (state.pendingChainCapture) {
      log("Chain Active! P0 Turn continues.");
      log(`Pending Location: (${state.pendingChainCapture.row}, ${state.pendingChainCapture.col})`);
      
      // 2. Try illegal move (Move another piece or deploy)
      const illegal = applyAction(state, { type: ActionType.DEPLOY, playerId: 0, deployTo:{row:0,col:0}, deployType:PieceType.SOLDIER, deployCount:1 });
      if (illegal.error) log("Correctly blocked non-chain action.");

      // 3. Second Capture
      log("Move 2: Chariot (2,2) -> (2,4) Chain Capture");
      state = applyAction(state, {
          type: ActionType.MOVE,
          playerId: 0,
          from: {row:2, col:2},
          to: {row:2, col:4}
      });

      if (!state.error && state.activePlayerIndex === 1) {
          log("Chain Complete. Turn switched to P1 (Since no more targets or auto-switch logic? Wait, if no targets, chain ends).");
          // If Chariot moved to (2,4), are there targets? Assume no.
      } else if (state.pendingChainCapture) {
          log("Chain still active (Maybe more targets?). Passing...");
          state = applyAction(state, { type: ActionType.PASS, playerId: 0 });
          if (state.activePlayerIndex === 1) log("Passed. Turn P1.");
      }
  } else {
      log("FAIL: Chain state not triggered.");
  }

  // --- TEST 3: GENERAL STACKING ---
  log("\n--- Test 3: General Stacking Rules ---");
  // Setup: P0 General at (3,3). P0 Hand has Soldier.
  state.board[3][3] = { pieces: [{id:'g_base', type: PieceType.GENERAL, color: p0Color, faceUp: true}] };
  state.players[0].hand.pieces = [{id:'s_hand', type: PieceType.SOLDIER, color: p0Color, faceUp: true}];
  state.activePlayerIndex = 0;

  log("Deploy Soldier onto General -> Should be Valid");
  state = applyAction(state, {
      type: ActionType.DEPLOY,
      playerId: 0,
      deployTo: {row:3, col:3},
      deployType: PieceType.SOLDIER,
      deployCount: 1
  });

  if (state.error) log(`FAIL: Could not stack Soldier on General: ${state.error}`);
  else {
      const stack = state.board[3][3];
      log(`SUCCESS: Stack size ${stack?.pieces.length}. Top is ${stack?.pieces[1].type}.`);
  }

  return logs;
};
