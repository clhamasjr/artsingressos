import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { CheckCircle2, XCircle, AlertTriangle, Calendar, MapPin, RotateCcw, Camera, ScanLine } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { formatEventDate, formatShort } from '@/lib/date';

interface CheckinResult {
  result: 'ok' | 'ja_usado' | 'cancelado' | 'invalido';
  ticket_id: string | null;
  ticket_type_name: string | null;
  event_name: string | null;
  event_starts_at: string | null;
  event_location_name: string | null;
  buyer_name: string | null;
  buyer_cpf_masked: string | null;
  used_at: string | null;
  used_by_email: string | null;
}

interface HistoryEntry extends CheckinResult {
  ts: string;
}

const COOLDOWN_MS = 2500;
const READER_ELEMENT_ID = 'qr-reader';

// Beep nativo via Web Audio API (sem precisar de arquivo .mp3)
function playBeep(frequency: number, duration: number) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    /* ignore */
  }
}

export default function AdminCheckin() {
  const { user } = useAuth();
  const readerRef = useRef<Html5Qrcode | null>(null);
  const cooldownRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [current, setCurrent] = useState<CheckinResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Aguarda elemento existir no DOM
    const initReader = async () => {
      const el = document.getElementById(READER_ELEMENT_ID);
      if (!el) return;
      const reader = new Html5Qrcode(READER_ELEMENT_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      readerRef.current = reader;

      try {
        await reader.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decoded) => {
            if (cooldownRef.current || !mounted) return;
            cooldownRef.current = true;
            void handleScan(decoded);
            setTimeout(() => {
              cooldownRef.current = false;
            }, COOLDOWN_MS);
          },
          () => {
            /* ignore decode noise */
          }
        );
        if (mounted) setScanning(true);
      } catch (err) {
        if (mounted) {
          setCameraError(err instanceof Error ? err.message : 'Não foi possível acessar a câmera');
        }
      }
    };

    initReader();

    return () => {
      mounted = false;
      const reader = readerRef.current;
      if (reader) {
        reader.stop().catch(() => {}).finally(() => {
          reader.clear();
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScan = async (decoded: string) => {
    setProcessing(true);
    try {
      // Aceita tanto o hash puro quanto uma URL /voucher/HASH
      const hash = decoded.includes('/voucher/')
        ? decoded.split('/voucher/').pop()?.split(/[?#]/)[0] ?? decoded
        : decoded;

      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: CheckinResult[] | null; error: { message: string } | null }>)(
        'checkin_ticket',
        { p_hash: hash, p_device: navigator.userAgent.slice(0, 200) }
      );

      if (error) {
        const errResult: CheckinResult = {
          result: 'invalido',
          ticket_id: null,
          ticket_type_name: null,
          event_name: null,
          event_starts_at: null,
          event_location_name: null,
          buyer_name: null,
          buyer_cpf_masked: null,
          used_at: null,
          used_by_email: null,
        };
        setCurrent(errResult);
        playBeep(220, 0.4);
        navigator.vibrate?.([100, 80, 100]);
        return;
      }

      const r = (data?.[0] ?? null);
      if (r) {
        setCurrent(r);
        setHistory((prev) => [{ ...r, ts: new Date().toISOString() }, ...prev].slice(0, 20));
        if (r.result === 'ok') {
          playBeep(880, 0.15);
          setTimeout(() => playBeep(1320, 0.2), 150);
          navigator.vibrate?.(150);
        } else if (r.result === 'ja_usado') {
          playBeep(440, 0.3);
          navigator.vibrate?.([200, 100, 200]);
        } else {
          playBeep(220, 0.5);
          navigator.vibrate?.([200, 100, 200, 100, 200]);
        }
      }
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => setCurrent(null);

  const resultColors = {
    ok: 'bg-emerald-50 border-emerald-300 text-emerald-900',
    ja_usado: 'bg-amber-50 border-amber-300 text-amber-900',
    cancelado: 'bg-red-50 border-red-300 text-red-900',
    invalido: 'bg-red-50 border-red-300 text-red-900',
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Check-in</h1>
          <p className="text-xs text-slate-500">Operador: {user?.email}</p>
        </div>
        {scanning && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Câmera ativa
          </span>
        )}
      </div>

      {/* Câmera */}
      <div className="card p-0 overflow-hidden">
        {cameraError ? (
          <div className="aspect-square flex flex-col items-center justify-center text-center p-6">
            <Camera className="h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-red-700">Câmera bloqueada</p>
            <p className="text-xs text-slate-500 mt-2 max-w-xs">{cameraError}</p>
            <p className="text-xs text-slate-500 mt-3">
              Permita o acesso à câmera nas configurações do navegador e recarregue.
            </p>
          </div>
        ) : (
          <div
            id={READER_ELEMENT_ID}
            className="aspect-square w-full bg-black"
            style={{ minHeight: 280 }}
          />
        )}
      </div>

      {/* Resultado da última leitura */}
      {!current && !processing && (
        <div className="card text-center text-slate-500 text-sm">
          <ScanLine className="h-6 w-6 mx-auto mb-2 text-slate-300" />
          Aponte a câmera para o QR Code do ingresso
        </div>
      )}

      {processing && !current && (
        <div className="card text-center">
          <Spinner className="h-6 w-6 mx-auto" />
          <p className="mt-2 text-sm text-slate-600">Validando...</p>
        </div>
      )}

      {current && (
        <div className={`rounded-xl border-2 p-5 ${resultColors[current.result]}`}>
          <div className="flex items-start gap-3">
            {current.result === 'ok' && <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-600" />}
            {current.result === 'ja_usado' && <AlertTriangle className="h-10 w-10 shrink-0 text-amber-600" />}
            {(current.result === 'cancelado' || current.result === 'invalido') && (
              <XCircle className="h-10 w-10 shrink-0 text-red-600" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold leading-tight">
                {current.result === 'ok' && 'LIBERADO ✅'}
                {current.result === 'ja_usado' && 'JÁ UTILIZADO ⚠️'}
                {current.result === 'cancelado' && 'CANCELADO ⛔'}
                {current.result === 'invalido' && 'INVÁLIDO ❌'}
              </p>
              {current.result === 'ja_usado' && current.used_at && (
                <p className="text-sm mt-1">Usado em {formatShort(current.used_at)}</p>
              )}
            </div>
          </div>

          {current.result !== 'invalido' && current.buyer_name && (
            <div className="mt-4 pt-4 border-t border-current/20 space-y-2 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider opacity-70">Nome</p>
                <p className="font-semibold">{current.buyer_name}</p>
              </div>
              {current.buyer_cpf_masked && (
                <div>
                  <p className="text-xs uppercase tracking-wider opacity-70">CPF</p>
                  <p className="font-mono">{current.buyer_cpf_masked}</p>
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-wider opacity-70">Tipo</p>
                <p className="font-medium">{current.ticket_type_name}</p>
              </div>
              {current.event_name && (
                <div className="pt-2">
                  <p className="font-medium flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {current.event_starts_at ? formatEventDate(current.event_starts_at) : ''}
                  </p>
                  {current.event_location_name && (
                    <p className="text-xs opacity-80 flex items-center gap-1.5 mt-1">
                      <MapPin className="h-3.5 w-3.5" /> {current.event_location_name}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            onClick={reset}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white/60 px-4 py-2 font-medium hover:bg-white/80"
          >
            <RotateCcw className="h-4 w-4" /> Próximo
          </button>
        </div>
      )}

      {/* Histórico */}
      {history.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-3 text-sm">Últimas leituras ({history.length})</h2>
          <ul className="divide-y divide-slate-100">
            {history.slice(0, 10).map((h, i) => (
              <li key={i} className="py-2 flex items-center gap-3">
                {h.result === 'ok' && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                {h.result === 'ja_usado' && <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />}
                {(h.result === 'cancelado' || h.result === 'invalido') && (
                  <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {h.buyer_name ?? '(inválido)'}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {h.ticket_type_name ?? '—'}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{formatShort(h.ts).slice(11)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
