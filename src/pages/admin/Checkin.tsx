import { ScanLine } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AdminCheckin() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Check-in</h1>
        <p className="text-sm text-slate-600">Leia o QR Code do ingresso para validar a entrada.</p>
      </div>
      <EmptyState
        icon={<ScanLine className="h-6 w-6" />}
        title="Check-in em desenvolvimento"
        description="Em breve: leitor de QR Code via câmera com validação atômica anti-fraude."
      />
    </div>
  );
}
