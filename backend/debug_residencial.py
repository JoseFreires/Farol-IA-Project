import base64, json, os
os.environ['APP_TOKEN'] = 'test-token'
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
img = base64.b64encode(b'fake-image-data').decode('ascii')
res = client.post('/processar', headers={'Authorization':'Bearer test-token'}, json={'sessionId':'sess-01','contexto':'RESIDENCIAL','imagemBase64':img})
print('STATUS', res.status_code)
print(res.text)
