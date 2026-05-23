import { useRef, useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ImageUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  bucket?: string;
  folder?: string;
  /** Texto curto que aparece dentro da área quando vazia */
  placeholder?: string;
  /** Altura mínima da preview (default md) */
  size?: 'sm' | 'md' | 'lg';
}

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function ImageUpload({
  value,
  onChange,
  bucket = 'event-assets',
  folder = '',
  placeholder = 'Clique pra enviar uma imagem',
  size = 'md',
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heights = { sm: 'h-32', md: 'h-48', lg: 'h-64' };

  const handleFile = async (file: File) => {
    setError(null);
    if (!ALLOWED.includes(file.type)) {
      setError('Formato inválido. Use PNG, JPEG, WEBP ou GIF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Imagem muito grande. Máximo 8 MB.');
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${folder ? folder.replace(/\/$/, '') + '/' : ''}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no upload');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = () => onChange(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED.join(',')}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {value ? (
        <div className="relative group">
          <img
            src={value}
            alt="Pré-visualização"
            className={`w-full ${heights[size]} object-cover rounded-lg ring-1 ring-slate-200 bg-slate-100`}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded-md bg-white/90 backdrop-blur px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-white"
            >
              Trocar
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="rounded-md bg-white/90 backdrop-blur p-1.5 text-red-600 shadow-sm hover:bg-white"
              aria-label="Remover"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`w-full ${heights[size]} flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-brand-400 transition-colors text-slate-500`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Enviando...</span>
            </>
          ) : (
            <>
              <Upload className="h-6 w-6" />
              <span className="text-sm font-medium text-slate-700">{placeholder}</span>
              <span className="text-xs text-slate-500">PNG, JPEG, WEBP até 8 MB</span>
            </>
          )}
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
