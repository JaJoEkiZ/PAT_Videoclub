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
  
  // Inyección de fuentes dinámicas (Video y Portada)
  const mainVideoElem = document.getElementById('main-video');
  if (mainVideoElem && metadata.archivo_video) {
    mainVideoElem.src = metadata.archivo_video;
    mainVideoElem.innerHTML = `<source src="${metadata.archivo_video}" type="video/mp4">Tu navegador no soporta video.`;
    mainVideoElem.load();
  }
  const coverImgElem = document.querySelector('.crt-cover-img');
  if (coverImgElem && metadata.archivo_portada) {
    coverImgElem.src = metadata.archivo_portada;
  }

  // Portada y Sticker en CH 1
  document.getElementById('sticker-title').textContent = metadata.titulo;
  document.getElementById('sticker-director').textContent = `DIR: ${metadata.director}`;
  document.getElementById('sticker-duration').textContent = `${metadata.duracion}`;

  // Ficha técnica en CH 3 (Teletexto)
  document.getElementById('info-director').textContent = metadata.director;
  document.getElementById('info-genre').textContent = metadata.genero;
  document.getElementById('info-duration').textContent = metadata.duracion;
  document.getElementById('info-region').textContent = metadata.region;
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
  const osdVolumeSlider = document.getElementById('osd-volume-slider');
  const subSizeSlider = document.getElementById('sub-size-slider');
  const subSizeLabel = document.getElementById('sub-size-label');
  const subLineHeightSlider = document.getElementById('sub-line-height-slider');
  const subLineHeightLabel = document.getElementById('sub-line-height-label');
  const subPosSlider = document.getElementById('sub-pos-slider');
  const subPosLabel = document.getElementById('sub-pos-label');
  const subtitlesOverlay = document.getElementById('subtitles-overlay');
  const subtitlesText = document.getElementById('subtitles-text');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const embedPlayerContainer = document.querySelector('.embed-player-container');
  const btnSettings = document.getElementById('btn-settings');
  const settingsMenu = document.getElementById('subtitles-settings-menu');

  let parsedSubtitles = [];

  // Parseador de SRT Ultra-Robusto (Soporta saltos simples/dobles y formateos de Windows)
  function parseSRT(data) {
    if (!data || typeof data !== 'string') return [];
    const subs = [];

    // Normalizar saltos de línea y des-escapar si viene formateado
    let normalized = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (normalized.includes('\\n') && !normalized.includes('\n')) {
      normalized = normalized.replace(/\\n/g, '\n');
    }

    const lines = normalized.split('\n');
    const timeRegex = /(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{2,3})\s*-->\s*(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{2,3})/;

    let currentCue = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const match = timeRegex.exec(line);
      if (match) {
        if (currentCue) {
          currentCue.text = currentCue.text.replace(/\n?\d+$/, '').trim();
          if (currentCue.text.length > 0) {
            subs.push(currentCue);
          }
        }

        const h1 = parseInt(match[1] || '0', 10);
        const m1 = parseInt(match[2], 10);
        const s1 = parseInt(match[3], 10);
        const ms1 = parseInt(match[4].padEnd(3, '0'), 10);

        const h2 = parseInt(match[5] || '0', 10);
        const m2 = parseInt(match[6], 10);
        const s2 = parseInt(match[7], 10);
        const ms2 = parseInt(match[8].padEnd(3, '0'), 10);

        const start = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000;
        const end = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000;

        currentCue = { start, end, text: '' };
      } else if (currentCue) {
        if (/^\d+$/.test(line) && currentCue.text.length === 0) {
          continue;
        }
        if (currentCue.text.length > 0) {
          currentCue.text += '\n' + line;
        } else {
          currentCue.text = line;
        }
      }
    }

    if (currentCue) {
      currentCue.text = currentCue.text.replace(/\n?\d+$/, '').trim();
      if (currentCue.text.length > 0) {
        subs.push(currentCue);
      }
    }

    return subs;
  }

  // Cargar subtítulos de forma 100% offline (Cero peticiones fetch / cero CORS)
  function loadSubtitles() {
    let rawData = window.VideotecaSubtitulosRaw || window.VideotecaSubtitulos || window.VideotecaSubtitulo;

    if (!rawData && metadata) {
      if (metadata.subtitulos_raw) rawData = metadata.subtitulos_raw;
      else if (metadata.subtitulo && typeof metadata.subtitulo === 'string' && metadata.subtitulo.includes('-->')) rawData = metadata.subtitulo;
      else if (metadata.subtitulos && typeof metadata.subtitulos === 'string' && metadata.subtitulos.includes('-->')) rawData = metadata.subtitulos;
    }

    if (rawData && typeof rawData === 'string' && rawData.trim().length > 0) {
      parsedSubtitles = parseSRT(rawData);
      console.log(`Subtítulos locales parseados correctamente (${parsedSubtitles.length} líneas, cero CORS).`);
    } else {
      console.warn("No se encontraron subtítulos locales inyectados. Grabe nuevamente el USB desde la Estación de Control.");
    }
  }

  // Cargar subtítulos inmediatamente al inicio
  loadSubtitles();

  const crtPlayOverlay = document.getElementById('crt-play-overlay');
  if (crtPlayOverlay) {
    crtPlayOverlay.addEventListener('click', () => {
      crtPlayOverlay.style.display = 'none';
      reproducirVideo();
    });
  }

  // Pausar y reproducir funciones
  function reproducirVideo() {
    if (!isPowerOn) return;
    if (crtPlayOverlay) crtPlayOverlay.style.display = 'none';
    mainVideo.play().then(() => {
      playPauseIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'; // Icono Pausa
      terminalStatus.textContent = `[SISTEMA] REPRODUCIENDO CINTA // AUDIO: ${Math.round(mainVideo.volume * 100)}%`;
    }).catch(err => {
      console.log("Error al iniciar reproducción. Interacción requerida.");
      if (crtPlayOverlay) crtPlayOverlay.style.display = 'flex';
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

  // Formateador seguro y robusto de etiquetas HTML/SRT de subtítulos
  function formatSubtitleHTML(text) {
    if (!text) return '';
    
    // 1. Normalizar saltos de línea y limpiar etiquetas de posición/estilo ASS/SSA (ej: {\an8}, {\pos(x,y)})
    let clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    clean = clean.replace(/\{\\[^}]*\}/g, '');

    // 2. Eliminar saltos de línea dentro de las propias etiquetas HTML (ej: <font\n color="..."> -> <font color="...">)
    clean = clean.replace(/<([^>]+)>/g, (match) => match.replace(/\n+/g, ' '));

    // 3. Eliminar saltos de línea/espacios inmediatamente después de una etiqueta de apertura (<tag>\n -> <tag>)
    // y antes de una etiqueta de cierre (\n</tag> -> </tag>) para que no generen <br> ni líneas en blanco indeseadas.
    let prev;
    do {
      prev = clean;
      clean = clean.replace(/<([a-z]+[^>]*)>\s*\n+/gi, '<$1>');
      clean = clean.replace(/\n+\s*<\/([a-z]+)>/gi, '</$1>');
    } while (clean !== prev);

    // 4. Proteger TODAS las etiquetas de formato válidas de subtítulos (SRT, WebVTT, HTML):
    // i, b, u, s, strike, em, strong, font, span, mark, small, sub, sup, c, v, p, div, br (con o sin atributos)
    clean = clean.replace(/<(\/?(i|b|u|s|strike|em|strong|font|span|mark|small|sub|sup|c|v|p|div|br)(?:\s+[^>]*)?)>/gi, '___TAG___$1___ENDTAG___');

    // 5. Sanitizar cualquier otro HTML crudo o potencialmente peligroso ajeno a las etiquetas válidas
    let html = clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 6. Convertir los saltos de línea reales (\n) a <br>
    html = html.replace(/\n/g, '<br>');

    // 7. Restaurar las etiquetas protegidas limpias y formateadas
    html = html.replace(/___TAG___(.*?)___ENDTAG___/gi, '<$1>');

    return html;
  }

  // Sincronizar subtítulos
  function updateSubtitles() {
    const time = mainVideo.currentTime;
    const activeSub = parsedSubtitles.find(s => time >= s.start && time <= s.end);
    
    if (activeSub) {
      subtitlesText.innerHTML = formatSubtitleHTML(activeSub.text);
      subtitlesOverlay.style.display = 'block';
    } else {
      subtitlesText.innerHTML = '';
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
    if (osdVolumeSlider) osdVolumeSlider.value = vol;

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

  // Slider de volumen en los controles OSD de pantalla
  if (osdVolumeSlider) {
    osdVolumeSlider.addEventListener('input', (e) => {
      setVolume(parseFloat(e.target.value));
    });
  }

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
  let activeSizeScale = 1.0;
  let activeLineHeight = 1.3;
  let activePosOffset = 0;

  function aplicarEstilosSubtitulos() {
    // Resetear clases
    subtitlesText.className = "crt-subtitles-text";
    // Añadir clase de color
    subtitlesText.classList.add(`sub-color-${activeColor}`);
    // Añadir clase de sombra/borde
    subtitlesText.classList.add(`sub-style-${activeStyle}`);
    // Añadir clase de tipografía
    subtitlesText.classList.add(`sub-font-${activeFont}`);
    // Aplicar escala de tamaño, interlineado y posición vertical via variables CSS
    subtitlesText.style.setProperty('--sub-size-scale', activeSizeScale);
    subtitlesText.style.setProperty('--sub-line-height', activeLineHeight);
    subtitlesOverlay.style.setProperty('--sub-pos-offset', activePosOffset + '%');
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

  // Manejo de slider de tamaño de subtítulos
  if (subSizeSlider) {
    subSizeSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      activeSizeScale = val / 100;
      if (subSizeLabel) subSizeLabel.textContent = `${val}%`;
      aplicarEstilosSubtitulos();
      if (isPowerOn) {
        terminalStatus.textContent = `[SUBTÍTULOS] TAMAÑO SINTONIZADO: ${val}%`;
      }
    });
  }

  // Manejo de slider de interlineado de subtítulos
  if (subLineHeightSlider) {
    subLineHeightSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      activeLineHeight = (val / 10).toFixed(1);
      if (subLineHeightLabel) subLineHeightLabel.textContent = `${activeLineHeight}x`;
      aplicarEstilosSubtitulos();
      if (isPowerOn) {
        terminalStatus.textContent = `[SUBTÍTULOS] INTERLINEADO AJUSTADO: ${activeLineHeight}x`;
      }
    });
  }

  // Manejo de slider de altura en pantalla de subtítulos
  if (subPosSlider) {
    subPosSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      activePosOffset = val;
      if (subPosLabel) {
        subPosLabel.textContent = val === 0 ? 'Estándar' : (val > 0 ? `+${val}%` : `${val}%`);
      }
      aplicarEstilosSubtitulos();
      if (isPowerOn) {
        terminalStatus.textContent = `[SUBTÍTULOS] ALTURA SINTONIZADA: ${val === 0 ? 'ESTÁNDAR' : (val > 0 ? '+' + val + '%' : val + '%')}`;
      }
    });
  }

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
