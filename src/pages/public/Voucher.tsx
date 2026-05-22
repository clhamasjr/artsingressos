import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { Calendar, MapPin, AlertCircle, Download } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatEventDate } from '@/lib/date';

interface VoucherResponse {
  hash: string;
  status: 'valido' | 'usado' | 'cancelado';
  ticket_type_name: string;
  buyer_name: string;
  buyer_cpf_masked: string;
  event_name: string;
  event_starts_at: string;
  event_location_name: string | null;
  event_location_address: string | null;
  used_at: string | null;
}

export default function Voucher() {
  const { hash } = useParams<{ hash: string }>();
  const [voucher, setVoucher] = useState<VoucherResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hash) return;
    let canceled = false;
    const fetchVoucher = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-voucher?hash=${hash}`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        });
        const json = (await res.json()) as VoucherResponse | { error: string };
        if (canceled) return;
        if (!res.ok || 'error' in json) {
          setError('error' in json ? json.error : 'Voucher não encontrado');
          return;
        }
        setVoucher(json);
        // Gera QR code com o hash (que é HMAC-SHA256, validado server-side no check-in)
        const dataUrl = await QRCode.toDataURL(json.hash, {
          width: 380,
          margin: 1,
          errorCorrectionLevel: 'H',
        });
        if (!canceled) setQrDataUrl(dataUrl);
      } catch (e) {
        if (!canceled) setError(e instanceof Error ? e.message : 'Erro ao carregar voucher');
      } finally {
        if (!canceled) setLoading(false);
      }
    };
    fetchVoucher();
    return () => {
      canceled = true;
    };
  }, [hash]);

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 sm:px-6 py-16 text-center">
        <Spinner className="h-8 w-8 mx-auto" />
        <p className="mt-3 text-slate-500">Carregando voucher...</p>
      </div>
    );
  }

  if (error || !voucher) {
    return (
      <div className="mx-auto max-w-md px-4 sm:px-6 py-12">
        <EmptyState
          icon={<AlertCircle className="h-6 w-6" />}
          title="Voucher inválido"
          description={error ?? 'Esse voucher não foi encontrado.'}
          action={<Link to="/" className="btn-primary">Voltar</Link>}
        />
      </div>
    );
  }

  const isUsed = voucher.status === 'usado';
  const isCanceled = voucher.status === 'cancelado';

  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 py-8">
      <div className="voucher-print-area rounded-2xl bg-white shadow-md ring-1 ring-slate-200 overflow-hidden">
        {/* Topo brand */}
        <div className="bg-brand-600 text-white text-center p-5">
          <p className="text-xs uppercase tracking-wider opacity-80">Arts Ingressos</p>
          <h1 className="text-xl font-bold mt-1 line-clamp-2">{voucher.event_name}</h1>
        </div>

        {/* Status banner */}
        {(isUsed || isCanceled) && (
          <div
            className={`text-center py-2 text-sm font-semibold ${
              isUsed
                ? 'bg-amber-50 text-amber-700 border-b border-amber-200'
                : 'bg-red-50 text-red-700 border-b border-red-200'
            }`}
          >
            {isUsed ? `Já utilizado em ${voucher.used_at ?? '-'}` : 'Cancelado'}
          </div>
        )}

        {/* QR Code */}
        <div className="p-6 flex justify-center bg-white">
          <div className={`p-4 rounded-lg ${isUsed || isCanceled ? 'opacity-30' : ''}`}>
            {qrDataUrl && <img src={qrDataUrl} alt="QR Code do ingresso" width={300} height={300} />}
          </div>
        </div>

        {/* Detalhes */}
        <div className="px-6 pb-6 space-y-3">
          <div className="text-center pb-3 border-b border-dashed border-slate-200">
            <p className="text-xs uppercase tracking-wider text-slate-500">Tipo</p>
            <p className="font-semibold text-slate-900">{voucher.ticket_type_name}</p>
          </div>

          <Row label="Nome" value={voucher.buyer_name} />
          <Row label="CPF" value={voucher.buyer_cpf_masked} mono />

          <div className="pt-3 border-t border-slate-200 space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
              {formatEventDate(voucher.event_starts_at)}
            </div>
            {voucher.event_location_name && (
              <div className="flex items-start gap-2 text-sm text-slate-700">
                <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p>{voucher.event_location_name}</p>
                  {voucher.event_location_address && (
                    <p className="text-xs text-slate-500">{voucher.event_location_address}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 text-center">
            <p className="text-[10px] text-slate-400 font-mono break-all">{voucher.hash}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.print()}
        className="no-print mt-4 w-full btn-secondary"
      >
        <Download className="h-4 w-4" /> Salvar / Imprimir
      </button>

      <p className="no-print mt-3 text-xs text-slate-500 text-center px-4">
        Apresente o QR Code na entrada. O voucher é pessoal e intransferível.
      </p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
