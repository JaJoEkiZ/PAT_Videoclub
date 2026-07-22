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
                    duracion TEXT
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

# =============================================================================
# 2. MOTOR DE HASHES SHA-256 Y USB
# =============================================================================
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
    ignore_dirs = {'.git', '__pycache__', 'System Volume Information', '$RECYCLE.BIN'}
    hashes = {}
    root_path = Path(root_dir)

    if not root_path.exists():
        return hashes

    for file_path in root_path.rglob('*'):
        if file_path.is_file():
            if any(part in ignore_dirs for part in file_path.parts):
                continue
            if file_path.name.lower() in {'thumbs.db', 'desktop.ini'}:
                continue
            rel_path = file_path.relative_to(root_path).as_posix()
            h = calculate_file_hash(file_path)
            if h:
                hashes[rel_path] = h
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

            master = CATALOGO_DIR / "VIENTO_LIMAY"
            if not master.exists():
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

            if not id_usb:
                id_usb = f"USB-{int(time.time()) % 1000:03d}"

            master_source = CATALOGO_DIR / "VIENTO_LIMAY"
            target_path = Path(target_drive)

            if not master_source.exists():
                self.send_json({"error": "Catálogo Máster no encontrado"}, status=500)
                return

            target_path.mkdir(parents=True, exist_ok=True)

            # Copiar estructura máster
            for item in master_source.iterdir():
                dst = target_path / item.name
                if item.is_dir():
                    if dst.exists():
                        shutil.rmtree(dst)
                    shutil.copytree(item, dst)
                else:
                    shutil.copy2(item, dst)

            # Calcular hashes
            hashes = generate_directory_hashes(target_path)

            metadata_json_path = target_path / "datos" / "metadata.json"
            metadata_js_path = target_path / "datos" / "metadata.js"

            with open(metadata_json_path, 'r', encoding='utf-8') as f:
                meta_data = json.load(f)

            meta_data['id_usb'] = id_usb
            meta_data['hashes'] = hashes

            with open(metadata_json_path, 'w', encoding='utf-8') as f:
                json.dump(meta_data, f, ensure_ascii=False, indent=2)

            js_content = f"window.VideotecaMetadata = {json.dumps(meta_data, ensure_ascii=False, indent=2)};"
            with open(metadata_js_path, 'w', encoding='utf-8') as f:
                f.write(js_content)

            self.send_json({"status": "OK", "id_usb": id_usb, "target_drive": str(target_path)})

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

        else:
            self.send_json({"error": "Endpoint POST desconocido"}, status=404)

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
