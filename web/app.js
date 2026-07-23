/* ==========================================================================
   V I D E O C L Ú   P U T R E F A C T O R   A   T O R S I Ó N
   Lógica MS-DOS Shell / BIOS TUI Engine (Keyboard + REST API)
   ========================================================================== */

// Garantizar que la API siempre apunte al servidor Python en el puerto 5000
const originalFetch = window.fetch;
window.fetch = async function(url, options) {
  if (typeof url === 'string' && url.startsWith('/api/')) {
    url = 'http://127.0.0.1:5000' + url;
  }
  
  try {
    const res = await originalFetch(url, options);
    // Verificar si recibimos HTML (ej. página 404 de Laravel/Laragon en puerto 8000)
    const clone = res.clone();
    const text = await clone.text();
    if (text.trim().startsWith('<!DOCTYPE html>') || text.trim().startsWith('<html')) {
      console.warn('Alerta: Se recibió HTML en lugar de JSON en la ruta:', url);
      // Simular un error de red o response .ok = false para evitar petar la UI con JSON.parse
      return { ok: false, json: async () => { throw new Error('HTML response'); }, text: async () => text };
    }
    return res;
  } catch (e) {
    return { ok: false, json: async () => { throw e; }, text: async () => "" };
  }
};

document.addEventListener('DOMContentLoaded', () => {

  // Elementos DOM MS-DOS
  const dosClock = document.getElementById('dos-clock');
  const dosEvtName = document.getElementById('dos-evt-name');
  const dosEvtLugar = document.getElementById('dos-evt-lugar');
  const dosUsbId = document.getElementById('dos-usb-id');
  const dosUsbObra = document.getElementById('dos-usb-obra');
  const dosUsbStatus = document.getElementById('dos-usb-status');
  const dosGlobalStatus = document.getElementById('dos-global-status');

  const btnF2Alquilar = document.getElementById('btn-f2-alquilar');
  const btnF3Auditar = document.getElementById('btn-f3-auditar');
  const btnF4Devolver = document.getElementById('btn-f4-devolver');
  const btnF5Reparar = document.getElementById('btn-f5-reparar');
  const btnF6Generar = document.getElementById('btn-f6-generar');

  const dosAuditTbody = document.getElementById('dos-audit-tbody');
  let currentAuditData = null;

  // --------------------------------------------------------------------------
  // 1. RELOJ DE SISTEMA MS-DOS
  // --------------------------------------------------------------------------
  function updateClock() {
    const now = new Date();
    dosClock.textContent = now.toTimeString().split(' ')[0];
  }
  setInterval(updateClock, 1000);
  updateClock();

  // --------------------------------------------------------------------------
  // 2. CANVAS RUIDO CRT
  // --------------------------------------------------------------------------
  const staticCanvas = document.getElementById('crt-static-canvas');
  if (staticCanvas) {
    const ctx = staticCanvas.getContext('2d');
    staticCanvas.width = 160;
    staticCanvas.height = 120;
    function drawNoise() {
      const imgData = ctx.createImageData(staticCanvas.width, staticCanvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.floor(Math.random() * 255);
        data[i] = v; data[i+1] = v; data[i+2] = v; data[i+3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      requestAnimationFrame(drawNoise);
    }
    requestAnimationFrame(drawNoise);
  }

  // --------------------------------------------------------------------------
  // 3. CAMBIO DE VISTAS MS-DOS (Menu Items & Tree Items)
  // --------------------------------------------------------------------------
  function showView(viewName) {
    document.querySelectorAll('.dos-menu-item').forEach(m => m.classList.remove('active'));
    document.querySelectorAll('.view-pane').forEach(p => {
      p.style.display = 'none';
      p.classList.remove('active');
    });

    const activeMenuItem = document.querySelector(`.dos-menu-item[data-view="${viewName}"]`);
    if (activeMenuItem) activeMenuItem.classList.add('active');

    const pane = document.getElementById(`pane-${viewName}`);
    if (pane) {
      pane.style.display = 'flex';
      pane.classList.add('active');
    }

    if (viewName === 'socios') loadSocios();
    if (viewName === 'eventos') loadEventos();
    if (viewName === 'catalogo') loadCatalogo();
  }

  document.querySelectorAll('.dos-menu-item').forEach(item => {
    item.addEventListener('click', () => showView(item.dataset.view));
  });

  document.getElementById('tree-catalogo').addEventListener('click', () => showView('catalogo'));
  document.getElementById('tree-socios').addEventListener('click', () => showView('socios'));
  document.getElementById('tree-eventos').addEventListener('click', () => showView('eventos'));
  document.getElementById('tree-root').addEventListener('click', () => showView('auditoria'));

  // --------------------------------------------------------------------------
  // 4. FETCH STATUS & METADATA
  // --------------------------------------------------------------------------
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      if (data.event) {
        dosEvtName.textContent = data.event.nombre_evento;
        dosEvtLugar.textContent = data.event.lugar;
      }

      if (data.session && data.session.active_drive_path) {
        const activeDrive = data.session.active_drive_path;
        const paneTitle = document.getElementById('pane-right-title');
        if (paneTitle) paneTitle.textContent = `${activeDrive}\\*.* (Auditoría Criptográfica SHA-256)`;
        const treeRoot = document.getElementById('tree-root');
        if (treeRoot) treeRoot.innerHTML = `<span class="dos-tree-icon">[+]</span> ${activeDrive}`;
        const genInput = document.getElementById('gen-drive-path');
        if (genInput) genInput.value = activeDrive;
      }

      if (data.usb) {
        dosUsbId.textContent = data.usb.id_usb || 'USB-001';
        dosUsbObra.textContent = data.usb.titulo || 'Viento Limay';

        if (data.prestamo_activo) {
          dosUsbStatus.textContent = `ALQUILADO (${data.prestamo_activo.socio_nombre})`;
          dosUsbStatus.className = "val highlight";
        } else {
          dosUsbStatus.textContent = "DISPONIBLE EN LOCAL";
          dosUsbStatus.className = "val";
        }
      } else {
        dosUsbId.textContent = "--";
        dosUsbObra.textContent = "--";
        dosUsbStatus.textContent = "SIN METADATA";
      }
    } catch (e) {
      dosUsbStatus.textContent = "OFFLINE";
    }
  }

  fetchStatus();

  // --------------------------------------------------------------------------
  // 5. AUDITORÍA CRIPTOGRÁFICA SHA-256
  // --------------------------------------------------------------------------
  async function runAudit() {
    showView('auditoria');
    dosGlobalStatus.textContent = "[ ESCANEANDO HASHES... ]";
    dosGlobalStatus.style.color = "yellow";

    try {
      const res = await fetch('/api/scan');
      const data = await res.json();
      currentAuditData = data;

      dosAuditTbody.innerHTML = '';

      if (data.error && data.report.length === 0) {
        dosGlobalStatus.textContent = "[ SIN METADATA O VACÍO ]";
        dosGlobalStatus.style.color = "yellow";
        dosAuditTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: yellow; padding: 20px;">${data.error}</td></tr>`;
        return;
      }

      if (data.estado_global === 'INTEGRO') {
        dosGlobalStatus.textContent = "[ 100% ÍNTEGRO ]";
        dosGlobalStatus.style.color = "var(--dos-green-bright)";
        btnF5Reparar.style.display = 'none';
      } else {
        dosGlobalStatus.textContent = "[ ANOMALÍAS DETECTADAS ]";
        dosGlobalStatus.style.color = "yellow";
        btnF5Reparar.style.display = 'inline-flex';
      }

      data.report.forEach(item => {
        const tr = document.createElement('tr');
        let tag = '';
        if (item.status === 'OK') tag = '<span class="tag-ok">[ OK ]</span>';
        if (item.status === 'ALTERADO') tag = '<span class="tag-alt">[ ALTERADO ]</span>';
        if (item.status === 'FALTANTE') tag = '<span class="tag-mis">[ FALTANTE ]</span>';
        if (item.status === 'PARASITO') tag = '<span class="tag-unk">[ PARÁSITO ]</span>';

        tr.innerHTML = `<td>${tag}</td><td>${item.path}</td><td>--</td>`;
        dosAuditTbody.appendChild(tr);
      });

    } catch (e) {
      dosGlobalStatus.textContent = "[ ERROR DE AUDITORÍA ]";
    }
  }

  btnF3Auditar.addEventListener('click', runAudit);

  // --------------------------------------------------------------------------
  // 6. DEVOLUCIÓN & REPARACIÓN
  // --------------------------------------------------------------------------
  btnF4Devolver.addEventListener('click', async () => {
    const estado = currentAuditData ? currentAuditData.estado_global : 'INTEGRO';
    try {
      await fetch('/api/devolver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado_integridad: estado })
      });
      fetchStatus();
      alert("Devolución asentada en MS-DOS Shell.");
    } catch (e) {}
  });

  btnF5Reparar.addEventListener('click', async () => {
    if (!currentAuditData) return;
    try {
      await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          altered_files: currentAuditData.altered_files,
          missing_files: currentAuditData.missing_files,
          unknown_files: currentAuditData.unknown_files
        })
      });
      runAudit();
    } catch (e) {}
  });

  // --------------------------------------------------------------------------
  // 7. ALQUILER & MODALES
  // --------------------------------------------------------------------------
  const modalAlquilar = document.getElementById('modal-alquilar');
  const dosModalUsbId = document.getElementById('dos-modal-usb-id');
  const dosModalSocioSelect = document.getElementById('dos-modal-socio-select');
  const btnCancelAlquilar = document.getElementById('btn-cancel-alquilar');
  const btnConfirmAlquilar = document.getElementById('btn-confirm-alquilar');

  btnF2Alquilar.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/socios');
      const socios = await res.json();

      dosModalSocioSelect.innerHTML = '';
      socios.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `[${s.num_socio}] ${s.nombre}`;
        dosModalSocioSelect.appendChild(opt);
      });

      dosModalUsbId.textContent = dosUsbId.textContent;
      modalAlquilar.classList.add('active');
    } catch (e) {}
  });

  btnCancelAlquilar.addEventListener('click', () => modalAlquilar.classList.remove('active'));

  btnConfirmAlquilar.addEventListener('click', async () => {
    const socioId = dosModalSocioSelect.value;
    try {
      await fetch('/api/alquilar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socio_id: socioId })
      });
      modalAlquilar.classList.remove('active');
      fetchStatus();
    } catch (e) {}
  });

  // --------------------------------------------------------------------------
  // 8. GENERADOR USB CON MODAL Y BARRA DE PROGRESO MS-DOS
  // --------------------------------------------------------------------------
  btnF6Generar.addEventListener('click', () => showView('generador'));

  const modalProgressUsb = document.getElementById('modal-progress-usb');
  const progressStatusStep = document.getElementById('progress-status-step');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressDetail = document.getElementById('progress-detail');
  const progressPercent = document.getElementById('progress-percent');
  const progressLog = document.getElementById('progress-log');
  const btnCloseProgress = document.getElementById('btn-close-progress');

  function updateProgress(percent, stepText, logMsg) {
    progressBarFill.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    if (stepText) progressStatusStep.textContent = stepText;
    if (logMsg) {
      const p = document.createElement('div');
      p.textContent = `> ${logMsg}`;
      progressLog.appendChild(p);
      progressLog.scrollTop = progressLog.scrollHeight;
    }
  }

  document.getElementById('btn-do-generate').addEventListener('click', async () => {
    const targetDrive = document.getElementById('gen-drive-path').value;
    const usbId = document.getElementById('gen-usb-id').value || 'USB-001';
    const pelicula = document.getElementById('gen-pelicula') ? document.getElementById('gen-pelicula').value : '';

    if (!targetDrive) {
      alert("Por favor especifique la unidad de destino para grabar el pendrive.");
      return;
    }

    // Mostrar modal de progreso
    progressLog.innerHTML = '';
    btnCloseProgress.style.display = 'none';
    modalProgressUsb.classList.add('active');
    progressDetail.textContent = `Unidad: ${targetDrive} | ID: ${usbId}`;

    updateProgress(5, '[1/5] Copiando interfaz base plantilla_usb...', 'Iniciando formateo y clonado de interfaz CRT...');

    let currentPercent = 5;
    const interval = setInterval(() => {
      if (currentPercent < 85) {
        currentPercent += Math.floor(Math.random() * 8) + 5;
        if (currentPercent > 85) currentPercent = 85;

        if (currentPercent < 30) {
          updateProgress(currentPercent, '[2/5] Transfiriendo video principal (.mp4)...', `Copiando pista de video a ${targetDrive}...`);
        } else if (currentPercent < 60) {
          updateProgress(currentPercent, '[3/5] Transfiriendo subtítulos (.srt) y portada (.png)...', 'Copiando archivo físico de subtítulos e imagen de portada...');
        } else if (currentPercent < 85) {
          updateProgress(currentPercent, '[4/5] Generando metadatos y subtitulos.js...', 'Inyectando metadatos de ficha técnica y subtitulos.js offline...');
        }
      }
    }, 400);

    try {
      const res = await fetch('/api/generar-usb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_drive: targetDrive, id_usb: usbId, pelicula: pelicula })
      });
      const data = await res.json();
      clearInterval(interval);

      if (data.error) {
        updateProgress(0, '[ERROR] Falló la grabación', `ERROR: ${data.error}`);
        alert("ERROR: " + data.error);
        modalProgressUsb.classList.remove('active');
      } else {
        updateProgress(100, '[5/5] ¡Grabación finalizada 100% ÍNTEGRA!', `🎉 Pendrive ${data.id_usb} de '${data.pelicula || pelicula}' firmado con SHA-256.`);
        btnCloseProgress.style.display = 'inline-block';
      }
    } catch (e) {
      clearInterval(interval);
      updateProgress(0, '[ERROR] Error de conexión', 'No se pudo comunicar con la Estación de Control.');
      alert("Error generando el pendrive.");
      modalProgressUsb.classList.remove('active');
    }
  });

  btnCloseProgress.addEventListener('click', () => {
    modalProgressUsb.classList.remove('active');
    showView('auditoria');
    fetchStatus();
  });

  // --------------------------------------------------------------------------
  // 9. SOCIOS & EVENTOS CÁRGAS
  // --------------------------------------------------------------------------
  const dosSociosTbody = document.getElementById('dos-socios-tbody');
  async function loadSocios() {
    try {
      const res = await fetch('/api/socios');
      const socios = await res.json();
      dosSociosTbody.innerHTML = '';
      socios.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${s.num_socio}</td><td>${s.nombre} ${s.apellido || ''}</td><td>${s.apodo || '--'}</td><td>${s.foto ? '[ FOTO ]' : '--'}</td><td>${s.estado}</td>`;
      dosSociosTbody.appendChild(tr);
      });
    } catch (e) {}
  }

  const dosEventosTbody = document.getElementById('dos-eventos-tbody');
  async function loadEventos() {
    try {
      const res = await fetch('/api/eventos');
      const eventos = await res.json();
      dosEventosTbody.innerHTML = '';
      eventos.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>#${e.id}</td>
          <td>${e.nombre_evento}</td>
          <td>${e.lugar}</td>
          <td>${e.fecha} ${e.hora}</td>
          <td><button class="dos-btn btn-sel-evt" data-id="${e.id}" style="padding:1px 4px;">[ Elegir ]</button></td>
        `;
        dosEventosTbody.appendChild(tr);
      });

      document.querySelectorAll('.btn-sel-evt').forEach(b => {
        b.addEventListener('click', async () => {
          await fetch('/api/select-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: b.dataset.id })
          });
          fetchStatus();
          loadEventos();
        });
      });

    } catch (e) {}
  }

  const dosCatalogoTbody = document.getElementById('dos-catalogo-tbody');
  const genPeliculaSelect = document.getElementById('gen-pelicula');

  async function loadCatalogo() {
    try {
      const res = await fetch('/api/peliculas');
      const pelis = await res.json();
      dosCatalogoTbody.innerHTML = '';
      if (genPeliculaSelect) genPeliculaSelect.innerHTML = '';

      pelis.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${p.codigo_pelicula}</td><td>${p.titulo}</td><td>${p.director}</td><td>${p.anio}</td><td>${p.genero}</td>`;
        dosCatalogoTbody.appendChild(tr);

        if (genPeliculaSelect) {
          const opt = document.createElement('option');
          opt.value = p.codigo_pelicula || p.folder_name || p.id;
          opt.textContent = `${p.titulo} (${p.anio}) -- ${p.director}`;
          genPeliculaSelect.appendChild(opt);
        }
      });
    } catch (e) {}
  }

  // Modales Socio, Evento y Película
  const modalSocio = document.getElementById('modal-socio');
  
  // -- Lógica de Cámara Retro (Socio) --
  const webcamFeed = document.getElementById('webcam-feed');
  const webcamCanvas = document.getElementById('webcam-canvas');
  const ctxCam = webcamCanvas ? webcamCanvas.getContext('2d') : null;
  const btnTomarFoto = document.getElementById('btn-tomar-foto');
  const btnBorrarFoto = document.getElementById('btn-borrar-foto');
  const fotoStatus = document.getElementById('foto-status');
  
  let cameraStream = null;
  let renderInterval = null;
  let photoData = "";
  
  const camBrillo = document.getElementById('cam-brillo');
  const camContraste = document.getElementById('cam-contraste');
  const camFiltro = document.getElementById('cam-filtro');
  const camDithering = document.getElementById('cam-dithering');

  const palettes = {
    ega: [
      [0,0,0], [0,0,170], [0,170,0], [0,170,170], [170,0,0], [170,0,170], [170,85,0], [170,170,170],
      [85,85,85], [85,85,255], [85,255,85], [85,255,255], [255,85,85], [255,85,255], [255,255,85], [255,255,255]
    ],
    cga1: [ [0,0,0], [85,255,255], [255,85,255], [255,255,255] ],
    cga0: [ [0,0,0], [85,255,85], [255,85,85], [255,255,85] ],
    gb: [ [15,56,15], [48,98,48], [139,172,15], [155,188,15] ],
    bw: [ [0,0,0], [0,255,51] ]
  };

  const bayer = [
    [ 0,  8,  2, 10],
    [12,  4, 14,  6],
    [ 3, 11,  1,  9],
    [15,  7, 13,  5]
  ];

  function getClosestColor(r, g, b, pal) {
    let minDist = Infinity;
    let closest = pal[0];
    for (let i = 0; i < pal.length; i++) {
      let p = pal[i];
      let d = (r - p[0])**2 + (g - p[1])**2 + (b - p[2])**2;
      if (d < minDist) {
        minDist = d;
        closest = p;
      }
    }
    return closest;
  }

  let scanIndex = 0;
  const pixelsPerTick = 853; // ~24 FPS para procesar 19200 píxeles, tarda cerca de 1 seg.
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = 160;
  offscreenCanvas.height = 120;
  const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

  function processRetroFrame() {
    if (!webcamFeed || !ctxCam || webcamFeed.paused || webcamFeed.ended) return;
    
    if (scanIndex === 0) {
      offscreenCtx.drawImage(webcamFeed, 0, 0, 160, 120);
    }
    
    let brightness = camBrillo ? parseInt(camBrillo.value) : 0;
    let contrast = camContraste ? parseInt(camContraste.value) : 20;
    let useDither = camDithering ? camDithering.checked : true;
    let palKey = camFiltro ? camFiltro.value : 'ega';
    let currentPal = palettes[palKey] || palettes.ega;
    let factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    let spread = (palKey === 'bw') ? 128 : 64; 
    
    let inData = offscreenCtx.getImageData(0, 0, 160, 120).data;
    let currentDisplay = ctxCam.getImageData(0, 0, 160, 120);
    let outData = currentDisplay.data;
    
    let endIdx = Math.min(160 * 120, scanIndex + pixelsPerTick);
    
    for (let p = scanIndex; p < endIdx; p++) {
      let x = p % 160;
      let y = Math.floor(p / 160);
      let i = p * 4;
      
      let r = inData[i], g = inData[i+1], b = inData[i+2];
      
      r += brightness; g += brightness; b += brightness;
      r = factor * (r - 128) + 128;
      g = factor * (g - 128) + 128;
      b = factor * (b - 128) + 128;
      
      if (useDither) {
        let threshold = (bayer[y % 4][x % 4] / 16) - 0.5;
        r += threshold * spread;
        g += threshold * spread;
        b += threshold * spread;
      }

      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));

      let c = getClosestColor(r, g, b, currentPal);
      
      outData[i] = c[0];
      outData[i+1] = c[1];
      outData[i+2] = c[2];
      outData[i+3] = 255; // Alpha
    }

    ctxCam.putImageData(currentDisplay, 0, 0);

    scanIndex = endIdx;
    if (scanIndex >= 160 * 120) {
      scanIndex = 0;
    }
  }

  const cameraSelect = document.getElementById('camera-select');

  async function populateCameraSelect() {
    if (!cameraSelect) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      const currentValue = cameraSelect.value;
      cameraSelect.innerHTML = '';
      videoDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Cámara ${index + 1}`;
        if (device.deviceId === currentValue) option.selected = true;
        cameraSelect.appendChild(option);
      });
    } catch (e) {}
  }

  async function startCamera(deviceId = null) {
    photoData = "";
    if (btnTomarFoto) btnTomarFoto.style.display = 'inline-block';
    if (btnBorrarFoto) btnBorrarFoto.style.display = 'none';
    
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
    }

    const constraints = {
      audio: false,
      video: deviceId ? { deviceId: { exact: deviceId } } : true
    };
    
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (webcamFeed) {
        webcamFeed.srcObject = cameraStream;
        webcamFeed.play();
      }
      if (fotoStatus) {
        fotoStatus.textContent = "* Procesando Cinta (1 FPS)";
        fotoStatus.style.color = "var(--dos-green-bright)";
      }
      if (renderInterval) clearInterval(renderInterval);
      scanIndex = 0;
      renderInterval = setInterval(processRetroFrame, 30); // Actualización de barrido
      
      // Llenar select si está vacío, después de tener permisos
      if (cameraSelect && cameraSelect.options.length === 0) {
        await populateCameraSelect();
      }
    } catch (err) {
      if (fotoStatus) {
        fotoStatus.textContent = "* Error al iniciar cámara";
        fotoStatus.style.color = "red";
      }
    }
  }

  if (cameraSelect) {
    cameraSelect.addEventListener('change', () => {
      startCamera(cameraSelect.value);
    });
  }

  function stopCamera() {
    if (renderInterval) clearInterval(renderInterval);
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
    }
    if (webcamFeed) webcamFeed.srcObject = null;
    if (fotoStatus) {
      fotoStatus.textContent = "* Cámara Desactivada";
      fotoStatus.style.color = "yellow";
    }
  }

  if (btnTomarFoto) {
    btnTomarFoto.addEventListener('click', () => {
      if (!cameraStream) return;
      clearInterval(renderInterval); 
      if (webcamCanvas) photoData = webcamCanvas.toDataURL('image/png');
      if (fotoStatus) {
        fotoStatus.textContent = "* Foto Capturada";
        fotoStatus.style.color = "var(--dos-green-bright)";
      }
      btnTomarFoto.style.display = 'none';
      btnBorrarFoto.style.display = 'inline-block';
    });
  }

  if (btnBorrarFoto) {
    btnBorrarFoto.addEventListener('click', () => {
      photoData = "";
      if (fotoStatus) fotoStatus.textContent = "* Cámara Activa (8 FPS)";
      btnBorrarFoto.style.display = 'none';
      btnTomarFoto.style.display = 'inline-block';
      if (renderInterval) clearInterval(renderInterval);
      renderInterval = setInterval(processRetroFrame, 125);
    });
  }

  document.getElementById('btn-dos-add-socio').addEventListener('click', () => {
    modalSocio.classList.add('active');
    startCamera();
  });
  
  document.getElementById('btn-cancel-socio').addEventListener('click', () => {
    modalSocio.classList.remove('active');
    stopCamera();
  });

  document.getElementById('btn-confirm-socio').addEventListener('click', async () => {
    const nombre = document.getElementById('inp-socio-nombre').value;
    const apellido = document.getElementById('inp-socio-apellido').value;
    const apodo = document.getElementById('inp-socio-apodo').value;
    const direccion = document.getElementById('inp-socio-direccion').value;
    const redSocialText = document.getElementById('inp-socio-red-social').value;
    
    const rsBoxes = document.querySelectorAll('input[name="rs-tipo"]:checked');
    let rsTipos = Array.from(rsBoxes).map(cb => cb.value).join(', ');
    let red_social = rsTipos ? `[${rsTipos}] ${redSocialText}` : redSocialText;

    if (nombre) {
      await fetch('/api/add-socio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, apellido, apodo, direccion, red_social, foto: photoData })
      });
      modalSocio.classList.remove('active');
      stopCamera();
      loadSocios();
      
      // Limpiar campos
      document.getElementById('inp-socio-nombre').value = '';
      document.getElementById('inp-socio-apellido').value = '';
      document.getElementById('inp-socio-apodo').value = '';
      document.getElementById('inp-socio-direccion').value = '';
      document.getElementById('inp-socio-red-social').value = '';
      rsBoxes.forEach(cb => cb.checked = false);
    }
  });

  const modalEvento = document.getElementById('modal-evento');
  document.getElementById('btn-dos-add-evento').addEventListener('click', () => modalEvento.classList.add('active'));
  document.getElementById('btn-cancel-evento').addEventListener('click', () => modalEvento.classList.remove('active'));

  document.getElementById('btn-confirm-evento').addEventListener('click', async () => {
    const nombre = document.getElementById('inp-evt-nombre').value;
    const lugar = document.getElementById('inp-evt-lugar').value;
    if (nombre) {
      await fetch('/api/add-evento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_evento: nombre, lugar })
      });
      modalEvento.classList.remove('active');
      fetchStatus();
      loadEventos();
    }
  });

  const modalPelicula = document.getElementById('modal-pelicula');
  document.getElementById('btn-dos-add-pelicula').addEventListener('click', () => modalPelicula.classList.add('active'));
  document.getElementById('btn-cancel-pelicula').addEventListener('click', () => modalPelicula.classList.remove('active'));

  document.getElementById('btn-confirm-pelicula').addEventListener('click', async () => {
    const titulo = document.getElementById('inp-peli-titulo').value.trim();
    const director = document.getElementById('inp-peli-director').value.trim();
    const anio = document.getElementById('inp-peli-anio').value.trim();
    const genero = document.getElementById('inp-peli-genero').value.trim();
    const duracion = document.getElementById('inp-peli-duracion').value.trim();
    const videoPath = document.getElementById('inp-peli-video-path').value.trim();
    const srtPath = document.getElementById('inp-peli-srt-path').value.trim();
    const coverPath = document.getElementById('inp-peli-cover-path').value.trim();

    if (!titulo || !videoPath) {
      alert("Por favor ingrese al menos el Título y la Ruta al Archivo de Video.");
      return;
    }

    try {
      const res = await fetch('/api/add-pelicula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo, director, anio, genero, duracion,
          video_path: videoPath,
          srt_path: srtPath,
          cover_path: coverPath
        })
      });
      const data = await res.json();
      if (data.error) {
        alert("ERROR: " + data.error);
      } else {
        alert(`🎉 Obra '${data.titulo}' registrada con éxito. Código: ${data.codigo_pelicula}`);
        modalPelicula.classList.remove('active');
        loadCatalogo();
      }
    } catch (e) {
      alert("Error enviando datos al servidor.");
    }
  });

  // --------------------------------------------------------------------------
  // 10. BOTÓN Y LÓGICA DE APAGADO/ENCENDIDO DE EFECTOS CRT (F9)
  // --------------------------------------------------------------------------
  const btnToggleCrtTop = document.getElementById('btn-toggle-crt-top');
  const btnF9Crt = document.getElementById('btn-f9-crt');
  let crtEnabled = localStorage.getItem('pat_crt_effect') !== 'off';

  function applyCrtState() {
    if (crtEnabled) {
      document.body.classList.remove('crt-disabled');
      if (btnToggleCrtTop) btnToggleCrtTop.textContent = '[ CRT FX: ON ]';
      if (btnF9Crt) btnF9Crt.innerHTML = '<span class="key">[ F9 ]</span> CRT FX: ON';
      localStorage.setItem('pat_crt_effect', 'on');
    } else {
      document.body.classList.add('crt-disabled');
      if (btnToggleCrtTop) btnToggleCrtTop.textContent = '[ CRT FX: OFF ]';
      if (btnF9Crt) btnF9Crt.innerHTML = '<span class="key">[ F9 ]</span> CRT FX: OFF';
      localStorage.setItem('pat_crt_effect', 'off');
    }
  }

  function toggleCrt() {
    crtEnabled = !crtEnabled;
    applyCrtState();
  }

  if (btnToggleCrtTop) btnToggleCrtTop.addEventListener('click', toggleCrt);
  if (btnF9Crt) btnF9Crt.addEventListener('click', toggleCrt);
  applyCrtState();

  // --------------------------------------------------------------------------
  // 11. ATAJOS DE TECLADO RETRO & SELECCIÓN DINÁMICA DE UNIDADES
  // --------------------------------------------------------------------------
  async function fetchDrives() {
    try {
      const res = await fetch('/api/drives');
      if (!res.ok) {
        const bar = document.getElementById('dos-drives-bar');
        if (bar) {
          bar.innerHTML = '<span style="color: yellow; font-weight: bold;">[ ⚠️ REINICIE SERVER.PY EN LA TERMINAL PARA DETECTAR UNIDADES ]</span>';
        }
        return;
      }
      const data = await res.json();
      const list = data.drives_info || (data.drives ? data.drives.map(d => ({ path: d, letter: d.slice(0, 2), label: d, is_usb: false })) : []);
      renderDrivesBar(list, data.active_drive_path);
      updateAuditSelect(list, data.active_drive_path);
    } catch (e) {
      console.error("Error al cargar unidades:", e);
    }
  }

  function renderDrivesBar(drivesList, activeDrive) {
    const bar = document.getElementById('dos-drives-bar');
    if (!bar) return;
    bar.innerHTML = '<span>Unidad Activa:</span>';

    drivesList.forEach(item => {
      const d = typeof item === 'string' ? item : item.path;
      const btn = document.createElement('button');
      btn.className = 'dos-drive-btn' + (d === activeDrive ? ' active' : '');
      
      let label = d;
      if (typeof item === 'object') {
        const icon = (item.is_usb || item.type === 2) ? '[💾 USB] ' : '[🖴 HD] ';
        if (item.path.includes('Peli-Usb') || item.path.includes('PELI-USB')) {
          label = `[C:\\PELI-USB Master]`;
        } else if (item.label && item.label !== `Disco Local (${item.letter})` && !item.label.includes('Disco Local')) {
          label = `${icon}[${item.letter} ${item.label}]`;
        } else {
          label = `${icon}[${item.letter}]`;
        }
        if (item.is_usb || item.type === 2) {
          btn.style.color = "var(--dos-green-bright)";
          btn.style.borderColor = "var(--dos-green-bright)";
        }
      } else {
        if (d.length <= 3 && d.endsWith('\\')) {
          label = `[${d.slice(0, 2)}]`;
        } else if (d.includes('Peli-Usb') || d.includes('PELI-USB')) {
          label = `[C:\\PELI-USB]`;
        } else {
          label = `[${d}]`;
        }
      }
      btn.textContent = label;
      btn.title = typeof item === 'object' ? `${item.path} (${item.type_str}: ${item.label})` : d;
      btn.addEventListener('click', () => selectDrive(d));
      bar.appendChild(btn);
    });

    const customBtn = document.createElement('button');
    customBtn.className = 'dos-drive-btn';
    customBtn.style.color = 'yellow';
    customBtn.textContent = '[+ Otra...]';
    customBtn.addEventListener('click', () => {
      const newDrive = prompt("Ingrese letra de unidad o ruta de carpeta a auditar (Ej: E:\\ o D:\\):", activeDrive);
      if (newDrive && newDrive.trim()) {
        selectDrive(newDrive.trim());
      }
    });
    bar.appendChild(customBtn);
  }

  function updateAuditSelect(drivesList, activeDrive) {
    const select = document.getElementById('audit-drive-select');
    if (!select) return;
    select.innerHTML = '';
    drivesList.forEach(item => {
      const d = typeof item === 'string' ? item : item.path;
      const opt = document.createElement('option');
      opt.value = d;
      
      let labelText = d;
      if (typeof item === 'object') {
        if (item.path.includes('Peli-Usb') || item.path.includes('PELI-USB')) {
          labelText = `[MASTER] ${item.path} (${item.label})`;
        } else {
          const typeTag = (item.is_usb || item.type === 2) ? '[💾 USB REMOVIBLE]' : '[🖴 DISCO LOCAL]';
          labelText = `${typeTag} ${item.letter} -> ${item.label || 'Sin Etiqueta'}`;
        }
      } else {
        if (d.includes('Peli-Usb') || d.includes('PELI-USB')) {
          labelText = `${d} (Local Master)`;
        } else if (d.length <= 3) {
          labelText = `${d} (Unidad de Disco/USB)`;
        }
      }
      opt.textContent = labelText;
      if (d === activeDrive) opt.selected = true;
      select.appendChild(opt);
    });
  }

  async function selectDrive(drivePath) {
    try {
      const res = await fetch('/api/select-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drive: drivePath })
      });
      const data = await res.json();
      if (res.ok && data.status === 'OK') {
        await fetchDrives();
        await fetchStatus();
        const genInput = document.getElementById('gen-drive-path');
        if (genInput) genInput.value = data.active_drive_path || drivePath;
        if (document.getElementById('pane-auditoria') && document.getElementById('pane-auditoria').classList.contains('active')) {
          runAudit();
        }
      } else {
        alert("No se pudo seleccionar la unidad: " + (data.error || "Ruta no accesible"));
      }
    } catch (e) {
      alert("Error de conexión al cambiar la unidad.");
    }
  }

  const auditSelect = document.getElementById('audit-drive-select');
  if (auditSelect) {
    auditSelect.addEventListener('change', (e) => selectDrive(e.target.value));
  }
  const btnRefreshDrives = document.getElementById('btn-audit-refresh-drives');
  if (btnRefreshDrives) {
    btnRefreshDrives.addEventListener('click', fetchDrives);
  }
  const btnCustomDrive = document.getElementById('btn-audit-custom-drive');
  if (btnCustomDrive) {
    btnCustomDrive.addEventListener('click', () => {
      const current = auditSelect ? auditSelect.value : '';
      const newDrive = prompt("Ingrese la ruta completa o letra de unidad a auditar (Ej: E:\\):", current);
      if (newDrive && newDrive.trim()) {
        selectDrive(newDrive.trim());
      }
    });
  }

  fetchDrives();

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F2') { e.preventDefault(); btnF2Alquilar.click(); }
    if (e.key === 'F3') { e.preventDefault(); runAudit(); }
    if (e.key === 'F4') { e.preventDefault(); btnF4Devolver.click(); }
    if (e.key === 'F5') { e.preventDefault(); showView('generador'); }
    if (e.key === 'F6') { e.preventDefault(); showView('socios'); }
    if (e.key === 'F8') { e.preventDefault(); fetchDrives(); }
    if (e.key === 'F9') { e.preventDefault(); toggleCrt(); }
  });

});
