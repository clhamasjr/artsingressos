import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Tables } from '@/lib/supabase';

export type Customer = Tables<'customers'>;

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** Role admin/operator (admin_users) */
  isAdmin: boolean;
  isOperator: boolean;
  /** Dados do cliente (customers) — null se não for customer */
  customer: Customer | null;
  isCustomer: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfiles = useCallback(async (userId: string) => {
    const [adminRes, customerRes] = await Promise.all([
      supabase.from('admin_users').select('role').eq('id', userId).maybeSingle(),
      supabase.from('customers').select('*').eq('id', userId).maybeSingle(),
    ]);
    setRole(adminRes.data?.role ?? null);
    setCustomer((customerRes.data as Customer | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) loadProfiles(data.session.user.id);
      else setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      if (newSession?.user) loadProfiles(newSession.user.id);
      else {
        setRole(null);
        setCustomer(null);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfiles]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
    setCustomer(null);
  };

  const refreshCustomer = async () => {
    if (session?.user) await loadProfiles(session.user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isAdmin: role === 'admin',
        isOperator: role === 'admin' || role === 'operator',
        customer,
        isCustomer: !!customer,
        loading,
        signOut,
        refreshCustomer,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
