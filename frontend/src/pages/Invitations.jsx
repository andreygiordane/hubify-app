import React from 'react';
import { UserPlus } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/ui/Avatar';
import PageHeader from '../components/layout/PageHeader';

export default function Invitations() {
  const { user } = useAuth();
  const { groupInvites, handleAcceptGroupInvite, handleDeclineGroupInvite } = useChat();
  const myInvites = groupInvites.filter(i => i.toId === user?.id);
  const count = myInvites.length;

  return (
    <div className="flex-1 flex flex-col bg-surface overflow-hidden">
      <PageHeader title="Convites" subtitle={count === 0 ? 'Nenhum convite pendente' : `${count} convite${count > 1 ? 's' : ''} de grupo aguardando resposta`} />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 pb-28 md:pb-6 bg-app md:m-2 md:mt-0 md:rounded-[22px]">
        <div className="max-w-2xl mx-auto space-y-3">
          {count === 0 ? (
            <div className="card px-6 py-14 flex flex-col items-center text-center">
              <span className="w-14 h-14 rounded-full bg-app text-ink-3 flex items-center justify-center mb-4"><UserPlus className="w-6 h-6" strokeWidth={1.75} /></span>
              <p className="text-[15px] font-semibold text-ink">Tudo em dia</p>
              <p className="text-sm text-ink-2 mt-1 max-w-xs">Quando alguém convidar você para um grupo, o convite aparece aqui.</p>
            </div>
          ) : (
            myInvites.map(invite => (
              <div key={invite.id} className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3.5 flex-1 min-w-0">
                  <Avatar name={invite.groupName} size={52} square />
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-semibold text-ink truncate">{invite.groupName}</h3>
                    <p className="text-sm text-ink-2 truncate">Convite de <span className="font-medium text-ink">{invite.fromName}</span> · {new Date(invite.timestamp).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleDeclineGroupInvite(invite.id)} className="btn-secondary flex-1 sm:flex-none h-11 px-5 text-[14px]">Recusar</button>
                  <button onClick={() => handleAcceptGroupInvite(invite.id)} className="btn-primary flex-1 sm:flex-none h-11 px-6 text-[14px]">Aceitar</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
