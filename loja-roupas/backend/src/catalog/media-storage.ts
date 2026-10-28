import { join, resolve } from 'node:path';

export function getMediaDirectory() {
  return resolve(process.env.MEDIA_ROOT || join(process.cwd(), 'uploads'));
}
