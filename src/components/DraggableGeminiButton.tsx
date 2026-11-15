import React, { useState, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';

interface DraggableGeminiButtonProps {
  onClick: () => void;
}

const STORAGE_KEY = 'gemini_fab_position_v1';

export const DraggableGeminiButton: React.FC<DraggableGeminiButtonProps> = ({ onClick }) => {
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed;
        }
      }
    } catch (e) {}
    // Default position: bottom right floating
    const defaultX = typeof window !== 'undefined' ? window.innerWidth - 64 : 300;
    const defaultY = typeof window !== 'undefined' ? window.innerHeight - 100 : 600;
    return { x: defaultX, y: defaultY };
  });

  const isDraggingRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialFabPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragDistanceRef = useRef(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Keep within viewport bounds on resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const maxX = window.innerWidth - 56;
        const maxY = window.innerHeight - 56;
        const clampedX = Math.max(12, Math.min(prev.x, maxX));
        const clampedY = Math.max(12, Math.min(prev.y, maxY));
        return { x: clampedX, y: clampedY };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const savePosition = (newX: number, newY: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: newX, y: newY }));
    } catch (e) {}
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    dragDistanceRef.current = 0;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    initialFabPosRef.current = { ...position };

    if (buttonRef.current) {
      buttonRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;

    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = e.clientY - startPosRef.current.y;
    dragDistanceRef.current = Math.hypot(deltaX, deltaY);

    const maxX = window.innerWidth - 56;
    const maxY = window.innerHeight - 70;

    const newX = Math.max(12, Math.min(initialFabPosRef.current.x + deltaX, maxX));
    const newY = Math.max(12, Math.min(initialFabPosRef.current.y + deltaY, maxY));

    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    if (buttonRef.current) {
      try {
        buttonRef.current.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }

    savePosition(position.x, position.y);

    // If dragged less than 6px, consider it a tap/click
    if (dragDistanceRef.current < 6) {
      onClick();
    }
  };

  return (
    <button
      ref={buttonRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: 'none',
      }}
      className="z-50 p-3.5 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white shadow-2xl shadow-indigo-600/40 hover:brightness-110 active:scale-95 transition-transform duration-75 border border-indigo-400/40 cursor-grab active:cursor-grabbing select-none group"
      title="Drag Gemini AI Button (खींचकर ऊपर-नीचे करें या क्लिक करके खोलें)"
    >
      <Sparkles className="w-5 h-5 animate-pulse pointer-events-none" />
      {/* Visual drag handle indicator tooltip on hover */}
      <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-dark-900/90 text-indigo-200 text-[9px] font-bold px-2 py-0.5 rounded-md border border-indigo-500/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-md">
        Move (ऊपर-नीचे खींचें)
      </span>
    </button>
  );
};
