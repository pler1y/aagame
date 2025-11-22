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
}

export const BoardView: React.FC<BoardViewProps> = ({ 
  board, 
  onCellClick, 
  selectedLocation,
  lastActionFrom,
  lastActionTo,
  pendingChainLoc,
  activeAnim
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
                      `}
                    >
                        {stack && !shouldHideStack && (
                            <PieceView 
                                stack={stack} 
                                isSelected={isSelected}
                            />
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

  // Calculate percentage positions
  // Grid is 4 rows (25% each), 8 cols (12.5% each).
  // We add a slight offset to center visually if needed, but assuming grid aligns:
  // top = row * 25%, left = col * 12.5%
  // But we are inside the container which includes padding (p-2 = 0.5rem).
  // The gap is 1 unit (0.25rem).
  // Precise CSS alignment with calc is:
  // cell width = 12.5% of container content area? No.
  // Using pure percentages for translation is robust enough for a game UI.
  
  const getStyle = (loc: Location) => ({
    top: `calc(${loc.row * 25}% + 0.5rem)`,
    left: `calc(${loc.col * 12.5}% + 0.5rem)`,
  });

  // We animate by setting initial position then transforming?
  // Or just changing top/left? Changing top/left triggers layout, transform is cheaper.
  // Let's use transform.
  
  // Initial absolute position at TOP LEFT (0,0) + translate to `from`?
  // Easier: Start at `from` using top/left, then translate to delta.
  // Delta X = (to.col - from.col) * 12.5% ? Not exactly due to gaps.
  // Let's just interpolate top/left directly. Modern browsers handle it fine for simple UIs.
  
  return (
    <div 
       className="w-[12.5%] h-[25%] flex items-center justify-center transition-all duration-300 ease-out absolute"
       style={{
          top: `calc(${pos.row * 25}% + 0.5rem)`,
          left: `calc(${pos.col * 12.5}% + 0.5rem)`,
          // Using calc with % + 0.5rem padding is a good approximation for the grid
       }}
    >
       <div className="scale-110 shadow-2xl z-50">
          <PieceView stack={stack} />
       </div>
    </div>
  );
}