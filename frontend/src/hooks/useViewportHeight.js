import { useEffect } from 'react';

// Altura útil da tela.
// Em situação normal o app ocupa a tela inteira só com CSS (ver "Base" em index.css): nada é medido aqui,
// porque no iPhone com o app instalado window.innerHeight/visualViewport chegam menores que a tela.
// Só com o teclado virtual aberto é que --app-h recebe a altura visível, para o campo de mensagem
// ficar acima do teclado. Também guarda a altura do teclado em --kb-height, usada pelo painel de
// emojis para ocupar exatamente o lugar do teclado.
export const useViewportHeight = () => {
  useEffect(() => {
    const vv = window.visualViewport;
    const rootStyle = document.documentElement.style;
    let saved = 0;
    try { saved = parseInt(localStorage.getItem('hubify_kb_height') || '0', 10); } catch {}
    if (saved) rootStyle.setProperty('--kb-height', `${saved}px`);

    // Maior altura já vista sem teclado: referência para saber quanto o teclado ocupou
    let fullHeight = Math.max(window.innerHeight, vv ? vv.height : 0);

    const update = () => {
      const visible = vv ? vv.height : window.innerHeight;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
      if (!typing) fullHeight = Math.max(window.innerHeight, visible);
      const keyboard = Math.max(fullHeight, window.innerHeight) - visible;

      if (typing && keyboard > 150) {
        rootStyle.setProperty('--app-h', `${Math.round(visible)}px`);
        rootStyle.setProperty('--kb-height', `${Math.round(keyboard)}px`);
        try { localStorage.setItem('hubify_kb_height', String(Math.round(keyboard))); } catch {}
      } else {
        rootStyle.removeProperty('--app-h');
      }
      // iOS rola a página ao focar um campo; o app é fixo, então volta ao topo
      if (window.scrollY) window.scrollTo(0, 0);
    };

    const later = () => setTimeout(update, 60);
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', later);
    document.addEventListener('focusin', later);
    document.addEventListener('focusout', later);

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', later);
      document.removeEventListener('focusin', later);
      document.removeEventListener('focusout', later);
    };
  }, []);
};
