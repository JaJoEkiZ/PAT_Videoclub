#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===============================================================================
     V I D E O C L Ú   P U T R E F A C T O R   A   T O R S I Ó N
     Estación de Control & Auditoría Criptográfica (Servidor HTTP + REST API)
===============================================================================
"""

import os
import sys
import json
import sqlite3
import hashlib
import shutil
import time
from datetime import datetime
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.parse
import webbrowser

PORT = 5000
SCRIPT_DIR = Path(__file__).parent.resolve()
WEB_DIR = SCRIPT_DIR / "web"
DB_PATH = SCRIPT_DIR / "videoclub.db"
CATALOGO_DIR = SCRIPT_DIR / "catalogo"

# =============================================================================
# 1. GESTOR DE BASE DE DATOS SQLITE (VIDEOCLÚ PUTREFACTOR A TORSIÓN)
# =============================================================================
class DatabaseManager:
    def __init__(self):
        self.init_db()

    def get_conn(self):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self):
        with self.get_conn() as conn:
            cur = conn.cursor()
            cur.execute('''
                CREATE TABLE IF NOT EXISTS socios (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    num_socio TEXT UNIQUE NOT NULL,
                    nombre TEXT NOT NULL,
                    telefono TEXT,
                    estado TEXT DEFAULT 'ACTIVO',
                    fecha_alta DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cur.execute('''
                CREATE TABLE IF NOT EXISTS eventos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre_evento TEXT NOT NULL,
                    lugar TEXT NOT NULL,
                    fecha TEXT NOT NULL,
                    hora TEXT NOT NULL,
                    estado TEXT DEFAULT 'ACTIVO'
                )
            ''')
            cur.execute('''
                CREATE TABLE IF NOT EXISTS peliculas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    codigo_pelicula TEXT UNIQUE NOT NULL,
                    titulo TEXT NOT NULL,
                    director TEXT NOT NULL,
                    anio INTEGER,
                    genero TEXT,
                    duracion TEXT,
                    sinopsis TEXT,
                    folder_name TEXT,
                    video_path TEXT,
                    srt_path TEXT,
                    cover_path TEXT
                )
            ''')
            cur.execute('''
                CREATE TABLE IF NOT EXISTS prestamos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_usb TEXT NOT NULL,
                    socio_id INTEGER NOT NULL,
                    pelicula_id INTEGER NOT NULL,
                    evento_id INTEGER NOT NULL,
                    fecha_prestamo DATETIME DEFAULT CURRENT_TIMESTAMP,
                    fecha_devolucion DATETIME,
                    estado_integridad TEXT DEFAULT 'PENDIENTE',
                    estado_prestamo TEXT DEFAULT 'ALQUILADO',
                    FOREIGN KEY(socio_id) REFERENCES socios(id),
                    FOREIGN KEY(pelicula_id) REFERENCES peliculas(id),
                    FOREIGN KEY(evento_id) REFERENCES eventos(id)
                )
            ''')
            
            # Datos de inicio si están vacías
            cur.execute("SELECT COUNT(*) FROM peliculas")
            if cur.fetchone()[0] == 0:
                cur.execute('''
                    INSERT INTO peliculas (codigo_pelicula, titulo, director, anio, genero, duracion)
                    VALUES ('VL-1993', 'Viento Limay', 'Videoclú Putrefactor A Torsión', 1993, 'Drama / Neo-Noir Patagónico', '1h 24min')
                ''')

            cur.execute("SELECT COUNT(*) FROM eventos")
            if cur.fetchone()[0] == 0:
                hoy = datetime.now().strftime("%Y-%m-%d")
                cur.execute('''
                    INSERT INTO eventos (nombre_evento, lugar, fecha, hora, estado)
                    VALUES ('Muestra Lanzamiento Bariloche', 'Centro Cultural Limay', ?, '21:00', 'ACTIVO')
                ''', (hoy,))

            cur.execute("SELECT COUNT(*) FROM socios")
            if cur.fetchone()[0] == 0:
                cur.execute('''
                    INSERT INTO socios (num_socio, nombre, telefono, estado)
                    VALUES ('SOC-001', 'Socio Fundador PAT', '+54 294 400-1993', 'ACTIVO')
                ''')
            conn.commit()

db = DatabaseManager()

def read_text_smart(file_path):
    path = Path(file_path)
    if not path or not path.exists():
        return ""
    raw_bytes = path.read_bytes()
    for enc in ['utf-8-sig', 'utf-8', 'cp1252', 'latin-1', 'iso-8859-1']:
        try:
            return raw_bytes.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode('utf-8', errors='replace')

def calculate_file_hash(filepath):
    sha256 = hashlib.sha256()
    try:
        with open(filepath, 'rb') as f:
            while chunk := f.read(65536):
                sha256.update(chunk)
        return sha256.hexdigest()
    except Exception:
        return None

def generate_directory_hashes(root_dir):
    ignore_dirs = {'.git', '__pycache__', 'System Volume Information', '$RECYCLE.BIN', 'Peli-Usb'}
    ignore_exts = {'.psd', '.db', '.pyc', '.tmp'}
    ignore_files = {'thumbs.db', 'desktop.ini', 'metadata.json', 'metadata.js'}
    hashes = {}
    root_path = Path(root_dir)

    if not root_path.exists():
        return hashes

    for file_path in root_path.rglob('*'):
        if file_path.is_file():
            rel = file_path.relative_to(root_path)
            if any(part in ignore_dirs for part in rel.parts[:-1]):
                continue
            if file_path.name.lower() in ignore_files or file_path.suffix.lower() in ignore_exts:
                continue
            h = calculate_file_hash(file_path)
            if h:
                hashes[rel.as_posix()] = h
    return hashes

def inspect_drive(drive_path):
    p = Path(drive_path)
    meta_file = p / "datos" / "metadata.json"
    if not meta_file.exists():
        return None
    try:
        with open(meta_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            data['_drive_path'] = str(drive_path)
            return data
    except Exception:
        return None

# State Global de Sesión
session_state = {
    "active_event_id": 1,
    "active_drive_path": r"C:\Users\JaJo EkiZ\Desktop\Peli-Usb"
}

# =============================================================================
# 3. MANEJADOR HTTP SERVER (REST API + STATIC FILES)
# =============================================================================
class ControlStationRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/api/'):
            self.handle_api_get(parsed.path, urllib.parse.parse_qs(parsed.query))
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            body = json.loads(body_bytes.decode('utf-8'))
        except Exception:
            body = {}
        
        if parsed.path.startswith('/api/'):
            self.handle_api_post(parsed.path, body)
        else:
            self.send_error(404, "Not Found")

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def handle_api_get(self, path, query):
        if path == '/api/status':
            usb_info = inspect_drive(session_state["active_drive_path"])
            with db.get_conn() as conn:
                evt = conn.execute("SELECT * FROM eventos WHERE id = ?", (session_state["active_event_id"],)).fetchone()
                evt_dict = dict(evt) if evt else None
                
                prestamo = None
                if usb_info and 'id_usb' in usb_info:
                    p = conn.execute(
                        "SELECT p.*, s.nombre as socio_nombre FROM prestamos p JOIN socios s ON p.socio_id = s.id WHERE p.id_usb = ? AND p.estado_prestamo = 'ALQUILADO'",
                        (usb_info['id_usb'],)
                    ).fetchone()
                    if p:
                        prestamo = dict(p)

            self.send_json({
                "session": session_state,
                "event": evt_dict,
                "usb": usb_info,
                "prestamo_activo": prestamo
            })

        elif path == '/api/socios':
            with db.get_conn() as conn:
                socios = [dict(r) for r in conn.execute("SELECT * FROM socios ORDER BY id DESC").fetchall()]
            self.send_json(socios)

        elif path == '/api/eventos':
            with db.get_conn() as conn:
                eventos = [dict(r) for r in conn.execute("SELECT * FROM eventos ORDER BY id DESC").fetchall()]
            self.send_json(eventos)

        elif path == '/api/peliculas':
            with db.get_conn() as conn:
                peliculas = [dict(r) for r in conn.execute("SELECT * FROM peliculas").fetchall()]
            self.send_json(peliculas)

        elif path == '/api/scan':
            drive = session_state["active_drive_path"]
            usb_info = inspect_drive(drive)
            if not usb_info:
                self.send_json({"error": "No se detectó pendrive válido en la unidad."}, status=400)
                return
            
            expected_hashes = usb_info.get("hashes", {})
            current_hashes = generate_directory_hashes(drive)

            report = []
            ok_count = 0
            altered_count = 0
            missing_count = 0
            unknown_count = 0

            altered_files = []
            missing_files = []
            unknown_files = []

            for rel_path, exp_h in expected_hashes.items():
                if rel_path in current_hashes:
                    if current_hashes[rel_path] == exp_h:
                        report.append({"path": rel_path, "status": "OK"})
                        ok_count += 1
                    else:
                        report.append({"path": rel_path, "status": "ALTERADO"})
                        altered_count += 1
                        altered_files.append(rel_path)
                else:
                    report.append({"path": rel_path, "status": "FALTANTE"})
                    missing_count += 1
                    missing_files.append(rel_path)

            for rel_path in current_hashes:
                if rel_path not in expected_hashes:
                    report.append({"path": rel_path, "status": "PARASITO"})
                    unknown_count += 1
                    unknown_files.append(rel_path)

            estado_global = "INTEGRO" if (altered_count == 0 and missing_count == 0) else "CORRUPTO"

            self.send_json({
                "id_usb": usb_info.get("id_usb", "USB-001"),
                "titulo": usb_info.get("titulo", "Obra Regional"),
                "estado_global": estado_global,
                "summary": {
                    "ok": ok_count,
                    "altered": altered_count,
                    "missing": missing_count,
                    "unknown": unknown_count
                },
                "report": report,
                "altered_files": altered_files,
                "missing_files": missing_files,
                "unknown_files": unknown_files
            })

        else:
            self.send_json({"error": "Endpoint GET desconocido"}, status=404)

    def handle_api_post(self, path, body):
        if path == '/api/select-drive':
            drive = body.get('drive')
            if drive and os.path.exists(drive):
                session_state['active_drive_path'] = drive
                self.send_json({"status": "OK", "active_drive_path": drive})
            else:
                self.send_json({"error": "Ruta inválida"}, status=400)

        elif path == '/api/select-event':
            evt_id = body.get('event_id')
            if evt_id:
                session_state['active_event_id'] = int(evt_id)
                self.send_json({"status": "OK", "active_event_id": session_state['active_event_id']})
            else:
                self.send_json({"error": "ID de evento requerido"}, status=400)

        elif path == '/api/alquilar':
            socio_id = body.get('socio_id')
            drive_path = session_state['active_drive_path']
            usb_info = inspect_drive(drive_path)
            
            if not usb_info:
                self.send_json({"error": "Pendrive inválido"}, status=400)
                return

            id_usb = usb_info.get('id_usb', 'USB-001')
            titulo = usb_info.get('titulo', 'Viento Limay')

            with db.get_conn() as conn:
                peli = conn.execute("SELECT id FROM peliculas WHERE titulo LIKE ?", (f"%{titulo}%",)).fetchone()
                peli_id = peli['id'] if peli else 1

                # Cerrar alquileres previos sin devolver si existieran
                conn.execute("UPDATE prestamos SET estado_prestamo = 'FINALIZADO_FORZADO' WHERE id_usb = ? AND estado_prestamo = 'ALQUILADO'", (id_usb,))
                
                conn.execute('''
                    INSERT INTO prestamos (id_usb, socio_id, pelicula_id, evento_id, estado_prestamo)
                    VALUES (?, ?, ?, ?, 'ALQUILADO')
                ''', (id_usb, socio_id, peli_id, session_state['active_event_id']))
                conn.commit()

            self.send_json({"status": "OK", "message": f"Pendrive {id_usb} prestado exitosamente."})

        elif path == '/api/devolver':
            drive_path = session_state['active_drive_path']
            usb_info = inspect_drive(drive_path)
            estado_integridad = body.get('estado_integridad', 'INTEGRO')
            
            if not usb_info:
                self.send_json({"error": "Pendrive inválido"}, status=400)
                return

            id_usb = usb_info.get('id_usb', 'USB-001')

            with db.get_conn() as conn:
                conn.execute('''
                    UPDATE prestamos 
                    SET fecha_devolucion = CURRENT_TIMESTAMP, 
                        estado_prestamo = 'DEVUELTO',
                        estado_integridad = ?
                    WHERE id_usb = ? AND estado_prestamo = 'ALQUILADO'
                ''', (estado_integridad, id_usb))
                conn.commit()

            self.send_json({"status": "OK", "message": f"Devolución del pendrive {id_usb} registrada."})

        elif path == '/api/restore':
            drive_path = Path(session_state['active_drive_path'])
            altered = body.get('altered_files', [])
            missing = body.get('missing_files', [])
            unknown = body.get('unknown_files', [])

            usb_info = inspect_drive(drive_path)
            master = None
            if usb_info and 'titulo' in usb_info:
                sanitized = "".join([c for c in usb_info['titulo'] if c.isalnum() or c in (' ', '_', '-')]).strip().replace(' ', '_').upper()
                if (CATALOGO_DIR / sanitized).exists():
                    master = CATALOGO_DIR / sanitized
                else:
                    for folder in CATALOGO_DIR.iterdir():
                        if folder.is_dir():
                            m_file = folder / "datos" / "metadata.json"
                            if m_file.exists():
                                try:
                                    with open(m_file, 'r', encoding='utf-8') as f:
                                        mdata = json.load(f)
                                        if mdata.get('titulo', '').lower() == usb_info['titulo'].lower():
                                            master = folder
                                            break
                                except Exception:
                                    pass

            if not master or not master.exists():
                folders = [f for f in CATALOGO_DIR.iterdir() if f.is_dir()]
                master = folders[0] if folders else (CATALOGO_DIR / "VIENTO_LIMAY")

            if not master or not master.exists():
                self.send_json({"error": "No existe la carpeta máster en el servidor"}, status=500)
                return

            repaired = 0
            cleaned = 0

            for rel_file in (altered + missing):
                src = master / rel_file
                dst = drive_path / rel_file
                if src.exists():
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dst)
                    repaired += 1

            for rel_file in unknown:
                f_del = drive_path / rel_file
                if f_del.exists():
                    try:
                        f_del.unlink()
                        cleaned += 1
                    except Exception:
                        pass

            self.send_json({"status": "OK", "repaired": repaired, "cleaned": cleaned})

        elif path == '/api/generar-usb':
            id_usb = body.get('id_usb', '').strip()
            target_drive = body.get('target_drive', session_state['active_drive_path']).strip()
            pelicula_codigo = body.get('pelicula_codigo') or body.get('pelicula') or body.get('folder_name')

            if not id_usb:
                id_usb = f"USB-{int(time.time()) % 1000:03d}"

            PLANTILLA_DIR = SCRIPT_DIR / "plantilla_usb"
            if not PLANTILLA_DIR.exists():
                self.send_json({"error": "No existe la carpeta plantilla_usb en el servidor"}, status=500)
                return

            # 1. Buscar película en la Base de Datos SQLite
            peli_row = None
            with db.get_conn() as conn:
                if pelicula_codigo:
                    peli_row = conn.execute(
                        "SELECT * FROM peliculas WHERE codigo_pelicula = ? OR id = ? OR titulo = ? OR folder_name = ?",
                        (pelicula_codigo, pelicula_codigo, pelicula_codigo, pelicula_codigo)
                    ).fetchone()

                if not peli_row:
                    peli_row = conn.execute("SELECT * FROM peliculas ORDER BY id ASC LIMIT 1").fetchone()

            if not peli_row:
                self.send_json({"error": "No hay películas registradas en el catálogo"}, status=404)
                return

            peli = dict(peli_row)
            folder_name = peli.get('folder_name') or "".join([c for c in peli['titulo'] if c.isalnum() or c in (' ', '_', '-')]).strip().replace(' ', '_').upper()
            movie_cat_dir = CATALOGO_DIR / folder_name

            target_path = Path(target_drive)
            target_path.mkdir(parents=True, exist_ok=True)

            # 2. Copiar estructura base de la interfaz USB desde plantilla_usb/
            ignore_names = {'tv.psd', 'Peli-Usb', '.git', '__pycache__', 'thumbs.db'}
            def copy_clean(src, dst):
                dst.mkdir(parents=True, exist_ok=True)
                for item in src.iterdir():
                    if item.name in ignore_names or item.name.lower().endswith(('.psd', '.tmp')):
                        continue
                    dst_item = dst / item.name
                    if item.is_dir():
                        copy_clean(item, dst_item)
                    else:
                        shutil.copy2(item, dst_item)

            copy_clean(PLANTILLA_DIR, target_path)

            # Helper para resolución de archivos
            def resolve_asset(path_str, fallback_extensions=None):
                if path_str:
                    p = Path(path_str)
                    if p.is_absolute() and p.exists():
                        return p
                    if (SCRIPT_DIR / p).exists():
                        return (SCRIPT_DIR / p).resolve()
                    if (CATALOGO_DIR / p).exists():
                        return (CATALOGO_DIR / p).resolve()

                if movie_cat_dir.exists():
                    if fallback_extensions:
                        for f in movie_cat_dir.iterdir():
                            if f.is_file() and f.suffix.lower() in fallback_extensions:
                                return f
                        if (movie_cat_dir / "datos").exists():
                            for f in (movie_cat_dir / "datos").iterdir():
                                if f.is_file() and f.suffix.lower() in fallback_extensions:
                                    return f
                return None

            # 3. Copiar Video
            video_src = resolve_asset(peli.get('video_path'), ['.mp4', '.mkv', '.avi', '.mov'])
            if not video_src or not video_src.exists():
                self.send_json({"error": f"Archivo de video no encontrado para '{peli['titulo']}'"}, status=404)
                return

            video_filename = video_src.name
            shutil.copy2(video_src, target_path / video_filename)

            # 4. Copiar Subtítulos (.srt) y extraer subtitulos_raw offline
            srt_filename = ""
            subtitulos_raw = ""
            srt_src = resolve_asset(peli.get('srt_path'), ['.srt'])
            if srt_src and srt_src.exists():
                srt_filename = srt_src.name
                shutil.copy2(srt_src, target_path / srt_filename)
                subtitulos_raw = read_text_smart(srt_src)

            # 5. Copiar Portada
            cover_src = resolve_asset(peli.get('cover_path'), ['.png', '.jpg', '.jpeg'])
            if cover_src and cover_src.exists():
                (target_path / "datos").mkdir(parents=True, exist_ok=True)
                shutil.copy2(cover_src, target_path / "datos" / "portada.png")

            # 6. Leer metadatos del catálogo si existen
            cat_meta_file = movie_cat_dir / "datos" / "metadata.json" if movie_cat_dir.exists() else None
            cat_meta = {}
            if cat_meta_file and cat_meta_file.exists():
                try:
                    content = read_text_smart(cat_meta_file)
                    cat_meta = json.loads(content)
                except Exception:
                    pass

            if not subtitulos_raw:
                subtitulos_raw = cat_meta.get('subtitulos_raw', '')

            meta_data = {
                "id_usb": id_usb,
                "titulo": peli.get('titulo') or cat_meta.get('titulo', 'Obra Regional'),
                "director": peli.get('director') or cat_meta.get('director', 'Videoclú Putrefactor A Torsión'),
                "anio": peli.get('anio') or cat_meta.get('anio', 2026),
                "duracion": peli.get('duracion') or cat_meta.get('duracion', '1h 30min'),
                "genero": peli.get('genero') or cat_meta.get('genero', 'Cine Patagónico'),
                "sinopsis": peli.get('sinopsis') or cat_meta.get('sinopsis', 'Sin sinopsis registrada.'),
                "region": cat_meta.get('region', 'Patagonia Argentina'),
                "idioma": cat_meta.get('idioma', 'Español'),
                "subtitulos": cat_meta.get('subtitulos', 'Español (SRT)'),
                "subtitulos_raw": subtitulos_raw,
                "subtitulo": subtitulos_raw,
                "bitacora": cat_meta.get('bitacora', []),
                "archivo_video": video_filename,
                "archivo_subtitulos": srt_filename,
                "archivo_portada": "datos/portada.png"
            }

            # 7. Escribir metadatos, subtítulos y firmas criptográficas SHA-256
            metadata_json_path = target_path / "datos" / "metadata.json"
            metadata_js_path = target_path / "datos" / "metadata.js"
            subtitulos_js_path = target_path / "datos" / "subtitulos.js"

            (target_path / "datos").mkdir(parents=True, exist_ok=True)
            
            # Escribir script de subtítulos offline 100% libre de CORS con alias
            sub_js_str = json.dumps(subtitulos_raw, ensure_ascii=False)
            with open(subtitulos_js_path, 'w', encoding='utf-8') as f:
                f.write(f"window.VideotecaSubtitulosRaw = {sub_js_str};\n"
                        f"window.VideotecaSubtitulos = window.VideotecaSubtitulosRaw;\n"
                        f"window.VideotecaSubtitulo = window.VideotecaSubtitulosRaw;\n")

            with open(metadata_json_path, 'w', encoding='utf-8') as f:
                json.dump(meta_data, f, ensure_ascii=False, indent=2)

            hashes = generate_directory_hashes(target_path)
            meta_data['hashes'] = hashes

            with open(metadata_json_path, 'w', encoding='utf-8') as f:
                json.dump(meta_data, f, ensure_ascii=False, indent=2)

            js_content = f"window.VideotecaMetadata = {json.dumps(meta_data, ensure_ascii=False, indent=2)};"
            with open(metadata_js_path, 'w', encoding='utf-8') as f:
                f.write(js_content)

            self.send_json({"status": "OK", "id_usb": id_usb, "target_drive": str(target_path), "pelicula": peli['titulo']})

        elif path == '/api/add-socio':
            nombre = body.get('nombre', '').strip()
            telefono = body.get('telefono', '').strip()

            if not nombre:
                self.send_json({"error": "Nombre es requerido"}, status=400)
                return

            num_socio = f"SOC-{int(time.time()) % 10000:04d}"
            with db.get_conn() as conn:
                cur = conn.cursor()
                cur.execute("INSERT INTO socios (num_socio, nombre, telefono) VALUES (?, ?, ?)", (num_socio, nombre, telefono))
                conn.commit()
                soc_id = cur.lastrowid

            self.send_json({"status": "OK", "id": soc_id, "num_socio": num_socio, "nombre": nombre})

        elif path == '/api/add-evento':
            nombre = body.get('nombre_evento', '').strip()
            lugar = body.get('lugar', '').strip()
            fecha = body.get('fecha', '').strip() or datetime.now().strftime("%Y-%m-%d")
            hora = body.get('hora', '').strip() or "20:00"

            if not nombre:
                self.send_json({"error": "Nombre del evento es requerido"}, status=400)
                return

            with db.get_conn() as conn:
                cur = conn.cursor()
                cur.execute("INSERT INTO eventos (nombre_evento, lugar, fecha, hora) VALUES (?, ?, ?, ?)", (nombre, lugar, fecha, hora))
                conn.commit()
                evt_id = cur.lastrowid
                session_state['active_event_id'] = evt_id

            self.send_json({"status": "OK", "id": evt_id, "nombre_evento": nombre})

        elif path == '/api/add-pelicula':
            titulo = body.get('titulo', '').strip()
            director = body.get('director', '').strip() or "Videoclú Putrefactor A Torsión"
            anio = body.get('anio', 2026)
            genero = body.get('genero', 'Cine Patagónico').strip()
            duracion = body.get('duracion', '1h 30min').strip()
            sinopsis = body.get('sinopsis', '').strip()
            
            video_path_in = body.get('video_path', '').strip()
            srt_path_in = body.get('srt_path', '').strip()
            cover_path_in = body.get('cover_path', '').strip()

            if not titulo:
                self.send_json({"error": "El título es obligatorio"}, status=400)
                return

            if not video_path_in or not os.path.exists(video_path_in):
                self.send_json({"error": f"Archivo de video no encontrado en: {video_path_in}"}, status=400)
                return

            # Crear carpeta sanitizada en el Catálogo
            folder_name = "".join([c for c in titulo if c.isalnum() or c in (' ', '_', '-')]).strip().replace(' ', '_').upper()
            if not folder_name:
                folder_name = f"PELI_{int(time.time())}"

            target_master_dir = CATALOGO_DIR / folder_name
            target_master_dir.mkdir(parents=True, exist_ok=True)
            (target_master_dir / "datos").mkdir(parents=True, exist_ok=True)

            # 1. Copiar Archivo de Video con nombre derivado del título
            video_ext = Path(video_path_in).suffix or '.mp4'
            sanitized_video_name = f"{folder_name}{video_ext}"
            dst_video_path = target_master_dir / sanitized_video_name
            shutil.copy2(video_path_in, dst_video_path)

            # 2. Copiar Subtítulos
            dst_srt_path = None
            if srt_path_in and os.path.exists(srt_path_in):
                srt_ext = Path(srt_path_in).suffix or '.srt'
                dst_srt_path = target_master_dir / f"{folder_name}{srt_ext}"
                shutil.copy2(srt_path_in, dst_srt_path)

            # 3. Copiar Portada
            dst_cover_path = None
            if cover_path_in and os.path.exists(cover_path_in):
                dst_cover_path = target_master_dir / "datos" / "portada.png"
                shutil.copy2(cover_path_in, dst_cover_path)

            # 4. Construir metadata.json para el Catálogo
            meta = {
                "titulo": titulo,
                "director": director,
                "anio": int(anio) if str(anio).isdigit() else 2026,
                "duracion": duracion,
                "genero": genero,
                "sinopsis": sinopsis or "Sin sinopsis registrada.",
                "region": "Patagonia Argentina",
                "idioma": "Español",
                "subtitulos": "Español (SRT)",
                "archivo_video": sanitized_video_name,
                "archivo_subtitulos": dst_srt_path.name if dst_srt_path else "",
                "archivo_portada": "datos/portada.png"
            }

            meta_json = target_master_dir / "datos" / "metadata.json"
            with open(meta_json, 'w', encoding='utf-8') as f:
                json.dump(meta, f, ensure_ascii=False, indent=2)

            # 5. Registrar en la Base de Datos SQLite con rutas reales
            codigo_pelicula = f"PAT-{int(time.time()) % 10000:04d}"
            rel_video = f"catalogo/{folder_name}/{sanitized_video_name}"
            rel_srt = f"catalogo/{folder_name}/{dst_srt_path.name}" if dst_srt_path else ""
            rel_cover = f"catalogo/{folder_name}/datos/portada.png" if dst_cover_path else ""

            with db.get_conn() as conn:
                cur = conn.cursor()
                cur.execute('''
                    INSERT INTO peliculas (codigo_pelicula, titulo, director, anio, genero, duracion, sinopsis, folder_name, video_path, srt_path, cover_path)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (codigo_pelicula, titulo, director, meta['anio'], genero, duracion, sinopsis, folder_name, rel_video, rel_srt, rel_cover))
                conn.commit()

            self.send_json({
                "status": "OK",
                "codigo_pelicula": codigo_pelicula,
                "titulo": titulo,
                "folder_name": folder_name
            })

# =============================================================================
# LANZADOR DEL SERVIDOR HTTP
# =============================================================================
def main():
    os.chdir(SCRIPT_DIR)
    WEB_DIR.mkdir(parents=True, exist_ok=True)
    
    server = HTTPServer(('127.0.0.1', PORT), ControlStationRequestHandler)
    url = f"http://127.0.0.1:{PORT}"
    
    print("=" * 80)
    print(" VIDEOCLÚ PUTREFACTOR A TORSIÓN -- ESTACIÓN DE CONTROL")
    print(f" Servidor iniciado en: {url}")
    print(" Presiona CTRL+C para detener el servidor.")
    print("=" * 80)
    
    # Intentar abrir ventana de app web
    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")

if __name__ == '__main__':
    main()
