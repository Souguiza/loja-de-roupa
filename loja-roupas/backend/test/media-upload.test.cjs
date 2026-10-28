const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { validateSync } = require('class-validator');
const { AdminMediaController } = require('../dist/catalog/admin-media.controller');
const { ProductImageDto } = require('../dist/catalog/dto/catalog.dto');

function webpBytes() {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUInt32LE(10, 16);
  return buffer;
}

test('admin image upload stores randomized WebP media and returns its public URL', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agape-media-'));
  const previous = { root: process.env.MEDIA_ROOT, publicUrl: process.env.MEDIA_PUBLIC_URL, mode: process.env.NODE_ENV, port: process.env.PORT };
  process.env.MEDIA_ROOT = directory;
  delete process.env.MEDIA_PUBLIC_URL;
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3001';
  try {
    const result = await new AdminMediaController().uploadImage({ buffer: webpBytes(), mimetype: 'image/webp' });
    assert.match(result.url, /^http:\/\/localhost:3001\/media\/[0-9a-f-]+\.webp$/);
    const stored = await readFile(path.join(directory, path.basename(new URL(result.url).pathname)));
    assert.deepEqual(stored, webpBytes());
  } finally {
    if (previous.root === undefined) delete process.env.MEDIA_ROOT; else process.env.MEDIA_ROOT = previous.root;
    if (previous.publicUrl === undefined) delete process.env.MEDIA_PUBLIC_URL; else process.env.MEDIA_PUBLIC_URL = previous.publicUrl;
    if (previous.mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.mode;
    if (previous.port === undefined) delete process.env.PORT; else process.env.PORT = previous.port;
    await rm(directory, { recursive: true, force: true });
  }
});

test('admin image upload rejects forged file signatures and production without an HTTPS media URL', async () => {
  const controller = new AdminMediaController();
  await assert.rejects(controller.uploadImage({ buffer: Buffer.from('not an image'), mimetype: 'image/webp' }), (error) => error.getStatus() === 400);
  const previous = { publicUrl: process.env.MEDIA_PUBLIC_URL, mode: process.env.NODE_ENV };
  delete process.env.MEDIA_PUBLIC_URL;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(controller.uploadImage({ buffer: webpBytes(), mimetype: 'image/webp' }), (error) => error.getStatus() === 503);
  } finally {
    if (previous.publicUrl === undefined) delete process.env.MEDIA_PUBLIC_URL; else process.env.MEDIA_PUBLIC_URL = previous.publicUrl;
    if (previous.mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.mode;
  }
});

test('catalog images allow local HTTP previews and require HTTPS for remote URLs', () => {
  const validate = (url) => validateSync(Object.assign(new ProductImageDto(), { url }));
  assert.equal(validate('http://localhost:3001/media/photo.webp').length, 0);
  assert.equal(validate('http://127.0.0.1:3001/media/photo.webp').length, 0);
  assert.equal(validate('https://cdn.example.com/photo.webp').length, 0);
  assert.ok(validate('http://cdn.example.com/photo.webp').length > 0);
});
