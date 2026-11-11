
import React from 'react';
import { CheckCircle2, X, Info } from 'lucide-react';
import { useChat } from '../../context/ChatContext';

export default function SuccessModal() {
  const { showSuccessModal, setShowSuccessModal, successMessage } = useChat();

  if (!showSuccessModal) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 animate-fade-in duration-300">
      <div className="bg-surface w-full max-w-md rounded-lg shadow-pop border border-line overflow-hidden animate-fade-in duration-300">
        <div className="p-8 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-brand-soft rounded-lg flex items-center justify-center mb-6 shadow-sm">
            <Info className="w-10 h-10 text-brand" />
          </div>
          
          <h3 className="text-2xl font-semibold text-ink mb-2">Aviso Importante</h3>
          <p className="text-ink-2 font-medium leading-relaxed mb-8 px-4">
            {successMessage || "Operação realizada com sucesso!"}
          </p>

          <button 
            onClick={() => setShowSuccessModal(false)}
            className="w-full bg-brand text-on-brand py-5 rounded-lg font-semibold text-lg transition-all hover:bg-brand-hover active:scale-95 shadow-card"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
