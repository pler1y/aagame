
import { initRandomGame, applyAction, getLegalActions } from './gameEngine';
import { ActionType, GameState, PieceType, CaptureResolution } from './types';

export const runTests = () => {
  const logs: string[] = [];
  const log = (msg: string) => logs.push(msg);

  log("=== Starting NEW Engine Tests (Stacking + Weight + Hand) ===");

  // 1. Init
  let state = initRandomGame();
  log("Game Initialized. All hidden.");

  // 2. Flip Start
  log("--- Action: Player 0 Flips (0,0) ---");
  state = applyAction(state, {
      type: ActionType.FLIP,
      playerId: 0,
      flipLocation: { row: 0, col: 0 }
  });
  
  const p0Color = state.players[0].color;
  log(`Player 0 is now ${p0Color}.`);

  // 3. Hack State to Set Up Scenarios
  // We forcefully set up a board to test specific logic without playing 50 moves.
  log("--- Setting up Scenario: Weight Capture & Stacking ---");
  
  // Clear board spots
  state.board[1][0] = null;
  state.board[1][1] = null;
  
  // Give P0 a stack of 2 Soldiers at (1,0)
  const soldier1 = { id: 's1', type: PieceType.SOLDIER, color: p0Color, faceUp: true };
  const soldier2 = { id: 's2', type: PieceType.SOLDIER, color: p0Color, faceUp: true };
  state.board[1][0] = { pieces: [soldier1, soldier2] };
  
  // Give P1 (Enemy) a stack of 1 Chariot at (1,1)
  const enemyColor = state.players[1].color;
  const chariot = { id: 'c1', type: PieceType.CHARIOT, color: enemyColor, faceUp: true };
  state.board[1][1] = { pieces: [chariot] };

  log(`(1,0): P0 Stack Weight 2 (Soldiers).`);
  log(`(1,1): P1 Stack Weight 1 (Chariot).`);
  
  // 4. Test Weight Capture (2 vs 1) -> TO_HAND
  log("--- Action: P0 Moves (1,0) to (1,1) [Capture TO_HAND] ---");
  // Expect: Chariot removed, added to P0 hand (converted). P0 stack moves to (1,1).
  state = applyAction(state, {
      type: ActionType.MOVE,
      playerId: 0,
      from: { row: 1, col: 0 },
      to: { row: 1, col: 1 },
      captureResolution: CaptureResolution.TO_HAND
  });
  
  if (state.error) {
      log(`ERROR: ${state.error}`);
  } else {
      log("Success.");
      const handCount = state.players[0].hand.pieces.length;
      const handPiece = state.players[0].hand.pieces[0];
      log(`P0 Hand Count: ${handCount}. Piece is ${handPiece?.color} ${handPiece?.type} (Converted).`);
      const boardPos = state.board[1][1];
      log(`(1,1) is now P0 Stack size: ${boardPos?.pieces.length}.`);
  }

  // 5. Test Deploy from Hand
  log("--- Action: P0 Deploys Chariot to (2,2) ---");
  state = applyAction(state, {
      type: ActionType.DEPLOY,
      playerId: 0, // Assuming turn implies P0 again (in test hack) or we override checks?
      // Note: applyAction toggles turn. So it's P1's turn now.
      // We need to hack turn back to P0 for testing.
  }); 
  state.activePlayerIndex = 0; // Force P0 turn

  state = applyAction(state, {
      type: ActionType.DEPLOY,
      playerId: 0,
      deployTo: { row: 2, col: 2 },
      deployType: PieceType.CHARIOT,
      deployCount: 1
  });
  
  if(state.board[2][2]) {
      log(`Deploy Success. (2,2) has ${state.board[2][2]?.pieces[0].type}.`);
  } else {
      log(`Deploy Failed: ${state.error}`);
  }

  // 6. Test Stacking Limit (Soldier Limit is 12, General is 2)
  log("--- Test: General Stacking Limit ---");
  // Place General at 3,0
  state.board[3][0] = { pieces: [{id:'g1', type: PieceType.GENERAL, color: p0Color, faceUp:true}] };
  // Hand has General
  state.players[0].hand.pieces = [{id:'g2', type: PieceType.GENERAL, color: p0Color, faceUp:true}];
  state.activePlayerIndex = 0;

  log("Try Deploy General on General (Limit 2) -> Should Work");
  state = applyAction(state, {
      type: ActionType.DEPLOY,
      playerId: 0,
      deployTo: { row: 3, col: 0 },
      deployType: PieceType.GENERAL,
      deployCount: 1
  });
  log(state.error ? `Error: ${state.error}` : "Success (Size 2).");

  // Add another General to hand
  state.players[0].hand.pieces.push({id:'g3', type: PieceType.GENERAL, color: p0Color, faceUp:true});
  state.activePlayerIndex = 0;
  
  log("Try Deploy 3rd General (Limit 2) -> Should Fail");
  state = applyAction(state, {
      type: ActionType.DEPLOY,
      playerId: 0,
      deployTo: { row: 3, col: 0 },
      deployType: PieceType.GENERAL,
      deployCount: 1
  });
  log(state.error ? `Expected Error: ${state.error}` : "UNEXPECTED SUCCESS");

  // 7. Horse Move Test
  log("--- Test: Horse Diagonal Move ---");
  // Place Horse at 0,0
  state.board[0][0] = { pieces: [{id:'h1', type: PieceType.HORSE, color: p0Color, faceUp:true}] };
  state.activePlayerIndex = 0;
  
  // Try Orthogonal (Invalid)
  log("Try Horse (0,0) -> (0,1) [Orthogonal]");
  let res = applyAction(state, {
      type: ActionType.MOVE,
      playerId: 0,
      from: {row:0, col:0},
      to: {row:0, col:1}
  });
  log(res.error ? `Expected Error: ${res.error}` : "FAIL: Orthogonal Allowed");
  
  // Try Diagonal (Valid)
  state.activePlayerIndex = 0; // Reset turn
  log("Try Horse (0,0) -> (1,1) [Diagonal]");
  res = applyAction(state, {
      type: ActionType.MOVE,
      playerId: 0,
      from: {row:0, col:0},
      to: {row:1, col:1}
  });
  log(res.error ? `Error: ${res.error}` : "Success: Diagonal Moved.");

  return logs;
};
