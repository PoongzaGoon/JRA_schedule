import { createApp } from '../src/server.js';

let app;
export default function handler(req, res) {
  try { app ??= createApp(process.env); }
  catch {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ message: '서버 저장소 설정을 확인하세요.' }));
    return;
  }
  return app.handler(req, res);
}
