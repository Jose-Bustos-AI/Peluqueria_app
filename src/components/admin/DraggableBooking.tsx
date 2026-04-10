import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns';
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Edit, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Booking {
  id: string;
  start_at: string;
  end_at: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  professional: {
    id: string;
    name: string;
    color: string;
  };
  service?: {
    id: string;
    name: string;
  };
  class?: {
    id: string;
    name: string;
  };
  user: {
    name: string;
    email: string;
  };
}

interface DraggableBookingProps {
  booking: Booking;
  layout: {
    top: string;
    height: string;
    width: string;
    left: string;
    display?: string;
  };
  isValid: boolean;
  totalBookingsInSlot?: number;
  onOpenDetails: () => void;
  onEdit: () => void;
  onCancel: () => void;
  sortedGroupLength: number;
  isReadOnly?: boolean;
}

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed: "bg-green-100 text-green-800 border-green-200", 
  completed: "bg-blue-100 text-blue-800 border-blue-200",
  cancelled: "bg-red-100 text-red-800 border-red-200"
};

const STATUS_LABELS = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada"
};

export default function DraggableBooking({
  booking,
  layout,
  isValid,
  totalBookingsInSlot = 1,
  onOpenDetails,
  onEdit,
  onCancel,
  sortedGroupLength,
  isReadOnly = false
}: DraggableBookingProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: booking.id,
    data: { booking },
    disabled: isReadOnly
  });

  const style = {
    top: layout.top,
    height: layout.height,
    width: layout.width,
    left: layout.left,
    backgroundColor: '#e3f2fd',
    borderLeft: `4px solid ${booking.professional.color}`,
    maxWidth: sortedGroupLength > 1 ? '120px' : '200px',
    marginRight: '2px',
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : isReadOnly ? 0.75 : 1,
    cursor: isReadOnly ? 'default' : isDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 30 : 20,
    display: 'flex' as const,
    flexDirection: 'column' as const,
  };

  const formatTimeRange = (startAt: string, endAt: string) => {
    return `${format(new Date(startAt), 'HH:mm')} - ${format(new Date(endAt), 'HH:mm')}`;
  };

  const isOverbooked = totalBookingsInSlot > 1;
  const statusColor = STATUS_COLORS[booking.status as keyof typeof STATUS_COLORS] || 'bg-gray-100 text-gray-800';
  const statusLabel = STATUS_LABELS[booking.status as keyof typeof STATUS_LABELS] || booking.status;

  return (
    <div
      ref={setNodeRef}
      data-booking-id={booking.id}
      className={cn(
        "absolute rounded-md border border-gray-200 hover:shadow-lg transition-shadow",
        isOverbooked && "bg-orange-50 border-orange-300",
        !isValid && "border-orange-400 border-2"
      )}
      style={style}
      title={!isValid ? "Fuera de horario" : undefined}
    >
      <div 
        {...listeners} 
        {...attributes}
        className="p-2 h-full flex flex-col justify-between gap-1"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('[data-dropdown-trigger]')) {
            onOpenDetails();
          }
        }}
      >
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-start justify-between gap-1">
            <div className="font-bold text-[11px] leading-tight flex-1 flex items-center gap-1" style={{ color: '#1a1a1a' }}>
              <span>{formatTimeRange(booking.start_at, booking.end_at)}</span>
              {!isValid && <span className="text-orange-600">⚠️</span>}
              {isOverbooked && (
                <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5">
                  {totalBookingsInSlot}
                </Badge>
              )}
            </div>
            {!isReadOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger 
                  data-dropdown-trigger
                  onClick={(e) => e.stopPropagation()}
                  className="h-3.5 w-3.5 transition-opacity flex-shrink-0"
                >
                  <MoreVertical className="h-3 w-3 text-gray-600" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                    <Edit className="mr-2 h-4 w-4" />
                    Modificar cita
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => { e.stopPropagation(); onCancel(); }}
                    className="text-destructive"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancelar cita
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="text-[10px] leading-tight truncate" style={{ color: '#666' }}>
            {booking.user.name}
          </div>
        </div>
        <div className="flex-shrink-0">
          <Badge 
            variant="outline" 
            className={cn("text-[8px] px-1 py-0 h-3.5", STATUS_COLORS[booking.status])}
          >
            {STATUS_LABELS[booking.status].charAt(0)}
          </Badge>
        </div>
      </div>
    </div>
  );
}
