# Arts Ingressos

Plataforma de venda de ingressos online com pagamento via Pix e cartão, geração de voucher com QR Code, check-in mobile e métricas integradas Meta Ads + TikTok Ads.

## Stack

- **Front:** React 18 + Vite 5 + TypeScript 5 + TailwindCSS 3
- **Banco / Auth / Storage:** Supabase (Postgres + RLS)
- **Pagamento:** Mercado Pago (Pix + Cartão)
- **Mensageria:** WhatsApp via Evolution API + e-mail via Resend
- **Deploy:** Vercel
- **Analytics:** Meta Pixel + TikTok Pixel + Conversions API

## Segurança

- Row Level Security (RLS) em todas as tabelas
- Webhook Mercado Pago validado por assinatura HMAC
- QR Code do voucher assinado com HMAC-SHA256
- Secrets isolados em Edge Functions (nunca no front)
- Validação dupla (client + server) com Zod
- Transação SQL com lock pra evitar overselling
- LGPD: política de privacidade + opção de exclusão

## Setup local

```bash
npm install
cp .env.example .env.local
# preencher .env.local com as chaves
npm run dev
```

## Estrutura

```
artsingressos/
├── public/                 # Assets estáticos
├── src/
│   ├── components/         # Componentes reutilizáveis
│   ├── lib/                # Cliente Supabase, utils
│   ├── pages/
│   │   ├── public/         # Home, Evento, Checkout, Pedido, Voucher
│   │   └── admin/          # Login, Dashboard, Eventos, Pedidos, Checkin, ROI
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   ├── migrations/         # Schemas + RLS policies
│   └── functions/          # Edge Functions (webhook MP, envio voucher, ROI)
└── ...
```

## Roadmap

- **Fase 1** — MVP vendável (catálogo + checkout Pix/cartão + voucher + admin básico)
- **Fase 2** — Check-in mobile + Meta/TikTok Pixel + Conversions API
- **Fase 3** — Dashboard ROI cruzando vendas + gasto em anúncios
