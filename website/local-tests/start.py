from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
import webbrowser
root = Path(__file__).resolve().parent.parent
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(root)))
url = f'http://127.0.0.1:{server.server_port}'
print(f'Galen: {url}\nCtrl+C to stop.', flush=True)
webbrowser.open(url)
try: server.serve_forever()
except KeyboardInterrupt: pass
finally: server.server_close()
