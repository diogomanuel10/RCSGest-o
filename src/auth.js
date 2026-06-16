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

// Cria uma conta nova com email + password.
// Devolve { needsConfirmation } — true quando o Supabase exige confirmação
// por email antes de a sessão ficar ativa.
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  // Sem sessão imediata => a conta requer confirmação por email.
  return { needsConfirmation: !data.session, data };
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
    return 'A conta ainda não foi confirmada. Vê o email de confirmação que recebeste.';
  }
  if (msg.includes('user already registered') || msg.includes('already been registered')) {
    return 'Já existe uma conta com este email. Inicia sessão em vez de criar conta.';
  }
  if (msg.includes('signups not allowed') || msg.includes('signup is disabled')) {
    return 'O registo está desativado no Supabase. Ativa "Allow new users to sign up" nas definições de autenticação.';
  }
  if (msg.includes('password should be') || msg.includes('weak password')) {
    return 'A palavra-passe é demasiado fraca (mínimo 6 caracteres).';
  }
  if (msg.includes('unable to validate email') || msg.includes('invalid email')) {
    return 'O email indicado não é válido.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Não foi possível contactar o servidor. Verifica a ligação à internet.';
  }
  return error?.message || 'Ocorreu um erro de autenticação.';
}
