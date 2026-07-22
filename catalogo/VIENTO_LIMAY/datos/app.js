/* ==========================================================================
   JaJo EkiZ VJ — LÓGICA DE CONTROL CRT TV & REPRODUCTOR (CLIENTE)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const metadata = window.VideotecaMetadata;
  if (!metadata) {
    console.error("No se encontraron los metadatos. Verifica que datos/metadata.js esté cargado.");
    return;
  }

  // --------------------------------------------------------------------------
  // 1. INYECCIÓN DE METADATOS EN EL DOM (PANTALLA TV & TELETEXTO)
  // --------------------------------------------------------------------------
  document.title = `Videoteca Regional — ${metadata.titulo} [CRT TV]`;
  
  // Portada y Sticker en CH 1
  document.getElementById('sticker-title').textContent = metadata.titulo;
  document.getElementById('sticker-director').textContent = `DIR: ${metadata.director.toUpperCase()}`;
  document.getElementById('sticker-duration').textContent = `${metadata.duracion.toUpperCase()}`;

  // Ficha técnica en CH 3 (Teletexto)
  document.getElementById('info-director').textContent = metadata.director.toUpperCase();
  document.getElementById('info-genre').textContent = metadata.genero.toUpperCase();
  document.getElementById('info-duration').textContent = metadata.duracion.toUpperCase();
  document.getElementById('info-region').textContent = metadata.region.toUpperCase();
  document.getElementById('film-synopsis').textContent = metadata.sinopsis;


  // --------------------------------------------------------------------------
  // 2. SISTEMA DE ENCENDIDO (POWER), RUIDO CANALES Y CRT DINÁMICO
  // --------------------------------------------------------------------------
  let isPowerOn = true;
  let currentChannel = 1;

  const tvScreen = document.getElementById('tv-screen');
  const carouselTrack = document.getElementById('carousel-track');
  const terminalStatus = document.getElementById('terminal-status');
  const powerLed = document.getElementById('power-led');
  const panelPowerBtn = document.getElementById('panel-power-btn');
  
  // Canvas de ruido estático
  const staticCanvas = document.getElementById('crt-static-canvas');
  const staticCtx = staticCanvas.getContext('2d');
  
  // Resolución baja para que se vea pixelado retro y rinda bien
  staticCanvas.width = 160;
  staticCanvas.height = 120;
  
  // Función para dibujar ruido estático constante
  function drawNoise() {
    if (!isPowerOn) {
      requestAnimationFrame(drawNoise);
      return;
    }
    
    const imgData = staticCtx.createImageData(staticCanvas.width, staticCanvas.height);
    const data = imgData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const val = Math.floor(Math.random() * 255);
      data[i] = val;
      data[i+1] = val;
      data[i+2] = val;
      data[i+3] = 255;
    }
    staticCtx.putImageData(imgData, 0, 0);
    requestAnimationFrame(drawNoise);
  }
  
  // Iniciar loop de ruido
  requestAnimationFrame(drawNoise);

  // Nombres de canales para la consola
  const channelNames = {
    1: "PORTADA",
    2: "REPRODUCTOR CINTA [PLAY]",
    3: "FICHA TÉCNICA (TELETEXTO)"
  };

  // Función para cambiar de canal con transición de estática
  function sintonizarCanal(channelNum) {
    if (!isPowerOn) return; // Bloquear si está apagada la TV

    const nextChannel = parseInt(channelNum);
    let targetChannel = nextChannel;
    if (targetChannel < 1) targetChannel = 3;
    if (targetChannel > 3) targetChannel = 1;

    // 1. Activar interferencia y vibración de pantalla
    staticCanvas.style.opacity = '0.75';
    tvScreen.classList.add('shake');
    terminalStatus.textContent = `[SISTEMA] BUSCANDO SEÑAL CH 0${targetChannel}...`;

    // Pausar reproducción de video si salimos de CH 2
    if (currentChannel === 2 && targetChannel !== 2) {
      pausarVideo();
    }

    // 2. Esperar 150ms (simula sintonizador mecánico analógico)
    setTimeout(() => {
      currentChannel = targetChannel;

      // Desplazar el carrusel
      const shift = (currentChannel - 1) * 33.333;
      carouselTrack.style.transform = `translateX(-${shift}%)`;

      // Actualizar botones de la consola
      document.querySelectorAll('.ch-select-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      const activeBtn = document.getElementById(`btn-ch${currentChannel}`);
      if (activeBtn) activeBtn.classList.add('active');

      // Actualizar consola de estado
      terminalStatus.textContent = `[SISTEMA] SINTONIZADO CANAL 0${currentChannel} // ${channelNames[currentChannel]}`;

      // 3. Quitar vibración y volver al ruido sutil de fondo
      setTimeout(() => {
        tvScreen.classList.remove('shake');
        staticCanvas.style.opacity = '0.03';
      }, 100);

    }, 150);
  }

  // Función para encender / apagar TV con efectos analógicos
  function togglePower() {
    isPowerOn = !isPowerOn;

    if (isPowerOn) {
      // Encender
      tvScreen.classList.remove('crt-off');
      tvScreen.classList.add('crt-on');
      powerLed.classList.add('power-on');
      panelPowerBtn.classList.add('active');
      
      // Warm-up analógico
      staticCanvas.style.opacity = '0.9';
      tvScreen.classList.add('shake');
      terminalStatus.textContent = `[SISTEMA] CALENTANDO TUBO CRT...`;
      
      setTimeout(() => {
        tvScreen.classList.remove('shake');
        staticCanvas.style.opacity = '0.03';
        sintonizarCanal(currentChannel);
      }, 450);

    } else {
      // Apagar
      pausarVideo();
      tvScreen.classList.remove('crt-on');
      tvScreen.classList.add('crt-off');
      powerLed.classList.remove('power-on');
      panelPowerBtn.classList.remove('active');
      
      terminalStatus.textContent = `[SISTEMA] ENERGÍA OFF // MODO STANDBY`;
    }
  }

  // Listeners de Energía (Hotspot físico en la TV y botón en panel)
  document.getElementById('hotspot-power').addEventListener('click', togglePower);
  panelPowerBtn.addEventListener('click', togglePower);

  // Listeners de Canales (Hotspots físicos CH+ y CH-)
  document.getElementById('hotspot-ch-up').addEventListener('click', () => {
    sintonizarCanal(currentChannel + 1);
  });
  document.getElementById('hotspot-ch-down').addEventListener('click', () => {
    sintonizarCanal(currentChannel - 1);
  });

  // Listeners de Canales (Botonera de consola inferior)
  document.querySelectorAll('.ch-select-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sintonizarCanal(e.target.dataset.channel);
    });
  });

  // Simulación de encendido inicial (Warm-up al cargar la página)
  tvScreen.classList.remove('crt-off');
  tvScreen.classList.add('crt-on');
  powerLed.classList.add('power-on');
  panelPowerBtn.classList.add('active');
  
  staticCanvas.style.opacity = '0.95';
  tvScreen.classList.add('shake');
  terminalStatus.textContent = `[SISTEMA] CALENTANDO TUBO CRT...`;
  
  setTimeout(() => {
    tvScreen.classList.remove('shake');
    staticCanvas.style.opacity = '0.03';
    sintonizarCanal(1);
  }, 600);


  // ==========================================================================
  // 3. REPRODUCTOR DE VIDEO OFF-LINE CON INTEGRACIÓN SRT
  // ==========================================================================
  const mainVideo = document.getElementById('main-video');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const playPauseIcon = document.getElementById('play-pause-icon');
  const progressSlider = document.getElementById('progress-slider');
  const currentTimeLabel = document.getElementById('current-time');
  const totalTimeLabel = document.getElementById('total-time');
  const btnMute = document.getElementById('btn-mute');
  const volumeIcon = document.getElementById('volume-icon');
  const panelVolume = document.getElementById('panel-volume');
  const subtitlesOverlay = document.getElementById('subtitles-overlay');
  const subtitlesText = document.getElementById('subtitles-text');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const embedPlayerContainer = document.querySelector('.embed-player-container');
  const btnSettings = document.getElementById('btn-settings');
  const settingsMenu = document.getElementById('subtitles-settings-menu');

  let parsedSubtitles = [];

  // Parseador de SRT
  function parseSRT(data) {
    const subs = [];
    const normalized = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split('\n\n');
    
    for (let block of blocks) {
      block = block.trim();
      if (!block) continue;
      
      const lines = block.split('\n');
      if (lines.length < 2) continue;
      
      let timeLineIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) {
          timeLineIdx = i;
          break;
        }
      }
      
      const timeLine = lines[timeLineIdx];
      const textLines = lines.slice(timeLineIdx + 1);
      const text = textLines.join('\n').trim();
      
      const match = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      if (match) {
        const start = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 1000;
        const end = parseInt(match[5]) * 3600 + parseInt(match[6]) * 60 + parseInt(match[7]) + parseInt(match[8]) / 1000;
        subs.push({ start, end, text });
      }
    }
    return subs;
  }

  // Cargar subtítulos
  async function loadSubtitles() {
    try {
      const response = await fetch(metadata.archivo_subtitulos);
      if (!response.ok) throw new Error();
      const text = await response.text();
      parsedSubtitles = parseSRT(text);
      console.log("Subtítulos locales SRT cargados dinámicamente.");
    } catch (e) {
      console.log("CORS activado o archivo inaccesible. Cargando subtítulos embebidos.");
      if (metadata.subtitulos_raw) {
        parsedSubtitles = parseSRT(metadata.subtitulos_raw);
      }
    }
  }

  // Cargar subtítulos inmediatamente al inicio
  loadSubtitles();

  // Pausar y reproducir funciones
  function reproducirVideo() {
    if (!isPowerOn) return;
    mainVideo.play().then(() => {
      playPauseIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'; // Icono Pausa
      terminalStatus.textContent = `[SISTEMA] REPRODUCIENDO CINTA // AUDIO: ${Math.round(mainVideo.volume * 100)}%`;
    }).catch(err => {
      console.log("Error al iniciar reproducción. Interacción requerida.");
    });
  }

  function pausarVideo() {
    mainVideo.pause();
    playPauseIcon.innerHTML = '<path d="M8 5v14l11-7z"/>'; // Icono Play
    if (isPowerOn) {
      terminalStatus.textContent = `[SISTEMA] REPRODUCCIÓN PAUSADA`;
    }
  }

  function togglePlayPause() {
    if (mainVideo.paused || mainVideo.ended) {
      reproducirVideo();
    } else {
      pausarVideo();
    }
  }

  // OSD Play/Pausa
  btnPlayPause.addEventListener('click', togglePlayPause);
  mainVideo.addEventListener('click', togglePlayPause);

  // Formato de tiempo MM:SS
  function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // Sincronizar subtítulos
  function updateSubtitles() {
    const time = mainVideo.currentTime;
    const activeSub = parsedSubtitles.find(s => time >= s.start && time <= s.end);
    
    if (activeSub) {
      subtitlesText.textContent = activeSub.text;
      subtitlesOverlay.style.display = 'block';
    } else {
      subtitlesText.textContent = '';
      subtitlesOverlay.style.display = 'none';
    }
  }

  // Evento de reproducción
  mainVideo.addEventListener('timeupdate', () => {
    if (!isNaN(mainVideo.duration)) {
      const percentage = (mainVideo.currentTime / mainVideo.duration) * 100;
      progressSlider.value = percentage;
      currentTimeLabel.textContent = formatTime(mainVideo.currentTime);
      totalTimeLabel.textContent = formatTime(mainVideo.duration);
    }
    updateSubtitles();
  });

  mainVideo.addEventListener('loadedmetadata', () => {
    totalTimeLabel.textContent = formatTime(mainVideo.duration);
  });

  // Scrubbing
  progressSlider.addEventListener('input', () => {
    if (mainVideo.duration) {
      const time = (progressSlider.value / 100) * mainVideo.duration;
      mainVideo.currentTime = time;
    }
  });

  // Ajuste de volumen común
  function setVolume(vol) {
    mainVideo.volume = vol;
    mainVideo.muted = (vol === 0);
    panelVolume.value = vol;

    // Actualizar icono
    if (vol === 0) {
      volumeIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else if (vol < 0.5) {
      volumeIcon.innerHTML = '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
    } else {
      volumeIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }

    if (isPowerOn) {
      terminalStatus.textContent = `[SISTEMA] AJUSTE VOLUMEN // NIVEL: ${Math.round(vol * 100)}%`;
    }
  }

  // Slider de volumen en la consola inferior
  panelVolume.addEventListener('input', (e) => {
    setVolume(parseFloat(e.target.value));
  });

  // Mute en pantalla
  btnMute.addEventListener('click', () => {
    if (mainVideo.muted) {
      setVolume(panelVolume.value > 0 ? panelVolume.value : 0.5);
    } else {
      setVolume(0);
    }
  });

  // Pantalla Completa (entra en pantalla completa en el contenedor para ver subtítulos y ocultar el CRT)
  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      if (embedPlayerContainer.requestFullscreen) {
        embedPlayerContainer.requestFullscreen();
      } else if (mainVideo.requestFullscreen) {
        mainVideo.requestFullscreen();
      }
    } else {
      document.exitFullscreen();
    }
  });

  // --- LOGICA DE PERSONALIZACION DE SUBTITULOS (ESTILO 90s) ---
  let activeColor = "yellow";
  let activeStyle = "outline";
  let activeFont = "vcr";

  function aplicarEstilosSubtitulos() {
    // Resetear clases
    subtitlesText.className = "crt-subtitles-text";
    // Añadir clase de color
    subtitlesText.classList.add(`sub-color-${activeColor}`);
    // Añadir clase de sombra/borde
    subtitlesText.classList.add(`sub-style-${activeStyle}`);
    // Añadir clase de tipografía
    subtitlesText.classList.add(`sub-font-${activeFont}`);
  }

  // Alternar visibilidad de menú de ajustes
  btnSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsMenu.classList.toggle('active');
  });

  // Cerrar menú al hacer click en cualquier parte
  document.addEventListener('click', (e) => {
    if (!settingsMenu.contains(e.target) && e.target !== btnSettings) {
      settingsMenu.classList.remove('active');
    }
  });

  // Manejo de clicks en colores
  document.querySelectorAll('.color-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.color-opt').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeColor = e.target.dataset.color;
      aplicarEstilosSubtitulos();
      if (isPowerOn) {
        terminalStatus.textContent = `[SUBTÍTULOS] COLOR SINTONIZADO: ${activeColor.toUpperCase()}`;
      }
    });
  });

  // Manejo de clicks en estilos/sombras
  document.querySelectorAll('.style-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.style-opt').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeStyle = e.target.dataset.style;
      aplicarEstilosSubtitulos();
      if (isPowerOn) {
        terminalStatus.textContent = `[SUBTÍTULOS] SOMBRA CONFIGURADA: ${activeStyle.toUpperCase()}`;
      }
    });
  });

  // Manejo de clicks en tipografías
  document.querySelectorAll('.font-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.font-opt').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeFont = e.target.dataset.font;
      aplicarEstilosSubtitulos();
      if (isPowerOn) {
        terminalStatus.textContent = `[SUBTÍTULOS] FUENTE SELECCIONADA: ${activeFont === 'vcr' ? 'VCR RETRO' : 'ARIAL STANDARD'}`;
      }
    });
  });

  // Aplicar configuraciones de fábrica al inicio
  aplicarEstilosSubtitulos();

  // Controladores de visibilidad OSD en pausa/reproducción
  mainVideo.addEventListener('play', () => {
    embedPlayerContainer.classList.remove('show-controls');
  });
  
  mainVideo.addEventListener('pause', () => {
    embedPlayerContainer.classList.add('show-controls');
  });

  // Inicialmente pausado: mostrar controles
  embedPlayerContainer.classList.add('show-controls');


  // ==========================================================================
  // 4. ATAJOS DE TECLADO (ACCESIBILIDAD Y EFECTO VJ)
  // ==========================================================================
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    // 1, 2, 3 -> Canales
    if (key === '1') {
      sintonizarCanal(1);
    } else if (key === '2') {
      sintonizarCanal(2);
    } else if (key === '3') {
      sintonizarCanal(3);
    }
    
    // P -> Encendido/Apagado
    else if (key === 'p') {
      togglePower();
    }
    
    // Espacio -> Play/Pausa en Canal 2
    else if (e.key === ' ' || key === 'spacebar') {
      if (isPowerOn && currentChannel === 2) {
        e.preventDefault(); // Evitar scroll
        togglePlayPause();
      }
    }
    
    // Flecha derecha/izquierda -> Cambiar canal
    else if (e.key === 'ArrowRight') {
      if (isPowerOn) sintonizarCanal(currentChannel + 1);
    } else if (e.key === 'ArrowLeft') {
      if (isPowerOn) sintonizarCanal(currentChannel - 1);
    }
  });
});
