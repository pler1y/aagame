import React, { useState, useEffect } from 'react';
import { initRandomGame, applyAction, getLegalActions } from './gameEngine';
import { 
  GameState, 
  ActionType, 
  Location, 
  PieceType, 
  PlayerAction, 
  CaptureResolution, 
  Color 
} from './types';
import { BoardView } from './BoardView';
import { HandView } from './HandView';

// Selection State
type Selection = 
  | { type: 'BOARD'; loc: Location }
  | { type: 'HAND'; pieceType: PieceType }
  | null;

export default function App() {
  const [gameState, setGameState] = useState<GameState>(initRandomGame());
  const [selection, setSelection] = useState<Selection>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const isChainActive = !!gameState.pendingChainCapture;

  // Reset error after 3s
  useEffect(() => {
    if (errorMsg) {
      const t = setTimeout(() => setErrorMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [errorMsg]);

  const handleBoardClick = (loc: Location) => {
    // 1. Chain Capture Lock
    if (isChainActive) {
       // Only allow clicking the chainer (to select) or a target
       const chainerLoc = gameState.pendingChainCapture!;
       
       if (loc.row === chainerLoc.row && loc.col === chainerLoc.col) {
         setSelection({ type: 'BOARD', loc }); // Re-select chainer
         return;
       }
       
       // If we have the chainer selected, try to move
       if (selection?.type === 'BOARD' && 
           selection.loc.row === chainerLoc.row && 
           selection.loc.col === chainerLoc.col) {
          executeMove(selection.loc, loc);
       }
       return;
    }

    const cellStack = gameState.board[loc.row][loc.col];

    // 2. No Selection -> Select or Flip
    if (!selection) {
      if (!cellStack || cellStack.pieces.length === 0) return; // Clicked empty air

      const top = cellStack.pieces[cellStack.pieces.length - 1];
      
      // FLIP Logic
      if (!top.faceUp) {
        executeAction({
          type: ActionType.FLIP,
          playerId: gameState.activePlayerIndex,
          flipLocation: loc
        });
        return;
      }

      // Select Logic (Own pieces only)
      // Note: Before colors assigned, any face-up piece is technically valid to click visually, 
      // but logic prevents moving enemy.
      if (gameState.colorsAssigned && top.color !== activePlayer.color) {
        triggerError("Not your piece!");
        return;
      }
      
      setSelection({ type: 'BOARD', loc });
      return;
    }

    // 3. Board Piece Selected -> Move / Merge / Capture / Retrieve?
    if (selection.type === 'BOARD') {
      // Clicked self -> Deselect
      if (selection.loc.row === loc.row && selection.loc.col === loc.col) {
        setSelection(null);
        return;
      }
      
      // Retrieve Check (Simplified: Clicking own piece doesn't auto-retrieve, just re-selects usually)
      // If clicking another FRIENDLY piece -> Re-select that one (if not merging)
      // The engine handles Merge inside MOVE. 
      // We just try to Move.
      executeMove(selection.loc, loc);
    }

    // 4. Hand Piece Selected -> Deploy
    if (selection.type === 'HAND') {
      executeAction({
        type: ActionType.DEPLOY,
        playerId: gameState.activePlayerIndex,
        deployType: selection.pieceType,
        deployCount: 1, // Default 1 for UI simplicity
        deployTo: loc
      });
    }
  };

  const handleHandSelect = (type: PieceType) => {
    if (isChainActive) return;
    
    if (selection?.type === 'HAND' && selection.pieceType === type) {
      setSelection(null); // Toggle off
    } else {
      setSelection({ type: 'HAND', pieceType: type });
    }
  };

  const handlePass = () => {
    if (!isChainActive) return;
    executeAction({
      type: ActionType.PASS,
      playerId: gameState.activePlayerIndex
    });
  };

  const executeMove = (from: Location, to: Location) => {
    // Default resolution TO_HAND. 
    // In a full implementation, we'd check if it's a valid capture first,
    // then prompt the user if they want to stack or harvest.
    executeAction({
      type: ActionType.MOVE,
      playerId: gameState.activePlayerIndex,
      from,
      to,
      captureResolution: CaptureResolution.TO_HAND 
    });
  };

  const executeAction = (action: PlayerAction) => {
    const newState = applyAction(gameState, action);
    
    if (newState.error) {
      triggerError(newState.error);
    } else {
      setGameState(newState);
      setSelection(null); // Clear selection on success
    }
  };

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    // Shake effect logic could go here
  };

  const handleRestart = () => {
    if (confirm("Restart Game?")) {
       setGameState(initRandomGame());
       setSelection(null);
       setErrorMsg(null);
    }
  }

  // Helper for Last Action Highlight
  const lastAction = gameState.lastAction;
  const fromLoc = (lastAction?.type === ActionType.MOVE) ? lastAction.from : undefined;
  const toLoc = (lastAction?.type === ActionType.MOVE) ? lastAction.to : 
                (lastAction?.type === ActionType.DEPLOY) ? lastAction.deployTo : undefined;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-2 font-sans select-none">
      
      {/* Header */}
      <header className="w-full max-w-2xl flex justify-between items-center mb-4 px-4">
        <div>
          <h1 className="text-2xl font-bold text-emerald-400">Stacking Xiangqi</h1>
          <div className="text-xs text-slate-400">Turn: {gameState.turnCount} | Active: {gameState.activePlayerIndex === 0 ? 'Top' : 'Bottom'}</div>
        </div>
        <button onClick={handleRestart} className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-sm">
          Restart
        </button>
      </header>

      {/* Top Player (Index 0) Hand */}
      <div className="w-full max-w-2xl mb-2">
        <HandView 
           player={gameState.players[0]} 
           isCurrentPlayer={gameState.activePlayerIndex === 0}
           selectedPieceType={selection?.type === 'HAND' ? selection.pieceType : null}
           onSelectType={handleHandSelect}
        />
      </div>

      {/* Game Board Area */}
      <div className="relative">
        <BoardView 
           board={gameState.board} 
           onCellClick={handleBoardClick}
           selectedLocation={selection?.type === 'BOARD' ? selection.loc : null}
           lastActionFrom={fromLoc}
           lastActionTo={toLoc}
           pendingChainLoc={gameState.pendingChainCapture}
        />

        {/* Error Toast */}
        {errorMsg && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-600 text-white px-6 py-3 rounded-lg shadow-xl z-50 animate-bounce font-bold border-2 border-white">
             {errorMsg}
          </div>
        )}

        {/* Chain Capture Overlay */}
        {isChainActive && (
           <div className="absolute -bottom-16 left-0 w-full flex flex-col items-center animate-pulse">
              <div className="bg-orange-600 text-white px-4 py-1 rounded-t font-bold text-sm">
                CHAIN CAPTURE!
              </div>
              <div className="bg-slate-800 p-2 rounded-b border border-orange-500 flex gap-4 items-center shadow-lg">
                 <span className="text-orange-300 text-sm">Continue capturing or...</span>
                 <button 
                   onClick={handlePass}
                   className="bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded font-bold"
                 >
                   End Turn (Pass)
                 </button>
              </div>
           </div>
        )}
      </div>

      {/* Bottom Player (Index 1) Hand */}
      <div className="w-full max-w-2xl mt-4 mb-8">
        <HandView 
           player={gameState.players[1]} 
           isCurrentPlayer={gameState.activePlayerIndex === 1}
           selectedPieceType={selection?.type === 'HAND' ? selection.pieceType : null}
           onSelectType={handleHandSelect}
        />
      </div>

      {/* Status Footer */}
      <div className="text-center text-slate-500 text-xs">
         {gameState.colorsAssigned 
           ? `P0: ${gameState.players[0].color} | P1: ${gameState.players[1].color}`
           : "Flip a piece to assign colors."}
      </div>

      {/* Game Over Modal */}
      {gameState.isGameOver && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-slate-800 p-8 rounded-2xl border-4 border-emerald-500 text-center max-w-sm w-full mx-4 shadow-2xl">
             <h2 className="text-4xl font-bold text-emerald-400 mb-4">Game Over</h2>
             <p className="text-xl text-white mb-8">
               Winner: Player {gameState.winner !== null ? gameState.winner : '?'} 
               <span className="block text-sm text-slate-400 mt-2">
                 ({gameState.winner !== null ? gameState.players[gameState.winner].color : ''})
               </span>
             </p>
             <button 
               onClick={handleRestart}
               className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold text-lg transition-transform hover:scale-105"
             >
               Play Again
             </button>
          </div>
        </div>
      )}

    </div>
  );
}
