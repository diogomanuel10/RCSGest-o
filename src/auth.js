// Camada de autenticação sobre o Supabase Auth.
// Sem registo público: os utilizadores são criados no painel do Supabase.

import { supabase } from './supabase.js';

// Devolve a sessão atual (ou null). Mantida entre recargas pelo Supabase.
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

// Inicia sessão com email + password.
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data;
}

// Termina a sessão.
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Reage a mudanças de sessão (login/logout em qualquer separador).
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}

// Traduz erros do Supabase Auth para mensagens em português europeu.
export function authErrorMessage(error) {
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) {
    return 'Email ou palavra-passe incorretos. Verifica e tenta de novo.';
  }
  if (msg.includes('email not confirmed')) {
    return 'A conta ainda não foi confirmada. Confirma no painel do Supabase.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Não foi possível contactar o servidor. Verifica a ligação à internet.';
  }
  return error?.message || 'Ocorreu um erro ao iniciar sessão.';
}
