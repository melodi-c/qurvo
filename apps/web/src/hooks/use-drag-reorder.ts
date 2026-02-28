import { useRef, useState } from 'react';

export function useDragReorder<T>(items: T[], onChange: (items: T[]) => void) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const handleDragStart = (i: number, e: React.DragEvent<HTMLDivElement>) => {
    setDragIdx(i);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => {
      if (dragNode.current) {dragNode.current.style.opacity = '0.4';}
    });
  };

  const handleDragEnd = () => {
    if (dragNode.current) {dragNode.current.style.opacity = '1';}
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const next = [...items];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(overIdx, 0, moved);
      onChange(next);
    }
    setDragIdx(null);
    setOverIdx(null);
    dragNode.current = null;
  };

  const handleDragOver = (i: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIdx !== null && i !== overIdx) {
      setOverIdx(i);
    }
  };

  const handleDragLeave = (i: number) => {
    if (overIdx === i) {setOverIdx(null);}
  };

  return {
    dragIdx,
    overIdx,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
  };
}
