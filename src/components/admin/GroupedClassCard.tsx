import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupedClassCardProps {
  className: string;
  participantCount: number;
  capacity: number;
  color: string;
  onClick: () => void;
}

export function GroupedClassCard({
  className,
  participantCount,
  capacity,
  color,
  onClick
}: GroupedClassCardProps) {
  const isFull = participantCount >= capacity;
  const isNearFull = participantCount >= capacity * 0.8;

  return (
    <div
      className={cn(
        "h-full rounded-md border-2 cursor-pointer",
        "transition-all duration-200 hover:shadow-lg hover:z-10",
        "bg-white/95 backdrop-blur-sm",
        // Efecto de brillo distintivo para clases grupales
        "ring-2 shadow-[0_0_8px_rgba(59,130,246,0.2)]",
        isFull 
          ? "border-red-400 bg-red-50/95 ring-red-300/40" 
          : isNearFull 
            ? "border-yellow-400 bg-yellow-50/95 ring-yellow-300/40"
            : "border-primary/40 bg-primary/5 ring-primary/25"
      )}
      onClick={onClick}
    >
      <div className="h-full p-2 flex flex-col justify-center gap-1 relative">
        <div 
          className="w-1 h-full absolute left-0 top-0 bottom-0 rounded-l-sm"
          style={{ backgroundColor: color }}
        />
        <div className="flex items-center gap-2 pl-2">
          <Users className={cn(
            "h-4 w-4 flex-shrink-0",
            isFull ? "text-red-600" : isNearFull ? "text-yellow-600" : "text-primary"
          )} />
          <span className={cn(
            "font-semibold text-sm truncate flex-1",
            isFull ? "text-red-900" : isNearFull ? "text-yellow-900" : "text-foreground"
          )}>
            {className}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs pl-2">
          <span className={cn(
            "font-medium",
            isFull ? "text-red-700" : isNearFull ? "text-yellow-700" : "text-muted-foreground"
          )}>
            {participantCount}/{capacity} participantes
          </span>
          {isFull && (
            <span className="text-red-600 font-semibold text-[10px]">COMPLETO</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default GroupedClassCard;
