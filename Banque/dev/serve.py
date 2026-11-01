#!/usr/bin/env python3
"""Serveur de test local pour Banque (aucune dépendance).

Lance : python3 Banque/dev/serve.py   puis ouvre http://localhost:8765/Banque/

Uniquement en local :
- injecte l'URL Supabase dans la CSP (__SUPABASE_HTTP__ / __SUPABASE_WSS__), comme scripts/build-pages.js ;
- sert shared/supabase-config.js avec les valeurs de dev/.env.local (ignoré par git) ;
- remplace protect.js (portail) par dev/protect-local.js : écran de connexion e-mail / mot de passe.
En production (GitHub Pages) rien de tout cela n'existe : le portail reste obligatoire.
"""
import http.server
import json
import os
import socketserver

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PORT = int(os.environ.get('PORT', '8765'))


def load_env():
    env = {}
    path = os.path.join(HERE, '.env.local')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    env[k.strip()] = v.strip()
    return env


ENV = load_env()
URL = ENV.get('SUPABASE_URL', '').rstrip('/')
KEY = ENV.get('SUPABASE_ANON_KEY', '')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _send(self, body, ctype):
        data = body.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/shared/supabase-config.js':
            return self._send('window.SUPABASE_CONFIG = %s;\n' % json.dumps({'url': URL, 'anonKey': KEY}),
                              'application/javascript; charset=utf-8')
        if path == '/protect.js':
            with open(os.path.join(HERE, 'protect-local.js'), encoding='utf-8') as f:
                return self._send(f.read(), 'application/javascript; charset=utf-8')
        if path.startswith('/Banque/') and (path.endswith('/') or path.endswith('.html') or path.endswith('.js')):
            fs_path = os.path.join(ROOT, path.lstrip('/'))
            if os.path.isdir(fs_path):
                fs_path = os.path.join(fs_path, 'index.html')
            if os.path.isfile(fs_path):
                with open(fs_path, encoding='utf-8') as f:
                    raw = f.read()
                host = URL.replace('https://', '')
                raw = raw.replace('__SUPABASE_HTTP__', URL).replace('__SUPABASE_WSS__', 'wss://' + host)
                ctype = 'text/html; charset=utf-8' if fs_path.endswith('.html') else 'application/javascript; charset=utf-8'
                return self._send(raw, ctype)
        return super().do_GET()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    if not URL or not KEY:
        print('dev/.env.local manquant (SUPABASE_URL / SUPABASE_ANON_KEY)')
    print('Banque : http://localhost:%d/Banque/' % PORT)
    Server(('127.0.0.1', PORT), Handler).serve_forever()
