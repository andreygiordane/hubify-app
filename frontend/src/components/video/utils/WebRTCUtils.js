import { getIceServers } from './iceServers';

// Wrapper Nativo do WebRTC com "perfect negotiation":
// qualquer lado pode renegociar (câmera, tela) sem travar quando os dois fazem isso ao mesmo tempo.
export class Peer {
  constructor({ initiator, stream }) {
    // ICE servers vêm do servidor de sinalização (loadIceServers deve ser chamado antes)
    this._pc = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceCandidatePoolSize: 10
    });
    this.handlers = {};
    this.initiator = initiator;
    // Em colisão de ofertas, o lado "polite" cede e o "impolite" mantém a sua
    this.polite = !initiator;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.iceRestarts = 0;
    this.disconnectTimer = null;
    this.candidateQueue = [];

    if (stream) {
      console.log("[WebRTC] Adding local tracks to PeerConnection");
      stream.getTracks().forEach(track => this._pc.addTrack(track, stream));
    } else if (initiator) {
      // Sem mídia local ainda: oferece só recebimento para a conexão começar mesmo assim
      this._pc.addTransceiver('audio', { direction: 'recvonly' });
      this._pc.addTransceiver('video', { direction: 'recvonly' });
    }

    // Toda oferta (inicial, novo stream, ICE restart) sai daqui
    this._pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this._pc.setLocalDescription();
        this.emit("signal", this._pc.localDescription);
      } catch (err) {
        console.error("[WebRTC] Erro ao negociar:", err);
      } finally {
        this.makingOffer = false;
      }
    };

    this._pc.onicecandidate = (e) => {
      // Envia o candidato (mesmo que seja null, para sinalizar o fim da coleta)
      this.emit("signal", { candidate: e.candidate });
    };

    this._pc.ontrack = (e) => {
      console.log("[WebRTC] Track received:", e.track.kind, "| Stream count:", e.streams ? e.streams.length : 0);
      if (e.streams && e.streams[0]) {
        this.emit("stream", e.streams[0]);
      } else {
        this.emit("stream", new MediaStream([e.track]));
      }
    };

    this._pc.oniceconnectionstatechange = () => {
      const state = this._pc.iceConnectionState;
      console.log("[WebRTC] ICE Connection State:", state);
      clearTimeout(this.disconnectTimer);
      if (state === 'connected' || state === 'completed') {
        this.iceRestarts = 0;
        this.logSelectedCandidate();
      } else if (state === 'disconnected') {
        // Ex.: celular trocou de Wi-Fi para 4G. Se não voltar sozinho, reinicia o ICE
        this.disconnectTimer = setTimeout(() => this.restartIce(), 4000);
      } else if (state === 'failed') {
        this.restartIce();
      }
    };
  }

  on(event, fn) { this.handlers[event] = fn; }
  emit(event, data) { if (this.handlers[event]) this.handlers[event](data); }

  async signal(data) {
    if (!data) return;
    try {
      if (data.type === 'offer' || data.type === 'answer') {
        const offerCollision = data.type === 'offer' && (this.makingOffer || this._pc.signalingState !== 'stable');
        this.ignoreOffer = !this.polite && offerCollision;
        if (this.ignoreOffer) {
          console.log('[WebRTC] Colisão de ofertas: mantendo a oferta local');
          return;
        }
        if (offerCollision) await this._pc.setLocalDescription({ type: 'rollback' });

        await this._pc.setRemoteDescription(data);
        const queued = this.candidateQueue;
        this.candidateQueue = [];
        for (const candidate of queued) await this.addCandidate(candidate);

        if (data.type === 'offer') {
          await this._pc.setLocalDescription();
          this.emit("signal", this._pc.localDescription);
        }
      } else if ('candidate' in data) {
        if (this._pc.remoteDescription) await this.addCandidate(data.candidate);
        else this.candidateQueue.push(data.candidate);
      }
    } catch (err) {
      console.error('[WebRTC] Erro ao processar sinal:', err);
    }
  }

  async addCandidate(candidate) {
    if (!candidate) return;
    try {
      await this._pc.addIceCandidate(candidate);
    } catch (err) {
      // Candidatos da oferta que ignoramos numa colisão são descartados
      if (!this.ignoreOffer) console.error('[WebRTC] Erro ao adicionar candidato:', err);
    }
  }

  // addTrack/removeTrack disparam onnegotiationneeded, que renegocia sozinho
  addStream(stream) {
    if (!stream) return;
    const sending = this._pc.getSenders().map(s => s.track);
    stream.getTracks().forEach(track => {
      if (!sending.includes(track)) this._pc.addTrack(track, stream);
    });
  }

  removeStream(stream) {
    if (!stream) return;
    const senders = this._pc.getSenders();
    stream.getTracks().forEach(track => {
      const sender = senders.find(s => s.track === track);
      if (sender) this._pc.removeTrack(sender);
    });
  }

  replaceTrack(oldTrack, newTrack) {
    const sender = this._pc.getSenders().find(s => s.track === oldTrack);
    if (sender) return sender.replaceTrack(newTrack);
  }

  // Só quem iniciou a conexão reinicia o ICE, evitando ofertas simultâneas dos dois lados
  restartIce() {
    if (!this.initiator || this.iceRestarts >= 3 || this._pc.signalingState === 'closed') return;
    this.iceRestarts++;
    console.warn(`[WebRTC] Conexão caiu, reiniciando ICE (tentativa ${this.iceRestarts}/3)`);
    this._pc.restartIce();
  }

  // Mostra no console se a mídia está indo direto (host/srflx) ou pelo TURN (relay)
  async logSelectedCandidate() {
    try {
      const stats = await this._pc.getStats();
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
          const local = stats.get(report.localCandidateId);
          const remote = stats.get(report.remoteCandidateId);
          console.log(`[WebRTC] Conectado via local=${local?.candidateType} remoto=${remote?.candidateType}`);
        }
      });
    } catch (e) {}
  }

  destroy() {
    clearTimeout(this.disconnectTimer);
    this.handlers = {};
    this._pc.close();
  }
}
