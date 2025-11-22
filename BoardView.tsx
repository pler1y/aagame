import React from 'react';
import { Board, Location, PieceStack, PieceType } from './types';
import { PieceView } from './PieceView';

interface BoardViewProps {
  board: Board;
  onCellClick: (loc: Location) => void;
  selectedLocation: Location | null;
  lastActionFrom?: Location;
  lastActionTo?: Location;
  pendingChainLoc?: Location | null;
}

export const BoardView: React.FC<BoardViewProps> = ({ 
  board, 
  onCellClick, 
  selectedLocation,
  lastActionFrom,
  lastActionTo,
  pendingChainLoc
}) => {
  return (
    <div className="grid grid-cols-8 gap-1 bg-amber-200 p-2 rounded shadow-2xl border-4 border-amber-800 relative">
        {/* Grid Lines (Optional visual flair, simplifed here as bg color) */}
        
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
                        {/* Cross lines for empty cells could go here */}
                        {stack && (
                            <PieceView 
                                stack={stack} 
                                isSelected={isSelected}
                            />
                        )}
                        {/* Empty cell click target is the div itself */}
                    </div>
                );
            })
        ))}
    </div>
  );
};
