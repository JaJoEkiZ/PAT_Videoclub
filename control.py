#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===============================================================================
     J A J O   E K I Z   V J   --   E S T A C I O N   D E   C O N T R O L
          [ VIDEOTECA REGIONAL // SISTEMA MASTER DB v2.0 - CLI RETRO ]
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

# Configuración de colores ANSI (Terminal de Fósforo '90)
class Colors:
    GREEN = '\033[92m'
    BRIGHT_GREEN = '\033[1;92m'
    AMBER = '\033[93m'
    CYAN = '\033[96m'
    RED = '\033[91m'
    WHITE = '\033[97m'
    GRAY = '\033[90m'
    BG_DARK = '\033[40m'
    BOLD = '\033[1m'
    DIM = '\033[2m'
    RESET = '\033[0m'

def print_neon(text, color=Colors.GREEN, bold=False):
    style = Colors.BOLD if bold else ''
    print(f"{style}{color}{text}{Colors.RESET}")

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

# =============================================================================
# 1. BASE DE DATOS SQLITE (GESTOR DE PERSISTENCIA)
# =============================================================================
class DatabaseManager:
    def __init__(self, db_path="videoclub.db"):
        self.db_path = db_path
        self.init_db()

    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Tabla de Socios
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS socios (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    num_socio TEXT UNIQUE NOT NULL,
                    nombre TEXT NOT NULL,
                    telefono TEXT,
                    estado TEXT DEFAULT 'ACTIVO',
                    fecha_alta DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Tabla de Eventos
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS eventos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre_evento TEXT NOT NULL,
                    lugar TEXT NOT NULL,
                    fecha TEXT NOT NULL,
                    hora TEXT NOT NULL,
                    estado TEXT DEFAULT 'ACTIVO'
                )
            ''')
            
            # Tabla de Películas
            cursor.execute('''
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
            
            # Tabla de Préstamos
            cursor.execute('''
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
            
            # Sembrar datos por defecto si están vacías
            cursor.execute("SELECT COUNT(*) FROM peliculas")
            if cursor.fetchone()[0] == 0:
                cursor.execute('''
                    INSERT INTO peliculas (codigo_pelicula, titulo, director, anio, genero, duracion)
                    VALUES ('VL-1993', 'Viento Limay', 'JaJo EkiZ', 1993, 'Drama / Neo-Noir Patagónico', '1h 24min')
                ''')

            cursor.execute("SELECT COUNT(*) FROM eventos")
            if cursor.fetchone()[0] == 0:
                hoy = datetime.now().strftime("%Y-%m-%d")
                cursor.execute('''
                    INSERT INTO eventos (nombre_evento, lugar, fecha, hora, estado)
                    VALUES ('Muestra Lanzamiento Bariloche', 'Centro Cultural Limay, Bariloche', ?, '21:00', 'ACTIVO')
                ''', (hoy,))

            cursor.execute("SELECT COUNT(*) FROM socios")
            if cursor.fetchone()[0] == 0:
                cursor.execute('''
                    INSERT INTO socios (num_socio, nombre, telefono, estado)
                    VALUES ('SOC-001', 'VJ Patagónico (Socio Fundador)', '+54 294 400-1993', 'ACTIVO')
                ''')

            conn.commit()

# =============================================================================
# 2. MOTOR CRIPTOGRÁFICO DE HASHES (SHA-256)
# =============================================================================
class HashEngine:
    @staticmethod
    def calculate_file_hash(filepath):
        sha256 = hashlib.sha256()
        try:
            with open(filepath, 'rb') as f:
                while chunk := f.read(65536):
                    sha256.update(chunk)
            return sha256.hexdigest()
        except Exception as e:
            return None

    @staticmethod
    def generate_directory_hashes(root_dir, ignore_dirs=None):
        if ignore_dirs is None:
            ignore_dirs = {'.git', '__pycache__', 'System Volume Information', '$RECYCLE.BIN'}
        
        hashes = {}
        root_path = Path(root_dir)

        for file_path in root_path.rglob('*'):
            if file_path.is_file():
                if any(part in ignore_dirs for part in file_path.parts):
                    continue
                # Ignorar archivos temporales o del SO
                if file_path.name.lower() in {'thumbs.db', 'desktop.ini'}:
                    continue
                
                rel_path = file_path.relative_to(root_path).as_posix()
                file_hash = HashEngine.calculate_file_hash(file_path)
                if file_hash:
                    hashes[rel_path] = file_hash
        return hashes

# =============================================================================
# 3. GESTOR DE UNIDADES USB & VERIFICADOR DE INTEGRIDAD
# =============================================================================
class USBManager:
    def __init__(self, default_test_path=r"C:\Users\JaJo EkiZ\Desktop\Peli-Usb"):
        self.default_test_path = default_test_path

    def detect_drives(self):
        drives = []
        # En Windows probar de D: a Z:
        if os.name == 'nt':
            import ctypes
            bitmask = ctypes.windll.kernel32.GetLogicalDrives()
            for letter in 'EFGHIJKLMNOPQRSTUVWXYZ':
                if bitmask & (1 << (ord(letter) - ord('A'))):
                    drive_path = f"{letter}:\\"
                    if os.path.exists(drive_path):
                        drives.append(drive_path)
        
        # Siempre agregar la ruta local de pruebas si existe
        if os.path.exists(self.default_test_path):
            drives.append(self.default_test_path)
            
        return drives

    def inspect_drive(self, drive_path):
        metadata_file = Path(drive_path) / "datos" / "metadata.json"
        if not metadata_file.exists():
            return None
        
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                data['_drive_path'] = str(drive_path)
                return data
        except Exception as e:
            return None

# =============================================================================
# 4. APLICACIÓN PRINCIPAL DE CONSOLA (CLI RETRO)
# =============================================================================
class ControlStationApp:
    def __init__(self):
        # Asegurar que el CWD sea el directorio del script para encontrar videoclub.db
        script_dir = Path(__file__).parent.resolve()
        os.chdir(script_dir)
        
        self.db = DatabaseManager()
        self.usb_mgr = USBManager()
        self.active_event_id = 1 # Evento por defecto
        self.active_drive_path = r"C:\Users\JaJo EkiZ\Desktop\Peli-Usb"
        self.catalogo_dir = script_dir / "catalogo"

    def run(self):
        while True:
            clear_screen()
            self.print_header()
            self.print_menu()
            
            option = input(f"{Colors.BRIGHT_GREEN} SELECCIONE UNA OPCION [0-6]: {Colors.RESET}").strip()
            
            if option == '1':
                self.alquilar_pendrive()
            elif option == '2':
                self.devolucion_y_auditoria()
            elif option == '3':
                self.generar_nuevo_pendrive()
            elif option == '4':
                self.gestionar_socios()
            elif option == '5':
                self.gestionar_eventos()
            elif option == '6':
                self.ver_catalogo()
            elif option == '0':
                print_neon("\n [SISTEMA] Cerrando Estación de Control... ¡Hasta luego, VJ!", Colors.AMBER)
                break
            else:
                input(f"{Colors.RED} Opción inválida. Presione Enter para reintentar...{Colors.RESET}")

    def print_header(self):
        print_neon("================================================================================", Colors.BRIGHT_GREEN, bold=True)
        print_neon("           J A J O   E K I Z   V J   --   E S T A C I O N   D E   C O N T R O L", Colors.BRIGHT_GREEN, bold=True)
        print_neon("                [ VIDEOTECA REGIONAL // SISTEMA MASTER DB v2.0 ]", Colors.GREEN)
        print_neon("================================================================================", Colors.BRIGHT_GREEN, bold=True)
        
        # Obtener Evento Activo
        with self.db.get_connection() as conn:
            evt = conn.execute("SELECT * FROM eventos WHERE id = ?", (self.active_event_id,)).fetchone()
            evt_str = f"{evt['nombre_evento']} ({evt['lugar']} - {evt['fecha']} {evt['hora']})" if evt else "Ninguno Seleccionado"
        
        # Inspeccionar USB Activo
        usb_info = self.usb_mgr.inspect_drive(self.active_drive_path)
        if usb_info:
            id_usb = usb_info.get('id_usb', 'USB-001')
            titulo = usb_info.get('titulo', 'Desconocido')
            usb_str = f"{self.active_drive_path} [{id_usb}] // {titulo}"
        else:
            usb_str = f"{self.active_drive_path} [NO RECONOCIDO / SIN METADATA]"

        print(f" {Colors.WHITE}{Colors.BOLD}[EVENTO ACTIVO]:{Colors.RESET} {Colors.CYAN}{evt_str}{Colors.RESET}")
        print(f" {Colors.WHITE}{Colors.BOLD}[UNIDAD SELECCIONADA]:{Colors.RESET} {Colors.AMBER}{usb_str}{Colors.RESET}")
        print_neon("--------------------------------------------------------------------------------", Colors.GREEN)

    def print_menu(self):
        print(f"  {Colors.BRIGHT_GREEN}[1]{Colors.RESET} {Colors.WHITE}📼 ALQUILAR PENDRIVE A SOCIO (Registrar Salida){Colors.RESET}")
        print(f"  {Colors.BRIGHT_GREEN}[2]{Colors.RESET} {Colors.WHITE}🔄 REGISTRAR DEVOLUCION & AUDITAR INTEGRIDAD (SHA-256){Colors.RESET}")
        print(f"  {Colors.BRIGHT_GREEN}[3]{Colors.RESET} {Colors.WHITE}🛠️  GENERAR / GRABAR NUEVO PENDRIVE USB{Colors.RESET}")
        print(f"  {Colors.BRIGHT_GREEN}[4]{Colors.RESET} {Colors.WHITE}👤 GESTIONAR SOCIOS (Alta, Consulta, Fichas){Colors.RESET}")
        print(f"  {Colors.BRIGHT_GREEN}[5]{Colors.RESET} {Colors.WHITE}🎪 GESTIONAR EVENTOS (Seleccionar / Crear Evento Activo){Colors.RESET}")
        print(f"  {Colors.BRIGHT_GREEN}[6]{Colors.RESET} {Colors.WHITE}📁 CATALOGO MÁSTER DE PELÍCULAS{Colors.RESET}")
        print(f"  {Colors.BRIGHT_GREEN}[0]{Colors.RESET} {Colors.GRAY}🚪 SALIR DEL SISTEMA{Colors.RESET}")
        print_neon("================================================================================", Colors.GREEN)

    # -------------------------------------------------------------------------
    # OPCIÓN 1: ALQUILAR PENDRIVE
    # -------------------------------------------------------------------------
    def alquilar_pendrive(self):
        clear_screen()
        print_neon("=== [1] REGISTRAR SALIDA / ALQUILER DE PENDRIVE ===", Colors.BRIGHT_GREEN, bold=True)
        
        usb_data = self.usb_mgr.inspect_drive(self.active_drive_path)
        if not usb_data:
            print_neon("\n [ERROR] La unidad seleccionada no contiene un pendrive válido de la Videoteca.", Colors.RED)
            input("\n Presione Enter para volver...")
            return

        id_usb = usb_data.get('id_usb', 'USB-001')
        titulo = usb_data.get('titulo', 'Viento Limay')

        print(f"\n Pendrive a prestar: {Colors.CYAN}{id_usb}{Colors.RESET} // Película: {Colors.AMBER}{titulo}{Colors.RESET}")
        
        # Buscar película en la DB
        with self.db.get_connection() as conn:
            peli = conn.execute("SELECT * FROM peliculas WHERE titulo LIKE ?", (f"%{titulo}%",)).fetchone()
            if not peli:
                print_neon(" [ERROR] La película no existe en el catálogo de la Base de Datos.", Colors.RED)
                input("\n Presione Enter para volver...")
                return
            peli_id = peli['id']

            # Verificar si ya está alquilado sin devolver
            prestamo_activo = conn.execute(
                "SELECT * FROM prestamos WHERE id_usb = ? AND estado_prestamo = 'ALQUILADO'",
                (id_usb,)
            ).fetchone()

            if prestamo_activo:
                socio_act = conn.execute("SELECT * FROM socios WHERE id = ?", (prestamo_activo['socio_id'],)).fetchone()
                s_nombre = socio_act['nombre'] if socio_act else "Desconocido"
                print_neon(f"\n [ADVERTENCIA] Este pendrive figura ALQUILADO a {s_nombre} desde {prestamo_activo['fecha_prestamo']}.", Colors.AMBER)
                resp = input(" ¿Desea forzar un nuevo alquiler? (S/N): ").strip().upper()
                if resp != 'S':
                    return

            # Seleccionar Socio
            print_neon("\n --- SELECCIÓN DE SOCIO ---", Colors.GREEN)
            socios = conn.execute("SELECT * FROM socios WHERE estado = 'ACTIVO'").fetchall()
            for s in socios:
                print(f" [{s['id']}] {s['num_socio']} - {s['nombre']} ({s['telefono']})")
            
            socio_input = input("\n Ingrese ID o N° de Socio (o presione Enter para crear nuevo): ").strip()
            socio_id = None

            if not socio_input:
                # Crear socio al vuelo
                print_neon("\n --- NUEVO SOCIO ---", Colors.CYAN)
                nombre = input(" Nombre completo: ").strip()
                tel = input(" Teléfono: ").strip()
                if nombre:
                    num_soc = f"SOC-{int(time.time()) % 10000:04d}"
                    cur = conn.cursor()
                    cur.execute("INSERT INTO socios (num_socio, nombre, telefono) VALUES (?, ?, ?)", (num_soc, nombre, tel))
                    conn.commit()
                    socio_id = cur.lastrowid
                    print_neon(f" [OK] Socio registrado exitosamente con N° {num_soc}", Colors.GREEN)
                else:
                    print_neon(" Operación cancelada.", Colors.RED)
                    input("\n Presione Enter...")
                    return
            else:
                for s in socios:
                    if str(s['id']) == socio_input or s['num_socio'].upper() == socio_input.upper():
                        socio_id = s['id']
                        break

            if not socio_id:
                print_neon(" [ERROR] Socio no encontrado.", Colors.RED)
                input("\n Presione Enter...")
                return

            # Registrar préstamo
            conn.execute('''
                INSERT INTO prestamos (id_usb, socio_id, pelicula_id, evento_id, estado_prestamo)
                VALUES (?, ?, ?, ?, 'ALQUILADO')
            ''', (id_usb, socio_id, peli_id, self.active_event_id))
            conn.commit()

            print_neon(f"\n 🎉 ¡ALQUILER REGISTRADO EXITOSAMENTE!", Colors.BRIGHT_GREEN, bold=True)
            print(f" Pendrive {id_usb} entregado al socio ID #{socio_id}.")
            input("\n Presione Enter para continuar...")

    # -------------------------------------------------------------------------
    # OPCIÓN 2: DEVOLUCIÓN Y AUDITORÍA DE INTEGRIDAD (SHA-256)
    # -------------------------------------------------------------------------
    def devolucion_y_auditoria(self):
        clear_screen()
        print_neon("=== [2] DEVOLUCIÓN & AUDITORÍA DE INTEGRIDAD DE PENDRIVE ===", Colors.BRIGHT_GREEN, bold=True)
        
        usb_data = self.usb_mgr.inspect_drive(self.active_drive_path)
        if not usb_data:
            print_neon("\n [ERROR] No se detectó un pendrive válido en la unidad seleccionada.", Colors.RED)
            input("\n Presione Enter para volver...")
            return

        id_usb = usb_data.get('id_usb', 'USB-001')
        titulo = usb_data.get('titulo', 'Viento Limay')
        expected_hashes = usb_data.get('hashes', {})

        print(f"\n Auditando Pendrive: {Colors.CYAN}{id_usb}{Colors.RESET} // Obra: {Colors.AMBER}{titulo}{Colors.RESET}")
        print_neon(" Calculando hashes SHA-256 de archivos en tiempo real...", Colors.GRAY)
        print_neon("--------------------------------------------------------------------------------", Colors.GREEN)

        current_hashes = HashEngine.generate_directory_hashes(self.active_drive_path)
        
        ok_count = 0
        altered_count = 0
        missing_count = 0
        unknown_count = 0

        altered_files = []
        missing_files = []
        unknown_files = []

        # 1. Comparar archivos esperados
        for rel_path, exp_hash in expected_hashes.items():
            if rel_path in current_hashes:
                if current_hashes[rel_path] == exp_hash:
                    print(f" {Colors.GREEN}[OK]{Colors.RESET} {rel_path}")
                    ok_count += 1
                else:
                    print(f" {Colors.RED}[ALTERADO]{Colors.RESET} {rel_path}")
                    altered_count += 1
                    altered_files.append(rel_path)
            else:
                print(f" {Colors.AMBER}[FALTANTE]{Colors.RESET} {rel_path}")
                missing_count += 1
                missing_files.append(rel_path)

        # 2. Buscar archivos no catalogados (extraños / parásitos)
        for rel_path in current_hashes:
            if rel_path not in expected_hashes:
                print(f" {Colors.CYAN}[EXTRAÑO]{Colors.RESET} {rel_path}")
                unknown_count += 1
                unknown_files.append(rel_path)

        print_neon("--------------------------------------------------------------------------------", Colors.GREEN)
        print(f" Resumen: {Colors.GREEN}{ok_count} Correctos{Colors.RESET} | {Colors.RED}{altered_count} Alterados{Colors.RESET} | {Colors.AMBER}{missing_count} Faltantes{Colors.RESET} | {Colors.CYAN}{unknown_count} Extraños{Colors.RESET}")

        # Determinar estado global
        estado_global = "INTEGRO" if (altered_count == 0 and missing_count == 0) else "CORRUPTO"

        # Registrar devolución en SQLite
        with self.db.get_connection() as conn:
            conn.execute('''
                UPDATE prestamos 
                SET fecha_devolucion = CURRENT_TIMESTAMP, 
                    estado_prestamo = 'DEVUELTO', 
                    estado_integridad = ?
                WHERE id_usb = ? AND estado_prestamo = 'ALQUILADO'
            ''', (estado_global, id_usb))
            conn.commit()

        print_neon(f"\n [SISTEMA] Devolución asentada en DB con estado: {estado_global}", Colors.BRIGHT_GREEN)

        # Si hay errores, ofrecer restauración
        if estado_global == "CORRUPTO" or unknown_count > 0:
            print_neon("\n ⚠️  Se detectaron anomalías en el almacenamiento del pendrive.", Colors.AMBER, bold=True)
            resp = input(" ¿Desea ejecutar la RESTAURACIÓN AUTOMÁTICA desde el Catálogo Máster? (S/N): ").strip().upper()
            
            if resp == 'S':
                self.restaurar_pendrive(self.active_drive_path, titulo, altered_files, missing_files, unknown_files)

        input("\n Presione Enter para continuar...")

    def restaurar_pendrive(self, drive_path, titulo, altered_files, missing_files, unknown_files):
        print_neon("\n === RESTAURANDO PENDRIVE DESDE MÁSTER ===", Colors.CYAN, bold=True)
        master_folder = self.catalogo_dir / "VIENTO_LIMAY"
        
        if not master_folder.exists():
            print_neon(" [ERROR] No se encuentra la carpeta máster en el catálogo.", Colors.RED)
            return

        target_path = Path(drive_path)

        # 1. Copiar faltantes y alterados
        for rel_file in (altered_files + missing_files):
            src = master_folder / rel_file
            dst = target_path / rel_file
            if src.exists():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
                print(f" {Colors.GREEN}[REPARADO]{Colors.RESET} {rel_file}")

        # 2. Eliminar archivos extraños
        for rel_file in unknown_files:
            file_to_del = target_path / rel_file
            if file_to_del.exists():
                try:
                    file_to_del.unlink()
                    print(f" {Colors.GRAY}[ELIMINADO PARÁSITO]{Colors.RESET} {rel_file}")
                except Exception as e:
                    pass

        print_neon("\n ✅ ¡RESTAURACIÓN COMPLETADA! El pendrive ha vuelto al 100% de integridad.", Colors.BRIGHT_GREEN, bold=True)

    # -------------------------------------------------------------------------
    # OPCIÓN 3: GENERAR / GRABAR NUEVO PENDRIVE USB
    # -------------------------------------------------------------------------
    def generar_nuevo_pendrive(self):
        clear_screen()
        print_neon("=== [3] GENERAR / GRABAR NUEVO PENDRIVE USB ===", Colors.BRIGHT_GREEN, bold=True)
        
        print(f"\n Unidad Destino Actual: {Colors.CYAN}{self.active_drive_path}{Colors.RESET}")
        cambiar = input(" ¿Desea cambiar la unidad destino? (S/N): ").strip().upper()
        if cambiar == 'S':
            drives = self.usb_mgr.detect_drives()
            print("\n Unidades disponibles:")
            for idx, d in enumerate(drives):
                print(f" [{idx+1}] {d}")
            try:
                sel = int(input("\n Seleccione número de unidad: ")) - 1
                if 0 <= sel < len(drives):
                    self.active_drive_path = drives[sel]
            except ValueError:
                pass

        id_usb = input(f"\n Ingrese Identificador Único para el Pendrive (ej. USB-002): ").strip()
        if not id_usb:
            id_usb = f"USB-{int(time.time()) % 1000:03d}"

        master_source = self.catalogo_dir / "VIENTO_LIMAY"
        if not master_source.exists():
            print_neon(" [ERROR] No existe el catálogo máster de la película.", Colors.RED)
            input("\n Presione Enter...")
            return

        target = Path(self.active_drive_path)
        print_neon(f"\n Copiando estructura base y película hacia {target}...", Colors.AMBER)
        
        # Copiar todo el contenido máster
        for item in master_source.iterdir():
            dst = target / item.name
            if item.is_dir():
                if dst.exists():
                    shutil.rmtree(dst)
                shutil.copytree(item, dst)
            else:
                shutil.copy2(item, dst)
            print(f" {Colors.GREEN}[COPIADO]{Colors.RESET} {item.name}")

        # Calcular hashes SHA-256 del nuevo pendrive
        print_neon("\n Generando firmas criptográficas SHA-256...", Colors.GRAY)
        hashes = HashEngine.generate_directory_hashes(target)

        # Actualizar metadata.json
        metadata_json_path = target / "datos" / "metadata.json"
        metadata_js_path = target / "datos" / "metadata.js"
        
        with open(metadata_json_path, 'r', encoding='utf-8') as f:
            meta_data = json.load(f)

        meta_data['id_usb'] = id_usb
        meta_data['hashes'] = hashes

        # Escribir metadata.json actualizado
        with open(metadata_json_path, 'w', encoding='utf-8') as f:
            json.dump(meta_data, f, ensure_ascii=False, indent=2)

        # Escribir metadata.js (para fallback de navegador offline)
        js_content = f"window.VideotecaMetadata = {json.dumps(meta_data, ensure_ascii=False, indent=2)};"
        with open(metadata_js_path, 'w', encoding='utf-8') as f:
            f.write(js_content)

        print_neon(f"\n 🎉 ¡PENDRIVE {id_usb} GENERADO EXITOSAMENTE Y SELLADO CON HASHES SHA-256!", Colors.BRIGHT_GREEN, bold=True)
        input("\n Presione Enter para continuar...")

    # -------------------------------------------------------------------------
    # OPCIÓN 4: GESTIONAR SOCIOS
    # -------------------------------------------------------------------------
    def gestionar_socios(self):
        clear_screen()
        print_neon("=== [4] GESTIÓN DE SOCIOS DEL VIDEOCLUB ===", Colors.BRIGHT_GREEN, bold=True)
        
        with self.db.get_connection() as conn:
            socios = conn.execute("SELECT * FROM socios ORDER BY id DESC").fetchall()
            print(f"\n Lista de Socios Registrados ({len(socios)}):")
            print_neon("--------------------------------------------------------------------------------", Colors.GREEN)
            for s in socios:
                print(f" ID #{s['id']} | N°: {Colors.CYAN}{s['num_socio']}{Colors.RESET} | Nombre: {Colors.WHITE}{s['nombre']}{Colors.RESET} | Tel: {s['telefono']} | Estado: {Colors.GREEN}{s['estado']}{Colors.RESET}")
            print_neon("--------------------------------------------------------------------------------", Colors.GREEN)

            print("\n [1] Registrar Nuevo Socio")
            print(" [0] Volver al Menú Principal")
            op = input("\n Opción: ").strip()
            
            if op == '1':
                nombre = input(" Nombre completo: ").strip()
                tel = input(" Teléfono: ").strip()
                if nombre:
                    num_soc = f"SOC-{int(time.time()) % 10000:04d}"
                    conn.execute("INSERT INTO socios (num_socio, nombre, telefono) VALUES (?, ?, ?)", (num_soc, nombre, tel))
                    conn.commit()
                    print_neon(f" [OK] Socio {nombre} registrado como {num_soc}", Colors.GREEN)
                    input("\n Presione Enter...")

    # -------------------------------------------------------------------------
    # OPCIÓN 5: GESTIONAR EVENTOS
    # -------------------------------------------------------------------------
    def gestionar_eventos(self):
        clear_screen()
        print_neon("=== [5] GESTIÓN DE EVENTOS Y MUESTRAS TERRITORIALES ===", Colors.BRIGHT_GREEN, bold=True)
        
        with self.db.get_connection() as conn:
            eventos = conn.execute("SELECT * FROM eventos ORDER BY id DESC").fetchall()
            print(f"\n Eventos Registrados:")
            print_neon("--------------------------------------------------------------------------------", Colors.GREEN)
            for e in eventos:
                activo = " (ACTIVO EN SESION)" if e['id'] == self.active_event_id else ""
                print(f" [{e['id']}] {Colors.CYAN}{e['nombre_evento']}{Colors.RESET}{Colors.BRIGHT_GREEN}{activo}{Colors.RESET}")
                print(f"     Lugar: {e['lugar']} | Fecha: {e['fecha']} | Hora: {e['hora']}")
            print_neon("--------------------------------------------------------------------------------", Colors.GREEN)

            print("\n [1] Seleccionar Evento Activo para la Sesión")
            print(" [2] Crear Nuevo Evento")
            print(" [0] Volver al Menú Principal")
            op = input("\n Opción: ").strip()
            
            if op == '1':
                try:
                    sel = int(input(" Ingrese ID del evento: "))
                    if any(e['id'] == sel for e in eventos):
                        self.active_event_id = sel
                        print_neon(" [OK] Evento activo actualizado.", Colors.GREEN)
                except ValueError:
                    pass
            elif op == '2':
                nombre = input(" Nombre del Evento (ej. Muestra Cine Bariloche): ").strip()
                lugar = input(" Lugar / Dirección: ").strip()
                fecha = input(" Fecha (YYYY-MM-DD) [Enter para Hoy]: ").strip()
                if not fecha:
                    fecha = datetime.now().strftime("%Y-%m-%d")
                hora = input(" Hora (HH:MM): ").strip()
                if not hora:
                    hora = "20:00"
                
                if nombre:
                    cur = conn.cursor()
                    cur.execute("INSERT INTO eventos (nombre_evento, lugar, fecha, hora) VALUES (?, ?, ?, ?)", (nombre, lugar, fecha, hora))
                    conn.commit()
                    self.active_event_id = cur.lastrowid
                    print_neon(f" [OK] Evento '{nombre}' creado y seleccionado como activo.", Colors.GREEN)
                    input("\n Presione Enter...")

    # -------------------------------------------------------------------------
    # OPCIÓN 6: VER CATÁLOGO MÁSTER
    # -------------------------------------------------------------------------
    def ver_catalogo(self):
        clear_screen()
        print_neon("=== [6] CATÁLOGO MÁSTER DE PELÍCULAS REGIONALES ===", Colors.BRIGHT_GREEN, bold=True)
        
        with self.db.get_connection() as conn:
            pelis = conn.execute("SELECT * FROM peliculas").fetchall()
            print_neon("--------------------------------------------------------------------------------", Colors.GREEN)
            for p in pelis:
                print(f" Código: {Colors.CYAN}{p['codigo_pelicula']}{Colors.RESET} | Título: {Colors.BRIGHT_GREEN}{p['titulo']}{Colors.RESET}")
                print(f" Director: {p['director']} ({p['anio']}) | Género: {p['genero']} | Duración: {p['duracion']}")
            print_neon("--------------------------------------------------------------------------------", Colors.GREEN)
            input("\n Presione Enter para regresar al menú...")

# =============================================================================
# PUNTO DE ENTRADA
# =============================================================================
if __name__ == '__main__':
    app = ControlStationApp()
    app.run()
