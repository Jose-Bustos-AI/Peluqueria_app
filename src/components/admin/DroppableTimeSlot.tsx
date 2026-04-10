import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface DroppableTimeSlotProps {
  id: string;
  date: Date;
  hour: number;
  children: React.ReactNode;
  onDoubleClick?: (date: Date, hour: number) => void;
}

export default function DroppableTimeSlot({ id, date, hour, children, onDoubleClick }: DroppableTimeSlotProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { date, hour }
  });

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!onDoubleClick) return;

    const target = e.target as HTMLElement | null;
    const isClickOnBookingCard = !!target?.closest('[data-booking-id]');

    if (!isClickOnBookingCard) {
      onDoubleClick(date, hour);
    }
  };

  return (
    <div
      ref={setNodeRef}
      onDoubleClick={handleDoubleClick}
      className={isOver ? 'bg-primary/10' : ''}
      style={{ 
        position: 'relative', 
        height: '64px',
        borderBottom: '1px dashed hsl(var(--border) / 0.3)',
        cursor: 'pointer'
      }}
    >
      {children}
    </div>
  );
}
