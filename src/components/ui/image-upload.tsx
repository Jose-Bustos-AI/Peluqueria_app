import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Upload, X, Image as ImageIcon, Link } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  validateImageFile, 
  processImage, 
  generateFileName, 
  getProfessionalPhotoPath,
  getCategoryIconPath,
  isOurStorageUrl,
  extractFilenameFromUrl
} from '@/lib/image-utils';

interface ImageUploadProps {
  value?: string;
  onChange: (url: string | null) => void;
  professionalId?: string;
  categoryId?: string;
  voucherTypeId?: string;
  disabled?: boolean;
  existingPhotoUrl?: string;
}

export function ImageUpload({ 
  value, 
  onChange, 
  professionalId, 
  categoryId, 
  voucherTypeId,
  disabled = false,
  existingPhotoUrl 
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(value || null);
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);
    
    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError('Debes iniciar sesión para subir imágenes.');
      toast({
        title: "Error de autenticación",
        description: "Debes iniciar sesión para subir imágenes",
        variant: "destructive"
      });
      return;
    }
    
    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error!);
      return;
    }

    try {
      setUploading(true);
      setProgress(10);

      // Process image (resize and compress)
      const { file: processedFile, preview: previewUrl } = await processImage(file);
      setProgress(30);
      setPreview(previewUrl);

      // Generate unique filename and path
      const filename = generateFileName();
      const entityId = professionalId || categoryId || voucherTypeId;
      const tempId = entityId === 'temp' ? `temp_${Date.now()}` : entityId;
      
      let filePath: string;
      if (categoryId) {
        filePath = getCategoryIconPath(tempId!, filename);
      } else if (professionalId) {
        filePath = getProfessionalPhotoPath(tempId!, filename);
      } else if (voucherTypeId) {
        filePath = `voucher_types/${tempId}/${filename}`;
      } else {
        filePath = `temp_${Date.now()}/${filename}`;
      }
      
      setProgress(50);

      // Delete old file if it exists and is from our storage
      if (existingPhotoUrl && isOurStorageUrl(existingPhotoUrl)) {
        const oldFilename = extractFilenameFromUrl(existingPhotoUrl);
        if (oldFilename) {
          let oldPath: string;
          if (categoryId) {
            oldPath = getCategoryIconPath(categoryId, oldFilename);
          } else if (professionalId) {
            oldPath = getProfessionalPhotoPath(professionalId || 'temp', oldFilename);
          } else if (voucherTypeId) {
            oldPath = `voucher_types/${voucherTypeId}/${oldFilename}`;
          } else {
            oldPath = `temp_${Date.now()}/${oldFilename}`;
          }
          await supabase.storage.from('public-media').remove([oldPath]);
        }
      }

      setProgress(70);

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('public-media')
        .upload(filePath, processedFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        throw uploadError;
      }

      setProgress(90);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('public-media')
        .getPublicUrl(filePath);

      setProgress(100);
      onChange(publicUrl);
      
      toast({
        title: "Éxito",
        description: "Foto subida correctamente"
      });

      // Log audit event
      if (entityId && entityId !== 'temp' && !entityId.startsWith('temp_')) {
        let entityType: string;
        let action: string;
        
        if (categoryId) {
          entityType = 'category';
          action = 'category.icon.updated';
        } else if (professionalId) {
          entityType = 'professional';
          action = 'professional.photo.updated';
        } else if (voucherTypeId) {
          entityType = 'voucher_type';
          action = 'voucher_type.photo.updated';
        } else {
          return; // Skip audit log for unknown types
        }
        
        await supabase.from('audit_logs').insert([{
          action: action,
          entity_type: entityType,
          entity_id: entityId,
          data: { filename, path: filePath }
        }]);
      }

    } catch (err) {
      console.error('Upload error:', err);
      setError('No se pudo subir la imagen. Inténtalo de nuevo.');
      setPreview(null);
      toast({
        title: "Error",
        description: "No se pudo subir la imagen",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [professionalId, existingPhotoUrl, onChange, toast]);

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (disabled || uploading) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [disabled, uploading, handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Handle file input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // Remove photo
  const handleRemove = useCallback(async () => {
    try {
      // Delete from storage if it's our file
      if (value && isOurStorageUrl(value)) {
        const filename = extractFilenameFromUrl(value);
        if (filename && professionalId) {
          const filePath = getProfessionalPhotoPath(professionalId, filename);
          await supabase.storage.from('public-media').remove([filePath]);
        }
      }

      setPreview(null);
      onChange(null);
      
      // Log audit event
      if (professionalId && professionalId !== 'temp' && !professionalId.startsWith('temp_')) {
        await supabase.from('audit_logs').insert([{
          action: 'professional.photo.removed',
          entity_type: 'professional',
          entity_id: professionalId,
          data: { removed_url: value }
        }]);
      }
      
      toast({
        title: "Éxito",
        description: "Foto eliminada"
      });
    } catch (err) {
      console.error('Remove error:', err);
      toast({
        title: "Error",
        description: "No se pudo eliminar la foto",
        variant: "destructive"
      });
    }
  }, [value, professionalId, onChange, toast]);

  // Handle manual URL input
  const handleManualUrl = useCallback(() => {
    if (manualUrl.trim()) {
      setPreview(manualUrl);
      onChange(manualUrl);
      setShowUrlInput(false);
      setManualUrl('');
      toast({
        title: "Éxito",
        description: "URL de foto actualizada"
      });
    }
  }, [manualUrl, onChange, toast]);

  return (
    <div className="space-y-4">
      {/* Preview */}
      {preview && (
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200">
              <img 
                src={preview} 
                alt="Preview" 
                className="w-full h-full object-cover"
                onError={() => {
                  setPreview(null);
                  setError('Error al cargar la imagen');
                }}
              />
            </div>
            {!disabled && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                onClick={handleRemove}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            Foto actual
          </div>
        </div>
      )}

      {/* Upload Area */}
      {!showUrlInput && (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            disabled ? 'border-gray-200 bg-gray-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {uploading ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center">
                <Upload className="h-8 w-8 text-blue-500 animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground">Subiendo foto...</p>
              <Progress value={progress} className="w-full max-w-xs mx-auto" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-center">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Arrastra una foto aquí o</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Seleccionar archivo
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                JPG, PNG o WebP hasta 2MB
              </p>
            </div>
          )}
        </div>
      )}

      {/* Manual URL Input */}
      {showUrlInput && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="https://ejemplo.com/foto.jpg"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              disabled={disabled}
            />
            <Button
              type="button"
              onClick={handleManualUrl}
              disabled={!manualUrl.trim() || disabled}
            >
              Aplicar
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowUrlInput(false)}
          >
            Cancelar
          </Button>
        </div>
      )}

      {/* Toggle URL Input */}
      {!showUrlInput && !uploading && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowUrlInput(true)}
          disabled={disabled}
          className="text-xs"
        >
          <Link className="h-3 w-3 mr-1" />
          Pegar URL manualmente
        </Button>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
}