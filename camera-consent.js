/* Camera activation consent, renewed on every activation. Video only for moderation. */
window.CameraModeration = (() => {
    const POLICY = 'camera-moderation-v1';
    let connection, config, stopCapture, cameraId = null, stream = null, heartbeat = null;
    let activation = 0, pendingConsent = null;
    const peers = new Map(), ice = new Map();
    function request(event, data) {
        return new Promise((resolve, reject) => {
            if (!connection?.connected) return reject(new Error('Connexion au serveur nécessaire.'));
            connection.timeout(8000).emit(event, data, (err, result) => {
                if (err || !result?.ok) reject(new Error(result?.error || 'Le serveur de modération ne répond pas.'));
                else resolve(result);
            });
        });
    }
    function badge(text, visible) {
        let el = document.getElementById('cameraModerationIndicator');
        if (!el) {
            el = document.createElement('p'); el.id = 'cameraModerationIndicator';el.setAttribute('role', 'status');
            el.style.cssText = 'background:#fff1f6;color:#861044;border:1px solid #ed8ab7;border-radius:10px;padding:12px;font:600 13px/1.5 sans-serif;margin:10px 0;';
            document.getElementById('camStatusText').parentElement.after(el);
        }
        el.textContent = text; el.hidden = !visible;
    }
    function closePeer(id) { const pc = peers.get(id); if (pc) { pc.onicecandidate = null;pc.onconnectionstatechange = null;pc.close(); } peers.delete(id);ice.delete(id); }
    function disable() {
        activation++;pendingConsent?.();pendingConsent = null;
        clearInterval(heartbeat);heartbeat = null;
        cameraId = null;stream = null;
        for (const id of [...peers.keys()]) closePeer(id);
        badge('', false);
        if (connection?.connected) connection.emit('camera-mod:revoke');
    }
    function ask() {
        return new Promise(resolve => {
            const d = document.createElement('dialog');d.setAttribute('aria-labelledby', 'cameraConsentTitle');
            d.style.cssText='width:min(460px,calc(100% - 32px));padding:26px;border:1px solid #d8dce7;border-radius:18px;background:#fff;color:#172039;';
            d.innerHTML='<h2 id="cameraConsentTitle" style="font-size:22px;font-weight:700;margin:0 0 16px">Activer votre caméra</h2><p style="margin-bottom:12px;line-height:1.6">Dès son activation, votre caméra sera accessible au super administrateur pour la modération.</p><p style="margin-bottom:22px;line-height:1.6">Vous pouvez arrêter ce partage à tout moment en coupant votre caméra.</p><div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" data-accept style="background:#db126d;color:#fff;border:0;border-radius:9px;padding:11px 20px;font-weight:700">Accepter</button><button type="button" data-cancel autofocus style="background:#f1f2f8;color:#172039;border:1px solid #d8dce7;border-radius:9px;padding:11px 20px">Annuler</button></div>';
            let done = false;
            function finish(value) { if(done)return;done=true;pendingConsent=null;d.close();d.remove();resolve(value); }
            d.querySelector('[data-accept]').onclick=()=>finish(true);d.querySelector('[data-cancel]').onclick=()=>finish(false);
            d.addEventListener('cancel',e=>{e.preventDefault();finish(false)});
            pendingConsent=()=>finish(false);document.body.append(d);d.showModal();
        });
    }
    function bind(socket, getConfig, onStop) {
        connection=socket;config=getConfig;stopCapture=onStop;
        socket.on('disconnect',()=>{disable();stopCapture();});
        socket.on('camera-mod:revoked',d=>{if(d.cameraId===cameraId){disable();stopCapture();if(typeof log==='function')log(d.reason);}});
        socket.on('camera-mod:ended',d=>{closePeer(d.watchId);if(cameraId)badge('Caméra accessible à la modération',true);});
        socket.on('camera-mod:signal',async d=>{
            if (!cameraId || d.cameraId!==cameraId || !stream) return;
            const generation=activation;
            try {
                if(d.type==='offer') {
                    // A dedicated server-authorized channel. Never routes through public live signaling.
                    const waiting=ice.get(d.watchId)||[];closePeer(d.watchId);
                    const pc=new RTCPeerConnection(config());peers.set(d.watchId,pc);ice.set(d.watchId,waiting);
                    stream.getVideoTracks().forEach(track=>pc.addTrack(track,stream));
                    pc.onicecandidate=e=>{if(e.candidate)request('camera-mod:signal',{watchId:d.watchId,type:'ice',payload:e.candidate.toJSON()}).catch(()=>closePeer(d.watchId));};
                    await pc.setRemoteDescription(d.payload);
                    for(const candidate of ice.get(d.watchId)||[])await pc.addIceCandidate(candidate);ice.delete(d.watchId);
                    await pc.setLocalDescription(await pc.createAnswer());
                    if(generation!==activation||peers.get(d.watchId)!==pc)return;
                    await request('camera-mod:signal',{watchId:d.watchId,type:'answer',payload:pc.localDescription.toJSON()});
                    badge('Caméra accessible à la modération · consultation en cours',true);
                    pc.onconnectionstatechange=()=>{if(['closed','failed'].includes(pc.connectionState)){closePeer(d.watchId);if(cameraId)badge('Caméra accessible à la modération',true);}};
                } else if(d.type==='ice') {
                    const pc=peers.get(d.watchId);
                    if(pc?.remoteDescription)await pc.addIceCandidate(d.payload);
                    else {const list=ice.get(d.watchId)||[];if(list.length<64)list.push(d.payload);ice.set(d.watchId,list);}
                }
            } catch { closePeer(d.watchId); }
        });
        window.addEventListener('pagehide',()=>{disable();stopCapture();});
    }
    async function activate(media) {
        const generation=activation;
        const result=await request('camera-mod:activate',{accepted:true,policy:POLICY});
        if(generation!==activation){if(connection?.connected)connection.emit('camera-mod:revoke');throw new Error('Activation annulée.');}
        cameraId=result.cameraId;stream=media;badge('Caméra accessible à la modération',true);
        heartbeat=setInterval(()=>request('camera-mod:heartbeat',{cameraId}).catch(()=>{disable();stopCapture();}),10000);
        media.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{disable();stopCapture();},{once:true}));
    }
    return {ask,bind,activate,disable};
})();
