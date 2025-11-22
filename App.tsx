
import React, { useState, useEffect } from 'react';
import { initRandomGame, applyAction, canStackOn, getStackBaseType, isValidCoordinate } from './gameEngine';
import { 
  GameState, 
  ActionType, 
  Location, 
  PieceType, 
  PlayerAction, 
  CaptureResolution, 
  Color,
  PieceStack
} from './types';
import { BoardView } from './BoardView';
import { HandView } from './HandView';

// --- Constants ---
const SUPPORTS_CHAIN_CAPTURE = new Set<PieceType>([
  PieceType.CHARIOT,
  PieceType.HORSE,
  PieceType.CANNON,
  PieceType.ADVISOR,
  PieceType.ELEPHANT,
]);

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

// Animation State
export interface AnimationStep {
  type: 'MOVE';
  from: Location;
  to: Location;
  finalState: GameState; // The state AFTER this specific move
  stackSnapshot: PieceStack; // Visual appearance of the piece moving
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>(initRandomGame());
  const [selection, setSelection] = useState<Selection>(null);
  
  // Modal States
  const [pendingInteraction, setPendingInteraction] = useState<{from: Location, to: Location, isFriendly: boolean} | null>(null);
  const [deployModal, setDeployModal] = useState<DeployModalState>(null);

  // Fast Chain States
  const [fastChainOrigin, setFastChainOrigin] = useState<Location | null>(null); 
  const [fastChainTargets, setFastChainTargets] = useState<Location[]>([]); 
  const [fastChainSelected, setFastChainSelected] = useState<Location[]>([]); 

  // Animation System
  const [animQueue, setAnimQueue] = useState<AnimationStep[]>([]);
  const [activeAnim, setActiveAnim] = useState<AnimationStep | null>(null);
  
  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const isChainActive = !!gameState.pendingChainCapture;
  const isAnimating = !!activeAnim || animQueue.length > 0;

  // --- Animation Processor ---
  useEffect(() => {
    if (activeAnim) return; // Currently playing an animation
    if (animQueue.length === 0) return; // Nothing to play

    // Pop next animation
    const nextAnim = animQueue[0];
    setAnimQueue(prev => prev.slice(1));
    setActiveAnim(nextAnim);

    // Play time (Visual only, logic handled by committing state at end)
    // 300ms duration + small buffer
    setTimeout(() => {
      setGameState(nextAnim.finalState);
      setActiveAnim(null);
    }, 300); 

  }, [animQueue, activeAnim]);

  // --- Helper: Simulate Fast Chain Path ---
  const simulateFastChain = (
    baseState: GameState,
    origin: Location,
    path: Location[]
  ): { state: GameState; currentLoc: Location } | null => {
    let tempState = JSON.parse(JSON.stringify(baseState));
    let currentLoc = origin;
  
    for (const target of path) {
      const action: PlayerAction = {
        type: ActionType.MOVE,
        playerId: tempState.activePlayerIndex,
        from: currentLoc,
        to: target,
        captureResolution: CaptureResolution.TO_HAND
      };
      
      const result = applyAction(tempState, action);
      if (result.error) return null; 
      
      tempState = result;
      currentLoc = target;
    }
    return { state: tempState, currentLoc };
  };

  // --- Helper: Get Candidate Steps based on Piece Type ---
  const getCandidateStepsForPiece = (state: GameState, from: Location, type: PieceType): Location[] => {
    const candidates: Location[] = [];
    const { board } = state;

    if (type === PieceType.CHARIOT) {
      const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      directions.forEach(([dr, dc]) => {
        for (let i = 1; i < 8; i++) {
          const r = from.row + dr * i;
          const c = from.col + dc * i;
          if (!isValidCoordinate({row: r, col: c})) break;
          candidates.push({row: r, col: c});
          if (board[r][c]) break; // Chariot stops at first piece
        }
      });
    } else if (type === PieceType.CANNON) {
      const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      directions.forEach(([dr, dc]) => {
        for (let i = 1; i < 8; i++) {
          const r = from.row + dr * i;
          const c = from.col + dc * i;
          if (!isValidCoordinate({row: r, col: c})) break;
          // For Cannon, we consider all non-empty cells in line as potential interaction targets.
          // applyAction will rigorously enforce the "exactly one screen" rule.
          if (board[r][c]) {
             candidates.push({row: r, col: c});
          }
        }
      });
    } else if (type === PieceType.HORSE) {
      // Diagonal 1 step
      const offsets = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      offsets.forEach(([dr, dc]) => {
        const r = from.row + dr;
        const c = from.col + dc;
        if (isValidCoordinate({row: r, col: c})) candidates.push({row: r, col: c});
      });
    } else {
      // Advisor, Elephant (Orthogonal 1 step)
      const offsets = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      offsets.forEach(([dr, dc]) => {
        const r = from.row + dr;
        const c = from.col + dc;
        if (isValidCoordinate({row: r, col: c})) candidates.push({row: r, col: c});
      });
    }
    return candidates;
  };

  // --- Unified Chain Target Calculator ---
  const recomputeFastChainTargets = (origin: Location, path: Location[]) => {
    // 1. Get the base piece type from the origin
    const originStack = gameState.board[origin.row][origin.col];
    if (!originStack || originStack.pieces.length === 0) {
        setFastChainTargets([]);
        return;
    }
    const baseType = getStackBaseType(originStack.pieces);

    // 2. Simulate current state
    const sim = simulateFastChain(gameState, origin, path);
    if (!sim) {
      setFastChainTargets([]);
      return;
    }

    const { state: tempState, currentLoc } = sim;
    
    // 3. Get geometrical candidates
    const candidates = getCandidateStepsForPiece(tempState, currentLoc, baseType);
    const validTargets: Location[] = [];

    // 4. Validate with applyAction
    for (const target of candidates) {
        const testAction: PlayerAction = {
           type: ActionType.MOVE,
           playerId: tempState.activePlayerIndex,
           from: currentLoc,
           to: target,
           captureResolution: CaptureResolution.TO_HAND
        };

        const result = applyAction(tempState, testAction);
        if (!result.error) {
            validTargets.push(target);
        }
    }

    setFastChainTargets(validTargets);
  };

  // --- Effect: Auto-Recalculate Targets ---
  useEffect(() => {
    // Mode 1: Active Fast Chain Mode (or just updated path)
    if (fastChainOrigin) {
      recomputeFastChainTargets(fastChainOrigin, fastChainSelected);
      return;
    }

    // Mode 2: Passive Scan (Show button if targets exist for selected piece)
    if (selection?.type === 'BOARD' && !isAnimating) {
      const { row, col } = selection.loc;
      const stack = gameState.board[row][col];
      if (stack && stack.pieces.length > 0) {
        const baseType = getStackBaseType(stack.pieces);
        if (SUPPORTS_CHAIN_CAPTURE.has(baseType)) {
          recomputeFastChainTargets(selection.loc, []);
        } else {
          setFastChainTargets([]);
        }
      } else {
        setFastChainTargets([]);
      }
    } else {
      setFastChainTargets([]);
    }
  }, [selection, gameState, fastChainOrigin, fastChainSelected, isAnimating]);


  const handleBoardClick = (loc: Location) => {
    if (isAnimating) return; 
    if (pendingInteraction || deployModal) return;

    // --- Fast Chain Selection Logic ---
    if (fastChainOrigin) {
      // 1. Append next target
      const isNextTarget = fastChainTargets.some(t => t.row === loc.row && t.col === loc.col);
      if (isNextTarget) {
        setFastChainSelected([...fastChainSelected, loc]);
        return;
      }

      // 2. Backtrack last step
      const lastSelected = fastChainSelected.length > 0 ? fastChainSelected[fastChainSelected.length - 1] : null;
      const isLastSelected = lastSelected && lastSelected.row === loc.row && lastSelected.col === loc.col;
      if (isLastSelected) {
        setFastChainSelected(fastChainSelected.slice(0, -1));
        return;
      }

      // 3. Safe Exit (Deadlock Fix)
      // If clicking elsewhere or origin, and not a valid target/backtrack -> Exit mode
      setFastChainOrigin(null);
      setFastChainSelected([]);
      setFastChainTargets([]);
      // Optional: If they clicked the origin, just deselect. If they clicked another piece, maybe select it?
      // For simplicity, we just exit Fast Chain mode.
      return;
    }

    // 1. Chain Capture Lock
    if (isChainActive) {
       const chainerLoc = gameState.pendingChainCapture!;
       if (loc.row === chainerLoc.row && loc.col === chainerLoc.col) {
         setSelection({ type: 'BOARD', loc }); 
         return;
       }
       if (selection?.type === 'BOARD' && 
           selection.loc.row === chainerLoc.row && 
           selection.loc.col === chainerLoc.col) {
          attemptMove(selection.loc, loc);
       }
       return;
    }

    const cellStack = gameState.board[loc.row][loc.col];

    // 2. No Selection -> Select or Flip
    if (!selection) {
      if (!cellStack || cellStack.pieces.length === 0) return; 
      const top = cellStack.pieces[cellStack.pieces.length - 1];
      if (!top.faceUp) {
        queueAction({
          type: ActionType.FLIP,
          playerId: gameState.activePlayerIndex,
          flipLocation: loc
        });
        return;
      }
      if (gameState.colorsAssigned && top.color !== activePlayer.color) return;
      setSelection({ type: 'BOARD', loc });
      return;
    }

    // 3. Board Piece Selected
    if (selection.type === 'BOARD') {
      if (selection.loc.row === loc.row && selection.loc.col === loc.col) {
        setSelection(null);
        return;
      }
      attemptMove(selection.loc, loc);
    }

    // 4. Hand Piece Selected
    if (selection.type === 'HAND') {
      const count = activePlayer.hand.pieces.filter(p => p.type === selection.pieceType).length;
      if (count > 1) {
        setDeployModal({ type: selection.pieceType, to: loc, max: count, current: 1 });
      } else {
        queueAction({
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
    // Clear fast chain state if user tries to interact with hand
    if (fastChainOrigin) {
        setFastChainOrigin(null);
        setFastChainSelected([]);
        setFastChainTargets([]);
    }

    if (isAnimating || isChainActive || pendingInteraction || deployModal) return;
    
    if (selection?.type === 'HAND' && selection.pieceType === type) {
      setSelection(null); 
    } else {
      setSelection({ type: 'HAND', pieceType: type });
    }
  };

  const handlePass = () => {
    if (isAnimating || !isChainActive || pendingInteraction || deployModal) return;
    queueAction({
      type: ActionType.PASS,
      playerId: gameState.activePlayerIndex
    });
  };

  const attemptMove = (from: Location, to: Location) => {
    // Dry Run
    const testAction: PlayerAction = {
      type: ActionType.MOVE,
      playerId: gameState.activePlayerIndex,
      from,
      to,
      captureResolution: CaptureResolution.TO_HAND
    };
    const testResult = applyAction(gameState, testAction);
    if (testResult.error) return; // Silent fail

    // Check Interaction
    const targetStack = gameState.board[to.row][to.col];
    if (targetStack && targetStack.pieces.length > 0) {
       const topTarget = targetStack.pieces[targetStack.pieces.length - 1];
       if (topTarget.faceUp) {
         const isFriendly = gameState.colorsAssigned && topTarget.color === activePlayer.color;
         setPendingInteraction({ from, to, isFriendly });
         return;
       }
    }

    // Move to empty space
    queueAction({
      type: ActionType.MOVE,
      playerId: gameState.activePlayerIndex,
      from,
      to,
      captureResolution: CaptureResolution.TO_HAND
    });
  };

  const confirmInteraction = (resolution: CaptureResolution) => {
    if (!pendingInteraction) return;
    queueAction({
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

  const confirmDeploy = () => {
    if (!deployModal) return;
    queueAction({
      type: ActionType.DEPLOY,
      playerId: gameState.activePlayerIndex,
      deployType: deployModal.type,
      deployCount: deployModal.current,
      deployTo: deployModal.to
    });
    setDeployModal(null);
  };

  const startFastChainMode = () => {
    if (selection?.type === 'BOARD') {
      setFastChainOrigin(selection.loc);
    }
  };

  const cancelFastChain = () => {
    setFastChainOrigin(null);
    setFastChainSelected([]);
    setFastChainTargets([]);
  };

  const executeFastChain = () => {
    if (!fastChainOrigin || fastChainSelected.length === 0) return;
    
    let tempState = gameState;
    let currentFrom = fastChainOrigin;
    const steps: AnimationStep[] = [];

    // SEQUENTIAL EXECUTION
    for (const target of fastChainSelected) {
       const action: PlayerAction = {
          type: ActionType.MOVE,
          playerId: tempState.activePlayerIndex,
          from: currentFrom,
          to: target,
          captureResolution: CaptureResolution.TO_HAND 
       };
       
       const result = applyAction(tempState, action);
       if (result.error) {
         console.warn("Auto chain execution interrupted:", result.error);
         break;
       }
       
       const stack = tempState.board[currentFrom.row][currentFrom.col];

       steps.push({
         type: 'MOVE',
         from: currentFrom,
         to: target,
         finalState: result,
         stackSnapshot: stack ? JSON.parse(JSON.stringify(stack)) : {pieces:[]} 
       });

       tempState = result;
       currentFrom = target;
    }

    setAnimQueue(prev => [...prev, ...steps]);
    
    // Cleanup UI
    setSelection(null);
    setFastChainOrigin(null);
    setFastChainTargets([]);
    setFastChainSelected([]);
  };

  // Unified Action Handler
  const queueAction = (action: PlayerAction) => {
    // Cleanup fast chain if any other action is queued
    if (fastChainOrigin) {
        setFastChainOrigin(null);
        setFastChainSelected([]);
        setFastChainTargets([]);
    }

    const result = applyAction(gameState, action);
    if (result.error) {
      console.warn(result.error);
      return;
    }

    if (action.type === ActionType.MOVE && action.from && action.to) {
      // Animate Moves
      const stack = gameState.board[action.from.row][action.from.col];
      setAnimQueue(prev => [...prev, {
        type: 'MOVE',
        from: action.from!,
        to: action.to!,
        finalState: result,
        stackSnapshot: stack ? JSON.parse(JSON.stringify(stack)) : {pieces:[]}
      }]);
    } else {
      // Instant Update
      setGameState(result);
      setSelection(null); 
    }
  };

  const handleRestart = () => {
    setGameState(initRandomGame());
    setSelection(null);
    setPendingInteraction(null);
    setDeployModal(null);
    setFastChainOrigin(null);
    setFastChainTargets([]);
    setFastChainSelected([]);
    setAnimQueue([]);
    setActiveAnim(null);
  };

  const checkStackPossible = () => {
    if (!pendingInteraction) return false;
    const { from, to, isFriendly } = pendingInteraction;
    const src = gameState.board[from.row][from.col]?.pieces || [];
    const dest = gameState.board[to.row][to.col]?.pieces || [];
    return canStackOn(dest, src, isFriendly).valid;
  };

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
        <button onClick={handleRestart} disabled={isAnimating} className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-sm disabled:opacity-50">
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
           lastActionFrom={gameState.lastAction?.type === ActionType.MOVE ? gameState.lastAction.from : undefined}
           lastActionTo={gameState.lastAction?.type === ActionType.MOVE ? gameState.lastAction.to : undefined}
           pendingChainLoc={gameState.pendingChainCapture}
           activeAnim={activeAnim}
           fastChainTargets={fastChainTargets}
           fastChainSelected={fastChainSelected}
        />

        {/* Interaction Choice Modal */}
        {pendingInteraction && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 rounded backdrop-blur-sm">
             <div className="bg-slate-800 p-4 rounded-xl border-2 border-orange-500 shadow-2xl w-64 flex flex-col gap-3 animate-in fade-in zoom-in duration-200">
                <h3 className="text-center font-bold text-orange-400 text-lg">
                  {pendingInteraction.isFriendly ? "己方互动" : "捕获敌方"}
                </h3>
                <p className="text-xs text-center text-slate-300 mb-2">请选择处理方式:</p>
                
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
                   <button onClick={() => setDeployModal(null)} className="flex-1 bg-slate-600 hover:bg-slate-500 text-white py-2 rounded font-bold text-xs">取消</button>
                   <button onClick={confirmDeploy} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded font-bold text-xs">确认部署</button>
                </div>
             </div>
           </div>
        )}

        {/* Fast Chain Start Button */}
        {!fastChainOrigin && fastChainTargets.length > 0 && !pendingInteraction && !deployModal && !isAnimating && (
           <div className="absolute top-2 right-2 z-30">
              <button 
                onClick={startFastChainMode}
                className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg shadow-lg font-bold text-sm animate-bounce border-2 border-purple-300"
              >
                ⚡ 快速连吃 ({fastChainTargets.length})
              </button>
           </div>
        )}

      </div>

      {/* Fast Chain Controls - OUTSIDE BOARD */}
      {fastChainOrigin && (
           <div className="w-full max-w-md mt-4 mb-2 z-30 bg-slate-800 p-3 rounded-xl border-2 border-purple-500 shadow-xl flex gap-2 items-center justify-between">
              <div className="flex flex-col flex-1">
                 <span className="text-purple-300 font-bold text-sm">快速连吃模式</span>
                 <span className="text-slate-400 text-xs">已选: {fastChainSelected.length}</span>
              </div>
              <div className="flex gap-2">
                <button 
                   onClick={cancelFastChain}
                   className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded text-xs"
                >
                   取消
                </button>
                <button 
                   onClick={executeFastChain}
                   disabled={fastChainSelected.length === 0}
                   className={`px-3 py-1 rounded text-xs font-bold ${fastChainSelected.length > 0 ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-slate-700 text-slate-500'}`}
                >
                   确认执行
                </button>
              </div>
           </div>
      )}

      {/* Chain Capture Overlay - MOVED OUTSIDE BOARD */}
      {isChainActive && !pendingInteraction && !deployModal && !isAnimating && (
           <div className="w-full max-w-md mt-2 mb-2 flex flex-col items-center animate-pulse">
              <div className="bg-orange-600 text-white px-4 py-1 rounded-t font-bold text-sm w-full text-center">
                触发连吃!
              </div>
              <div className="bg-slate-800 p-2 rounded-b border border-orange-500 flex gap-4 items-center justify-center shadow-lg w-full">
                 <span className="text-orange-300 text-sm">请继续吃子/回收，或...</span>
                 <button onClick={handlePass} className="bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded font-bold text-xs">跳过</button>
              </div>
           </div>
      )}

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
