
import React, { useState, useEffect } from 'react';
import { initRandomGame, applyAction, canStackOn } from './gameEngine';
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

// Deploy Modal State
type DeployModalState = {
  type: PieceType;
  to: Location;
  max: number;
  current: number;
} | null;

export default function App() {
  const [gameState, setGameState] = useState<GameState>(initRandomGame());
  const [selection, setSelection] = useState<Selection>(null);
  
  // State for Interaction Modal (Capture or Merge)
  const [pendingInteraction, setPendingInteraction] = useState<{from: Location, to: Location, isFriendly: boolean} | null>(null);

  // State for Deploy Modal
  const [deployModal, setDeployModal] = useState<DeployModalState>(null);

  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const isChainActive = !!gameState.pendingChainCapture;

  const handleBoardClick = (loc: Location) => {
    // If Modal is open, block board interaction
    if (pendingInteraction || deployModal) return;

    // 1. Chain Capture Lock (连吃锁定)
    if (isChainActive) {
       const chainerLoc = gameState.pendingChainCapture!;
       
       // Allow re-selecting the chaining piece
       if (loc.row === chainerLoc.row && loc.col === chainerLoc.col) {
         setSelection({ type: 'BOARD', loc }); 
         return;
       }
       
       // If we have the chainer selected, try to move/capture
       if (selection?.type === 'BOARD' && 
           selection.loc.row === chainerLoc.row && 
           selection.loc.col === chainerLoc.col) {
          attemptMove(selection.loc, loc);
       }
       return;
    }

    const cellStack = gameState.board[loc.row][loc.col];

    // 2. No Selection -> Select or Flip (未选中时：翻牌或选中)
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
      if (gameState.colorsAssigned && top.color !== activePlayer.color) {
        return;
      }
      
      setSelection({ type: 'BOARD', loc });
      return;
    }

    // 3. Board Piece Selected -> Move / Merge / Capture (已选中棋盘棋子 -> 移动/合并/吃子)
    if (selection.type === 'BOARD') {
      // Clicked self -> Deselect
      if (selection.loc.row === loc.row && selection.loc.col === loc.col) {
        setSelection(null);
        return;
      }
      
      attemptMove(selection.loc, loc);
    }

    // 4. Hand Piece Selected -> Deploy (已选中手牌 -> 部署)
    if (selection.type === 'HAND') {
      // Check count of this piece type in hand
      const count = activePlayer.hand.pieces.filter(p => p.type === selection.pieceType).length;
      
      if (count > 1) {
        // Open Batch Deploy Modal
        setDeployModal({
          type: selection.pieceType,
          to: loc,
          max: count,
          current: 1
        });
      } else {
        // Direct Deploy
        executeAction({
          type: ActionType.DEPLOY,
          playerId: gameState.activePlayerIndex,
          deployType: selection.pieceType,
          deployCount: 1,
          deployTo: loc
        });
      }
    }
  };

  const handleHandSelect = (type: PieceType) => {
    if (isChainActive || pendingInteraction || deployModal) return;
    
    if (selection?.type === 'HAND' && selection.pieceType === type) {
      setSelection(null); // Toggle off
    } else {
      setSelection({ type: 'HAND', pieceType: type });
    }
  };

  const handlePass = () => {
    if (!isChainActive || pendingInteraction || deployModal) return;
    executeAction({
      type: ActionType.PASS,
      playerId: gameState.activePlayerIndex
    });
  };

  // Replaces direct executeAction for Moves to handle Capture Choice
  const attemptMove = (from: Location, to: Location) => {
    const targetStack = gameState.board[to.row][to.col];
    
    // Interaction check
    if (targetStack && targetStack.pieces.length > 0) {
       const topTarget = targetStack.pieces[targetStack.pieces.length - 1];
       
       if (topTarget.faceUp) {
         const isFriendly = gameState.colorsAssigned && topTarget.color === activePlayer.color;
         // Open Modal for ANY non-empty target (Friend or Foe)
         setPendingInteraction({ from, to, isFriendly });
         return;
       }
    }

    // Move to empty space
    executeAction({
      type: ActionType.MOVE,
      playerId: gameState.activePlayerIndex,
      from,
      to,
      captureResolution: CaptureResolution.TO_HAND // Irrelevant for empty space
    });
  };

  const confirmInteraction = (resolution: CaptureResolution) => {
    if (!pendingInteraction) return;
    
    executeAction({
      type: ActionType.MOVE,
      playerId: gameState.activePlayerIndex,
      from: pendingInteraction.from,
      to: pendingInteraction.to,
      captureResolution: resolution
    });
    
    setPendingInteraction(null);
  };

  const cancelInteraction = () => {
    setPendingInteraction(null);
  };

  // Deploy Modal Functions
  const confirmDeploy = () => {
    if (!deployModal) return;
    executeAction({
      type: ActionType.DEPLOY,
      playerId: gameState.activePlayerIndex,
      deployType: deployModal.type,
      deployCount: deployModal.current,
      deployTo: deployModal.to
    });
    setDeployModal(null);
  };

  const executeAction = (action: PlayerAction) => {
    const newState = applyAction(gameState, action);
    
    if (newState.error) {
      // Silent failure, just log to console for debugging
      console.warn(newState.error);
    } else {
      setGameState(newState);
      // Clear selection on success, EXCEPT if chain capture started
      setSelection(null); 
    }
  };

  const handleRestart = () => {
    if (confirm("确定要重新开始游戏吗？")) {
       setGameState(initRandomGame());
       setSelection(null);
       setPendingInteraction(null);
       setDeployModal(null);
    }
  }

  // Helper to check stack validity for the UI button
  const checkStackPossible = () => {
    if (!pendingInteraction) return false;
    const { from, to, isFriendly } = pendingInteraction;
    const src = gameState.board[from.row][from.col]?.pieces || [];
    const dest = gameState.board[to.row][to.col]?.pieces || [];
    
    // If Friendly: checkColor = true. If Enemy: checkColor = false.
    return canStackOn(dest, src, isFriendly).valid;
  };

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
          <h1 className="text-2xl font-bold text-emerald-400">叠叠象棋 (Stacking Xiangqi)</h1>
          <div className="text-xs text-slate-400">
             回合: {gameState.turnCount} | 当前: {gameState.activePlayerIndex === 0 ? '上方玩家' : '下方玩家'}
          </div>
        </div>
        <button onClick={handleRestart} className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-sm">
          重新开始
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

        {/* Interaction Choice Modal */}
        {pendingInteraction && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 rounded backdrop-blur-sm">
             <div className="bg-slate-800 p-4 rounded-xl border-2 border-orange-500 shadow-2xl w-64 flex flex-col gap-3 animate-in fade-in zoom-in duration-200">
                <h3 className="text-center font-bold text-orange-400 text-lg">
                  {pendingInteraction.isFriendly ? "己方互动" : "捕获敌方"}
                </h3>
                <p className="text-xs text-center text-slate-300 mb-2">请选择处理方式:</p>
                
                {/* Option A: TO_HAND (Capture or Retrieve) */}
                <button 
                  onClick={() => confirmInteraction(CaptureResolution.TO_HAND)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded font-bold text-sm flex flex-col items-center"
                >
                  <span>{pendingInteraction.isFriendly ? "回收连吃" : "收为己用"}</span>
                  <span className="text-[10px] font-normal opacity-80">
                    {pendingInteraction.isFriendly 
                      ? "(收回此子，可继续连吃)" 
                      : "(变色并入手牌)"}
                  </span>
                </button>

                {/* Option B: STACK (Merge or Crush) */}
                {checkStackPossible() && (
                  <button 
                    onClick={() => confirmInteraction(CaptureResolution.STACK_IF_POSSIBLE)}
                    className="bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-bold text-sm flex flex-col items-center"
                  >
                    <span>{pendingInteraction.isFriendly ? "合并叠加" : "镇压叠加"}</span>
                    <span className="text-[10px] font-normal opacity-80">
                      {pendingInteraction.isFriendly 
                        ? "(增加层数)" 
                        : "(直接叠在下方)"}
                    </span>
                  </button>
                )}

                <button 
                  onClick={cancelInteraction}
                  className="mt-2 text-slate-400 hover:text-white text-xs underline"
                >
                  取消操作
                </button>
             </div>
          </div>
        )}

        {/* Batch Deploy Modal */}
        {deployModal && (
           <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 rounded backdrop-blur-sm">
             <div className="bg-slate-800 p-4 rounded-xl border-2 border-emerald-500 shadow-2xl w-64 flex flex-col gap-4">
                <h3 className="text-center font-bold text-emerald-400 text-lg">
                  批量部署 ({deployModal.type})
                </h3>
                
                <div className="flex flex-col items-center gap-2">
                   <div className="text-4xl font-bold text-white">{deployModal.current}</div>
                   <div className="text-xs text-slate-400">数量选择 (Max: {deployModal.max})</div>
                   <input 
                      type="range" 
                      min="1" 
                      max={deployModal.max} 
                      value={deployModal.current}
                      onChange={(e) => setDeployModal({...deployModal, current: parseInt(e.target.value)})}
                      className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                   />
                </div>

                <div className="flex gap-2">
                   <button 
                     onClick={() => setDeployModal(null)}
                     className="flex-1 bg-slate-600 hover:bg-slate-500 text-white py-2 rounded font-bold text-xs"
                   >
                     取消
                   </button>
                   <button 
                     onClick={confirmDeploy}
                     className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded font-bold text-xs"
                   >
                     确认部署
                   </button>
                </div>
             </div>
           </div>
        )}

        {/* Chain Capture Overlay */}
        {isChainActive && !pendingInteraction && !deployModal && (
           <div className="absolute -bottom-16 left-0 w-full flex flex-col items-center animate-pulse">
              <div className="bg-orange-600 text-white px-4 py-1 rounded-t font-bold text-sm">
                触发连吃!
              </div>
              <div className="bg-slate-800 p-2 rounded-b border border-orange-500 flex gap-4 items-center shadow-lg">
                 <span className="text-orange-300 text-sm">请继续吃子/回收，或...</span>
                 <button 
                   onClick={handlePass}
                   className="bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded font-bold"
                 >
                   跳过 (结束回合)
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
           ? `红方: ${gameState.players[0].color === Color.RED ? 'Player 0' : 'Player 1'} | 黑方: ${gameState.players[0].color === Color.BLACK ? 'Player 0' : 'Player 1'}`
           : "请翻开任意棋子以决定红黑阵营"}
      </div>

      {/* Game Over Modal */}
      {gameState.isGameOver && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-slate-800 p-8 rounded-2xl border-4 border-emerald-500 text-center max-w-sm w-full mx-4 shadow-2xl">
             <h2 className="text-4xl font-bold text-emerald-400 mb-4">游戏结束</h2>
             <p className="text-xl text-white mb-8">
               获胜者: 玩家 {gameState.winner !== null ? gameState.winner : '?'} 
               <span className="block text-sm text-slate-400 mt-2">
                 ({gameState.winner !== null ? (gameState.players[gameState.winner].color === Color.RED ? '红方' : '黑方') : ''})
               </span>
             </p>
             <button 
               onClick={handleRestart}
               className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold text-lg transition-transform hover:scale-105"
             >
               再来一局
             </button>
          </div>
        </div>
      )}

    </div>
  );
}
