
import React from 'react';
import { X, Download, FileText, Image as ImageIcon, FileCode, FileArchive, FileSpreadsheet, Package } from 'lucide-react';
import { useChat } from '../../context/ChatContext';

export default function DocumentPreviewModal() {
  const { previewDocument, setPreviewDocument } = useChat();

  if (!previewDocument) return null;

  const { name, type, data, size } = previewDocument;
  const isImage = type.startsWith('image/');
  const isPDF = type === 'application/pdf';

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-4 bg-black/40 animate-fade-in duration-300"
      onClick={() => setPreviewDocument(null)}
    >
      <div 
        className="bg-surface w-full max-w-5xl h-[90vh] md:h-[85vh] rounded-lg md:rounded-lg shadow-pop flex flex-col overflow-hidden animate-fade-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-line flex items-center justify-between bg-surface shrink-0">
          <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-brand-soft rounded-md md:rounded-lg flex items-center justify-center text-brand shrink-0">
              {isImage ? <ImageIcon size={20} /> : <FileText size={20} />}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-ink truncate text-sm md:text-base">{name}</h3>
              <p className="text-[9px] md:text-[10px] font-semibold text-ink-3 uppercase">{(size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <a 
              href={data} 
              download={name}
              className="flex items-center justify-center w-10 h-10 md:w-auto md:px-6 md:py-3 bg-brand text-on-brand rounded-md md:rounded-lg font-semibold text-sm hover:bg-brand-hover transition-all active:scale-95 shadow-card"
              title="Download"
            >
              <Download size={18} />
              <span className="hidden md:inline ml-2">Download</span>
            </a>
            <button 
              onClick={() => setPreviewDocument(null)}
              className="w-10 h-10 flex items-center justify-center text-ink-3 hover:bg-hover rounded-md md:rounded-lg transition-all bg-subtle border border-line"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-auto bg-subtle flex items-center justify-center p-4 md:p-8">
          {isImage ? (
            <img src={data} alt={name} className="max-w-full max-h-full object-contain rounded-md shadow-card" />
          ) : isPDF ? (
            <iframe src={data} title={name} className="w-full h-full rounded-md border-none shadow-card" />
          ) : (
            <div className="bg-surface p-12 rounded-lg shadow-card border border-line flex flex-col items-center text-center max-w-md">
              <div className="w-24 h-24 bg-subtle rounded-lg flex items-center justify-center text-ink-3 mb-6">
                <FileText size={48} />
              </div>
              <h4 className="text-xl font-semibold text-ink mb-2">Visualização indisponível</h4>
              <p className="text-sm text-ink-2 font-medium mb-8 leading-relaxed">
                No momento, o Hubify suporta visualização direta apenas para Imagens e PDFs. Para outros arquivos, faça o download para abrir em seu dispositivo.
              </p>
              <a 
                href={data} 
                download={name}
                className="w-full bg-hover text-ink-2 py-4 rounded-lg font-semibold hover:bg-hover transition-all"
              >
                Baixar agora
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
