
import React from 'react';
import { Board, Location, PieceStack } from './types';
import { PieceView } from './PieceView';
import type { AnimationStep } from './App';

interface BoardViewProps {
  board: Board;
  onCellClick: (loc: Location) => void;
  selectedLocation: Location | null;
  lastActionFrom?: Location;
  lastActionTo?: Location;
  pendingChainLoc?: Location | null;
  activeAnim?: AnimationStep | null;
  fastChainTargets?: Location[];
  fastChainSelected?: Location[];
}

export const BoardView: React.FC<BoardViewProps> = ({ 
  board, 
  onCellClick, 
  selectedLocation,
  lastActionFrom,
  lastActionTo,
  pendingChainLoc,
  activeAnim,
  fastChainTargets = [],
  fastChainSelected = []
}) => {
  return (
    <div className="grid grid-cols-8 gap-1 bg-amber-200 p-2 rounded shadow-2xl border-4 border-amber-800 relative">
        {/* Board Grid */}
        {board.map((row, r) => (
            row.map((stack, c) => {
                const isSelected = selectedLocation?.row === r && selectedLocation?.col === c;
                
                // Highlight Last Move
                const isFrom = lastActionFrom?.row === r && lastActionFrom?.col === c;
                const isTo = lastActionTo?.row === r && lastActionTo?.col === c;
                
                // Chain Capture Highlight
                const isPendingChain = pendingChainLoc?.row === r && pendingChainLoc?.col === c;

                // Fast Chain Highlights
                const isFastChainTarget = fastChainTargets.some(t => t.row === r && t.col === c);
                const isFastChainSelected = fastChainSelected.some(t => t.row === r && t.col === c);

                let bgClass = 'bg-amber-200'; // Default cell
                if (isFrom) bgClass = 'bg-yellow-200/50';
                if (isTo) bgClass = 'bg-green-200/50';
                if (isPendingChain) bgClass = 'bg-red-300 animate-pulse';

                // If this cell is the START of an animation, hide the static piece
                // because we are rendering a ghost piece on top.
                const isAnimStart = activeAnim?.from.row === r && activeAnim?.from.col === c;
                const shouldHideStack = isAnimStart;

                return (
                    <div 
                      key={`${r}-${c}`}
                      onClick={() => onCellClick({ row: r, col: c })}
                      className={`
                        w-12 h-12 sm:w-14 sm:h-14 
                        flex items-center justify-center 
                        relative border border-amber-700/30 rounded
                        ${bgClass}
                        cursor-pointer
                      `}
                    >
                        {/* Render Stack */}
                        {stack && !shouldHideStack && (
                            <PieceView 
                                stack={stack} 
                                isSelected={isSelected}
                            />
                        )}

                        {/* Fast Chain Overlays (Rendered inside cell for perfect alignment) */}
                        {isFastChainTarget && !isFastChainSelected && (
                           <div className="absolute inset-0 bg-emerald-400/30 rounded animate-pulse border-2 border-emerald-400 pointer-events-none z-20" />
                        )}
                        {isFastChainSelected && (
                           <div className="absolute inset-0 bg-emerald-500/60 rounded border-4 border-white flex items-center justify-center pointer-events-none z-20">
                              <span className="text-white font-bold text-xl">✓</span>
                           </div>
                        )}
                    </div>
                );
            })
        ))}

        {/* Animated Ghost Piece Layer */}
        {activeAnim && (
           <div 
             className="absolute pointer-events-none z-50"
             style={{
                top: 0,
                left: 0,
                width: '100%',
                height: '100%'
             }}
           >
              <AnimatedPiece 
                 from={activeAnim.from} 
                 to={activeAnim.to} 
                 stack={activeAnim.stackSnapshot} 
              />
           </div>
        )}
    </div>
  );
};

// Helper component to handle the CSS transition on mount
const AnimatedPiece: React.FC<{from: Location, to: Location, stack: PieceStack}> = ({from, to, stack}) => {
  const [pos, setPos] = React.useState(from);

  React.useLayoutEffect(() => {
     // Trigger transition immediately after mount
     requestAnimationFrame(() => {
        setPos(to);
     });
  }, [to]);

  return (
    <div 
       className="w-[12.5%] h-[25%] flex items-center justify-center transition-all duration-300 ease-out absolute"
       style={{
          top: `calc(${pos.row * 25}% + 0.5rem)`,
          left: `calc(${pos.col * 12.5}% + 0.5rem)`,
       }}
    >
       <div className="scale-110 shadow-2xl z-50">
          <PieceView stack={stack} />
       </div>
    </div>
  );
}
