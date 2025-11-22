import React from 'react';
import { PlayerState, Color, PieceType, PieceInstance } from './types';
import { PieceView } from './PieceView';

interface HandViewProps {
  player: PlayerState;
  isCurrentPlayer: boolean;
  selectedPieceType: PieceType | null;
  onSelectType: (type: PieceType) => void;
}

export const HandView: React.FC<HandViewProps> = ({ player, isCurrentPlayer, selectedPieceType, onSelectType }) => {
  // Group pieces by type
  const grouped: Record<string, { type: PieceType, count: number, piece: PieceInstance }> = {};

  player.hand.pieces.forEach(p => {
    if (!grouped[p.type]) {
      grouped[p.type] = { type: p.type, count: 0, piece: p };
    }
    grouped[p.type].count++;
  });

  const sortedGroups = Object.values(grouped).sort((a, b) => a.type.localeCompare(b.type));

  const borderColor = player.color === Color.RED ? 'border-red-500' : (player.color === Color.BLACK ? 'border-slate-800' : 'border-slate-400');
  const bgClass = isCurrentPlayer ? 'bg-opacity-20 bg-yellow-200' : 'bg-transparent';

  return (
    <div className={`flex flex-wrap gap-2 p-2 rounded-lg border-2 transition-colors ${borderColor} ${bgClass} min-h-[80px] items-center`}>
       <div className="mr-2 text-xs font-bold text-slate-500 uppercase w-full sm:w-auto text-center">
          {player.color === Color.UNKNOWN ? 'Waiting...' : player.color} Hand
       </div>
       
       {sortedGroups.length === 0 && <div className="text-xs text-slate-400 italic pl-2">Empty</div>}

       {sortedGroups.map(group => (
         <div key={group.type} className="relative">
            <PieceView 
              piece={group.piece} 
              isSelected={isCurrentPlayer && selectedPieceType === group.type}
              onClick={() => isCurrentPlayer && onSelectType(group.type)}
            />
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-[10px] px-1.5 rounded-full border border-slate-600 z-10">
              x{group.count}
            </div>
         </div>
       ))}
    </div>
  );
};
