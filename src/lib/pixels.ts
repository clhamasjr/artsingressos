/**
 * Helpers pra disparar eventos Meta Pixel + TikTok Pixel client-side.
 * Os componentes <MetaPixel /> e <TikTokPixel /> injetam os scripts no head.
 * Funções abaixo só disparam se os pixels estiverem carregados.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    ttq?: {
      track: (event: string, params?: Record<string, unknown>, options?: Record<string, unknown>) => void;
      page: () => void;
      identify?: (params: Record<string, unknown>) => void;
    };
  }
}

interface PurchaseParams {
  value: number; // em reais (não centavos)
  currency?: string;
  content_ids?: string[];
  content_name?: string;
  num_items?: number;
  order_id?: string;
}

interface ViewContentParams {
  content_ids?: string[];
  content_name?: string;
  content_category?: string;
  value?: number;
  currency?: string;
}

interface InitiateCheckoutParams extends ViewContentParams {
  num_items?: number;
}

export function trackPageView(): void {
  try { window.fbq?.('track', 'PageView'); } catch { /* ignore */ }
  try { window.ttq?.page(); } catch { /* ignore */ }
}

export function trackViewContent(params: ViewContentParams): void {
  const fbParams = {
    content_ids: params.content_ids,
    content_name: params.content_name,
    content_category: params.content_category,
    content_type: 'product',
    value: params.value,
    currency: params.currency ?? 'BRL',
  };
  try { window.fbq?.('track', 'ViewContent', fbParams); } catch { /* ignore */ }
  try { window.ttq?.track('ViewContent', fbParams); } catch { /* ignore */ }
}

export function trackInitiateCheckout(params: InitiateCheckoutParams): void {
  const fbParams = {
    content_ids: params.content_ids,
    content_name: params.content_name,
    content_type: 'product',
    value: params.value,
    currency: params.currency ?? 'BRL',
    num_items: params.num_items,
  };
  try { window.fbq?.('track', 'InitiateCheckout', fbParams); } catch { /* ignore */ }
  try { window.ttq?.track('InitiateCheckout', fbParams); } catch { /* ignore */ }
}

export function trackPurchase(params: PurchaseParams): void {
  const fbParams = {
    value: params.value,
    currency: params.currency ?? 'BRL',
    content_ids: params.content_ids,
    content_name: params.content_name,
    content_type: 'product',
    num_items: params.num_items,
  };
  try {
    window.fbq?.('track', 'Purchase', fbParams, { eventID: params.order_id });
  } catch { /* ignore */ }
  try {
    window.ttq?.track('CompletePayment', fbParams, { event_id: params.order_id });
  } catch { /* ignore */ }
}
