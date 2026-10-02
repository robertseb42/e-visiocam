window.SuperCameraPanel = (() => {
    let socket, config, panel, list, video, status, pc=null, watchId=null, cameraId=null, epoch=0, pendingICE=[];
    function request(event,data={}) {return new Promise((resolve,reject)=>{
        if(!socket?.connected)return reject(new Error('Serveur déconnecté'));
        socket.timeout(8000).emit(event,data,(err,r)=>err||!r?.ok?reject(new Error(r?.error||'Serveur indisponible')):resolve(r));
    });}
    function stop(notify=true){epoch++;const old=watchId;watchId=null;cameraId=null;pendingICE=[];if(pc){pc.ontrack=null;pc.onicecandidate=null;pc.onconnectionstatechange=null;pc.close();pc=null;}if(video)video.srcObject=null;if(notify&&old)request('camera-mod:leave',{watchId:old}).catch(()=>{});}
    async function refresh(){try{const r=await request('camera-mod:list');panel.hidden=false;list.replaceChildren();if(!r.cameras.length){const p=document.createElement('p');p.textContent='Aucune caméra autorisée actuellement.';list.append(p);}
        for(const cam of r.cameras){const row=document.createElement('div');row.className='super-camera-row';const info=document.createElement('div');const name=document.createElement('strong');name.textContent=cam.username;const detail=document.createElement('small');detail.textContent=cam.isBroadcasting?'En live · accès accepté':'Caméra active · accès accepté';info.append(name,detail);
            const view=document.createElement('button');view.textContent='Voir';view.onclick=()=>watch(cam);
            const cut=document.createElement('button');cut.textContent='Couper la caméra';cut.onclick=async()=>{const reason=prompt('Motif de la coupure :');if(!reason?.trim())return;try{await request('camera-mod:stop',{cameraId:cam.cameraId,reason});if(cameraId===cam.cameraId)stop();await refresh();}catch(e){status.textContent=e.message}};
            row.append(info,view,cut);list.append(row);
        }
    }catch(e){status.textContent=e.message;list.replaceChildren();stop();}}
    async function watch(cam){
        const reason=prompt('Motif de consultation :','Modération');if(!reason?.trim())return;
        stop();const token=epoch;status.textContent='Connexion à '+cam.username+'…';
        try{const r=await request('camera-mod:watch',{cameraId:cam.cameraId,reason});
            if(token!==epoch){request('camera-mod:leave',{watchId:r.watchId}).catch(()=>{});return;}
            watchId=r.watchId;cameraId=cam.cameraId;const activeId=watchId;
            const peer=new RTCPeerConnection(config());pc=peer;peer.addTransceiver('video',{direction:'recvonly'});
            peer.ontrack=e=>{if(pc!==peer)return;video.srcObject=e.streams[0]||new MediaStream([e.track]);video.play().catch(()=>{});status.textContent=cam.username+' · vidéo de modération';};
            peer.onicecandidate=e=>{if(e.candidate)request('camera-mod:signal',{watchId:activeId,type:'ice',payload:e.candidate.toJSON()}).catch(()=>{});};
            peer.onconnectionstatechange=()=>{if(pc===peer&&['failed','closed'].includes(peer.connectionState)){stop();status.textContent='Connexion interrompue. Cliquez sur Voir pour réessayer.';}};
            await peer.setLocalDescription(await peer.createOffer());if(pc!==peer)return;
            await request('camera-mod:signal',{watchId:activeId,type:'offer',payload:peer.localDescription.toJSON()});
        }catch(e){if(token===epoch){stop();status.textContent=e.message;}}
    }
    function bind(s,getConfig){
        if(getCurrentUser()?.role!=='super_admin')return;
        socket=s;config=getConfig;
        panel=document.createElement('section');panel.className='super-camera-panel';
        const title=document.createElement('h2');title.textContent='Caméras activées · Super administrateur';
        const note=document.createElement('p');note.textContent='Caméras partagées avec accord, tous salons confondus. Vidéo uniquement, sans enregistrement. Chaque consultation est journalisée.';
        const refreshButton=document.createElement('button');refreshButton.textContent='Actualiser';refreshButton.onclick=refresh;
        const close=document.createElement('button');close.textContent='Fermer la consultation';close.onclick=()=>{stop();status.textContent='Consultation fermée.';};
        list=document.createElement('div');video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;video.controls=true;
        status=document.createElement('p');status.setAttribute('role','status');status.textContent='Choisissez une caméra.';
        panel.append(title,note,refreshButton,close,list,video,status);
        document.getElementById('tab-surveillance').prepend(panel);
        const style=document.createElement('style');style.textContent='.super-camera-panel{background:#fff;border:1px solid #e1d6df;border-radius:16px;padding:20px;margin-bottom:24px;color:#172039}.super-camera-panel h2{font-size:20px;font-weight:800}.super-camera-panel p{font-size:13px;line-height:1.6;margin:10px 0}.super-camera-panel button{border:1px solid #dfbbce;border-radius:8px;padding:8px 12px;margin:4px;color:#991452;background:#fff1f7;font-size:12px}.super-camera-row{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #eee}.super-camera-row>div{flex:1}.super-camera-row small{display:block;font-size:12px;color:#697085}.super-camera-panel video{width:100%;max-height:420px;background:#15171c;margin-top:12px;border-radius:12px}.super-camera-panel video:not([src]){min-height:160px}@media(max-width:600px){.super-camera-row{flex-wrap:wrap}}';document.head.append(style);
        socket.on('connect',refresh);socket.on('camera-mod:changed',refresh);
        socket.on('disconnect',()=>{stop(false);list.replaceChildren();status.textContent='Serveur déconnecté.';});
        socket.on('camera-mod:ended',d=>{if(d.watchId===watchId){stop(false);status.textContent=d.reason||'Caméra arrêtée.';}});
        socket.on('camera-mod:signal',async d=>{if(d.watchId!==watchId||!pc)return;const peer=pc;try{
            if(d.type==='answer'){await peer.setRemoteDescription(d.payload);for(const candidate of pendingICE)await peer.addIceCandidate(candidate);pendingICE=[];}
            else if(d.type==='ice'){if(peer.remoteDescription)await peer.addIceCandidate(d.payload);else if(pendingICE.length<64)pendingICE.push(d.payload);}
        }catch{if(pc===peer){stop();status.textContent='Connexion vidéo impossible.';}}});
        document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();status.textContent='Consultation fermée en quittant cet onglet.';}});
        window.addEventListener('pagehide',()=>stop());
        if(socket.connected)refresh();
    }
    return {bind};
})();
