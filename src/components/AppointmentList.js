import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

function AppointmentList({ user }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Log para quando o componente renderiza e qual usuário ele tem
  //console.log('[AppointmentList] Renderizando. User ID:', user ? user.id : 'Nenhum');

  const fetchAppointments = useCallback(async () => {
    // Log para identificar qual instância de fetchAppointments está sendo chamada
    //console.log('[fetchAppointments] Iniciando. User ID na closure:', user ? user.id : 'Nenhum');

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const startOfTomorrow = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()).toISOString();
    if (!user || !user.id) {
      //console.warn("[fetchAppointments] Usuário não identificado. Limpando agendamentos e parando loading.");
      setAppointments([]); // Limpa os agendamentos se o usuário não estiver identificado
      setLoading(false);   // Para o loading
      return;
    }

    setLoading(true); // Definir loading no início da execução real do fetch
    setError(null);
    let { data, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('user_id', user.id) // Filtra pelo ID do usuário logado
      .or( // Mantém a lógica de status e data, mas agora dentro do escopo do usuário
        `status.eq.pending,and(status.eq.cancelado,scheduled_for.gte.${startOfToday},scheduled_for.lt.${startOfTomorrow})`
      );
      // A ordenação principal (pending primeiro, depois cancelados do dia) será feita no cliente.
      // A ordenação secundária (por data) também será feita no cliente.

    if (fetchError) {
      //console.error('Erro ao buscar agendamentos:', fetchError);
      setError(fetchError.message);
      setAppointments([]);
    } else {
      const fetchedAppointments = data || [];
      fetchedAppointments.sort((a, b) => {
        // Prioriza 'pending'
        if (a.status === 'pending' && b.status === 'cancelado') {
          return -1;
        }
        if (a.status === 'cancelado' && b.status === 'pending') {
          return 1;
        }
        // Se os status forem iguais (ou ambos não forem pending/cancelado), ordena por data
        return new Date(a.scheduled_for) - new Date(b.scheduled_for);
      });
      setAppointments(fetchedAppointments);
    }
    setLoading(false);
  }, [user]); // fetchAppointments agora depende de 'user'

  useEffect(() => {
    if (user && user.id) {
      //console.log('[useEffect] User ID válido, chamando fetchAppointments. User ID:', user.id);
      fetchAppointments();
    } else {
      //console.log('[useEffect] User ID inválido ou ausente. Limpando agendamentos e parando loading.');
      setAppointments([]); // Garante que a lista seja limpa se o usuário desaparecer
      setLoading(false);   // Para o loading se não houver usuário
    }

    // Se não houver usuário, não faz sentido configurar a subscrição.
    if (!user || !user.id) {
      return;
    }

    const channelName = `scheduled_messages_user_${user.id}`;
    //console.log(`[useEffect] Configurando subscrição para o canal: ${channelName}. User ID na closure do useEffect: ${user.id}`);
    const channel = supabase
        .channel(`scheduled_messages_user_${user.id}`) // Nome do canal específico do usuário
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'scheduled_messages',
            filter: `user_id=eq.${user.id}` // Filtra eventos no lado do Supabase para este usuário
          },
          (payload) => {
            // O user.id aqui DENTRO pode ser stale se o user mudar e o useEffect não refizer a subscrição a tempo.
            // No entanto, fetchAppointments é do useCallback e DEVERIA ter o user correto.
            //console.log(`%c[RealtimeCallback] Alteração recebida para o canal ${channelName}. Payload:`, 'color: green; font-weight: bold;', payload);
            // fetchAppointments é chamado, e por estar no useCallback e no array de dependências do useEffect,
            // será a versão correta com o 'user' atualizado.
            fetchAppointments();
          }
        );

    const subscription = channel.subscribe((status, err) => { // Capturar o resultado da subscrição
      if (status === 'SUBSCRIBED') {
        //console.log(`[useEffect] Subscrito com sucesso ao canal: ${channelName}`);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        //console.error(`[useEffect] Erro ao subscrever ao canal ${channelName}:`, err);
      }
    });

    return () => {
      // A remoção do canal é feita automaticamente pelo Supabase ao desinscrever
      // ou quando o cliente se desconecta. A principal ação aqui é desinscrever.
      if (typeof subscription?.unsubscribe === 'function') {
        //console.log(`[useEffect Cleanup] Desinscrevendo do canal: ${channelName}`);
        subscription.unsubscribe();
      }
    };
  }, [user, fetchAppointments]); // Adiciona 'user' e 'fetchAppointments' como dependências

  const handleCancelAppointment = async (appointmentId) => {
    const confirmed = window.confirm("Tem certeza que deseja cancelar este agendamento?");
    if (confirmed) {
      const { error: updateError } = await supabase
        .from('scheduled_messages')
        .update({ status: 'cancelado' })
        .eq('id', appointmentId)
        .eq('user_id', user.id) // Garante que só cancele o do usuário logado (boa prática)
        .select(); 

      if (updateError) {
        alert('Erro ao cancelar agendamento: ' + updateError.message);
        //console.error('[handleCancelAppointment] Erro ao atualizar:', updateError);
      } else {
        alert('Agendamento cancelado com sucesso!');
        //console.log('[handleCancelAppointment] Agendamento atualizado no DB. Buscando lista atualizada...');
        fetchAppointments(); // Chama fetchAppointments para atualizar a lista
      }
    }
  };

  const handleLogout = async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      //console.error('Erro ao fazer logout:', signOutError);
    }
    // O onAuthStateChange no App.js cuidará do redirecionamento para a tela de Login.
  };

  if (loading) return <p>Carregando agendamentos...</p>;
  if (error) return <p>Erro ao carregar agendamentos: {error}</p>;

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Lista de Agendamentos</h2>
        <button onClick={handleLogout} style={{ padding: '8px 15px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sair</button>
      </div>
      {appointments.length === 0 ? (
        <p>Nenhum agendamento encontrado.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
          <thead>
            <tr style={{ backgroundColor: '#f2f2f2' }}>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Telefone</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Mensagem</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Agendado Para</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Status</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((app) => (
              <tr key={app.id}>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{app.phone_number}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{app.message_text}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{new Date(app.scheduled_for).toLocaleString('pt-BR')}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{app.status}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                  {app.status !== 'cancelado' && (
                    <button onClick={() => handleCancelAppointment(app.id)} style={{ padding: '5px 10px', backgroundColor: '#ffc107', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AppointmentList;