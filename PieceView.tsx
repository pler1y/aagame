import React from 'react';
import { Color, PieceType, PieceInstance, PieceStack } from './types';

// --- Assets / mappings ---
const CHAR_MAP: Record<Color, Record<PieceType, string>> = {
  [Color.RED]: {
    [PieceType.GENERAL]: '帅',
    [PieceType.ADVISOR]: '仕',
    [PieceType.ELEPHANT]: '相',
    [PieceType.CHARIOT]: '車',
    [PieceType.HORSE]: '馬',
    [PieceType.CANNON]: '炮',
    [PieceType.SOLDIER]: '兵',
  },
  [Color.BLACK]: {
    [PieceType.GENERAL]: '将',
    [PieceType.ADVISOR]: '士',
    [PieceType.ELEPHANT]: '象',
    [PieceType.CHARIOT]: '車',
    [PieceType.HORSE]: '馬',
    [PieceType.CANNON]: '炮',
    [PieceType.SOLDIER]: '卒',
  },
  [Color.UNKNOWN]: { // Fallback
    [PieceType.GENERAL]: '将',
    [PieceType.ADVISOR]: '士',
    [PieceType.ELEPHANT]: '象',
    [PieceType.CHARIOT]: '車',
    [PieceType.HORSE]: '馬',
    [PieceType.CANNON]: '炮',
    [PieceType.SOLDIER]: '卒',
  }
};

interface PieceViewProps {
  piece?: PieceInstance; // For single piece (Hand)
  stack?: PieceStack;    // For board stack
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
}

export const PieceView: React.FC<PieceViewProps> = ({ piece, stack, isSelected, onClick, className = '' }) => {
  // Determine what to show
  let displayPiece: PieceInstance | null = null;
  let count = 0;

  if (stack) {
    count = stack.pieces.length;
    if (count > 0) {
      displayPiece = stack.pieces[count - 1]; // Top piece
    }
  } else if (piece) {
    displayPiece = piece;
    count = 1; // Hand pieces usually represent 1 or a group
  }

  if (!displayPiece) return <div className={`w-12 h-12 ${className}`} />;

  const isFaceUp = displayPiece.faceUp;
  const color = displayPiece.color;
  const type = displayPiece.type;

  // Visual Styles
  const baseStyle = "w-12 h-12 rounded-full border-4 flex items-center justify-center relative shadow-md select-none transition-transform active:scale-95 cursor-pointer";
  
  if (!isFaceUp) {
    return (
      <div onClick={onClick} className={`${baseStyle} bg-slate-700 border-slate-600 ${className}`}>
        <div className="text-slate-500 text-xs">暗</div>
      </div>
    );
  }

  const isRed = color === Color.RED;
  const textColor = isRed ? 'text-red-600' : 'text-slate-900';
  const borderColor = isRed ? 'border-red-600' : 'border-slate-900';
  const bgColor = 'bg-amber-50'; // Ivory-ish

  const selectionRing = isSelected ? 'ring-4 ring-yellow-400 scale-110 z-10' : '';

  return (
    <div onClick={onClick} className={`${baseStyle} ${bgColor} ${borderColor} ${selectionRing} ${className}`}>
      <span className={`text-2xl font-bold font-serif ${textColor}`}>
        {CHAR_MAP[color][type]}
      </span>
      
      {/* Stack Counter Badge */}
      {count > 1 && (
        <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-white">
          {count}
        </div>
      )}
    </div>
  );
};
