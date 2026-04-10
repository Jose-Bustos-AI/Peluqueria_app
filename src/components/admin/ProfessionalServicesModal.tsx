import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Clock, Euro, Users, Tag } from "lucide-react";
import { useProfessionalServices } from "@/hooks/useProfessionalServices";

interface ProfessionalServicesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professional: {
    id: string;
    name: string;
    specialty?: string | null;
    photo_url?: string | null;
    color: string;
  } | null;
}

export function ProfessionalServicesModal({ 
  open, 
  onOpenChange, 
  professional 
}: ProfessionalServicesModalProps) {
  const { services, classes, loading, error } = useProfessionalServices(professional?.id);

  if (!professional) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {professional.photo_url ? (
              <img 
                src={professional.photo_url} 
                alt={professional.name}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div 
                className="h-10 w-10 rounded-full flex items-center justify-center text-white font-medium"
                style={{ backgroundColor: professional.color }}
              >
                {professional.name.charAt(0)}
              </div>
            )}
            <div>
              <div className="text-lg font-semibold">{professional.name}</div>
              {professional.specialty && (
                <div className="text-sm text-muted-foreground font-normal">
                  {professional.specialty}
                </div>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Cargando...</div>
          </div>
        )}

        {error && (
          <div className="text-destructive text-center py-4">
            Error: {error}
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-6">
            {/* Services Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4">
                Servicios ({services.length})
              </h3>
              {services.length === 0 ? (
                <div className="text-muted-foreground text-center py-4">
                  No hay servicios asignados
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {services.map((service) => (
                    <Card key={service.id}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center justify-between">
                          {service.name}
                          {service.category && (
                            <Badge variant="outline" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />
                              {service.category.name}
                            </Badge>
                          )}
                        </CardTitle>
                        {service.description && (
                          <p className="text-sm text-muted-foreground">
                            {service.description}
                          </p>
                        )}
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {service.duration_min} min
                          </div>
                          <div className="flex items-center gap-1">
                            <Euro className="h-4 w-4" />
                            {service.price}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {services.length > 0 && classes.length > 0 && <Separator />}

            {/* Classes Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4">
                Clases ({classes.length})
              </h3>
              {classes.length === 0 ? (
                <div className="text-muted-foreground text-center py-4">
                  No hay clases asignadas
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {classes.map((classItem) => (
                    <Card key={classItem.id}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center justify-between">
                          {classItem.name}
                          {classItem.category && (
                            <Badge variant="outline" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />
                              {classItem.category.name}
                            </Badge>
                          )}
                        </CardTitle>
                        {classItem.description && (
                          <p className="text-sm text-muted-foreground">
                            {classItem.description}
                          </p>
                        )}
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {classItem.duration_min} min
                          </div>
                          <div className="flex items-center gap-1">
                            <Euro className="h-4 w-4" />
                            {classItem.price}
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {classItem.capacity} pers.
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {services.length === 0 && classes.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground">
                Este profesional no tiene servicios ni clases asignados
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}