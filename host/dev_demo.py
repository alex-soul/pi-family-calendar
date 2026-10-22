"""Isolated DEV broker + fake display + actual adapter, with a small test console.
Never load household credentials or connect this broker to Home Assistant.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from common import LocalServer, atomic_json
from display import Display
from test_controls import FakeHardware
from mqtt_adapter import device_id
import paho.mqtt.client as mqtt

root = Path(tempfile.mkdtemp(prefix='calendar-mqtt-dev-'))
root.chmod(0o755)
(root/'mosquitto.conf').write_text('listener 1883 0.0.0.0\nallow_anonymous true\npersistence false\n')
broker = subprocess.Popen(['mosquitto','-c',str(root/'mosquitto.conf')])
hardware = FakeHardware()
display = Display(root/'display.json', hardware)
display.start()
token = secrets.token_hex(32)
(root/'display-token').write_text(token)
(root/'display-token').chmod(0o600)
def serve_display():
    server = LocalServer(root/'display.sock',token,[os.getuid()],display.handle)
    while True: server.once()
threading.Thread(target=serve_display,daemon=True).start()

class ThemeProxy(BaseHTTPRequestHandler):
    def log_message(self,*_): pass
    def proxy(self):
        try:
            if self.path!='/api/kiosk-theme': raise ValueError()
            size=int(self.headers.get('Content-Length','0'))
            if size>1024: raise ValueError()
            request=Request('http://calendar:3000/api/kiosk-theme',data=self.rfile.read(size) if self.command=='POST' else None,
                headers={'Authorization':self.headers.get('Authorization',''),'Host':'127.0.0.1:8775','Origin':'http://127.0.0.1:8775','Content-Type':'application/json'})
            with urlopen(request,timeout=3) as response: body=response.read(4096)
            self.send_response(200);self.end_headers();self.wfile.write(body)
        except Exception: self.send_response(503);self.end_headers()
    do_GET=proxy
    do_POST=proxy
proxy=ThreadingHTTPServer(('127.0.0.1',8180),ThemeProxy)
threading.Thread(target=proxy.serve_forever,daemon=True).start()
atomic_json(root/'broker.json',{'username':'fictional','password':'fictional'})
identifier=device_id(root/'identity.json')
topic=f'pi-family-calendar/{identifier}'
config={'displaySocket':str(root/'display.sock'),'displayTokenFile':str(root/'display-token'),
    'brokerCredentials':str(root/'broker.json'),'host':'127.0.0.1','port':1883,'tls':False,'allowPlaintextLan':True,
    'identityFile':str(root/'identity.json'),'replayFile':str(root/'replay.sqlite'),'statusFile':str(root/'status.json'),
    'themeUrl':'http://127.0.0.1:8180/api/kiosk-theme','themeTokenFile':'/calendar-data/dev-theme-token'}
atomic_json(root/'adapter.json',config)
states={}
client=mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,protocol=mqtt.MQTTv5)
def connected(client,*_): client.subscribe(topic+'/#')
def message(client,userdata,msg):
    if '/command/' not in msg.topic: states[msg.topic.removeprefix(topic+'/')]=msg.payload.decode()
client.on_connect=connected;client.on_message=message
for attempt in range(30):
    try: client.connect('127.0.0.1',1883,30);break
    except OSError: time.sleep(.1)
client.loop_start()
adapter=subprocess.Popen(['python3','mqtt_adapter.py',str(root/'adapter.json')])
csrf=secrets.token_hex(16)
class Console(BaseHTTPRequestHandler):
    def log_message(self,*_): pass
    def do_GET(self):
        if self.path=='/state':
            body=json.dumps({'state':states.get('theme/state'),'available':states.get('theme/available'),'adapter':states.get('available')}).encode()
            self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body);return
        page='''<!doctype html><meta name="viewport" content="width=device-width"><title>Calendar DEV MQTT</title>
<style>body{font:18px system-ui;background:#151b22;color:#eee;max-width:650px;margin:50px auto;padding:20px}button,a{font:inherit;padding:14px;margin:8px;color:inherit}button{background:#34463e;border:1px solid #69786d;border-radius:10px}pre{white-space:pre-wrap}</style>
<h1>Calendar DEV MQTT</h1><p>Isolated broker and fictional display. These buttons publish through the actual MQTT adapter.</p>
<p><a href="http://127.0.0.1:8775/?kiosk=1" target="_blank">Open DEV kiosk</a></p><p>Keep the kiosk visible in a separate window. Ordinary calendar tabs keep their own theme.</p>
<button onclick="send('Warm')">Warm</button><button onclick="send('Dark')">Dark</button><p id="result"></p><pre id="state"></pre>
<script>async function send(theme){const r=await fetch('/',{method:'POST',headers:{'X-DEV-CSRF':'TOKEN','Content-Type':'application/json'},body:JSON.stringify({theme})});document.querySelector('#result').textContent=r.ok?'MQTT command sent; waiting for kiosk confirmation.':'Command failed';}async function state(){document.querySelector('#state').textContent=JSON.stringify(await(await fetch('/state')).json(),null,2);}setInterval(state,1000);state();</script>'''.replace('TOKEN',csrf)
        self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(page.encode())
    def do_POST(self):
        if self.headers.get('X-DEV-CSRF')!=csrf: self.send_response(403);self.end_headers();return
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size>1024: raise ValueError()
            value=json.loads(self.rfile.read(size))['theme']
            if value not in ('Warm','Dark'): raise ValueError()
            client.publish(topic+'/command/theme',json.dumps({'id':secrets.token_hex(16),'issued':time.time(),'value':value}),retain=False)
            self.send_response(200);self.end_headers()
        except Exception: self.send_response(400);self.end_headers()
try: ThreadingHTTPServer(('0.0.0.0',8080),Console).serve_forever()
finally: adapter.terminate();broker.terminate();client.disconnect()
