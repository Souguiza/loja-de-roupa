import { BadRequestException, Controller, Post, ServiceUnavailableException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { getMediaDirectory } from './media-storage';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
type UploadedImage = { buffer: Buffer; mimetype: string };

function isWebp(buffer: Buffer) {
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP' || buffer.readUInt32LE(4) + 8 !== buffer.length) return false;
  let offset = 12;
  let hasImageChunk = false;
  while (offset + 8 <= buffer.length) {
    const kind = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const end = offset + 8 + size;
    if (end > buffer.length) return false;
    if (['VP8 ', 'VP8L', 'VP8X'].includes(kind) && size > 0) hasImageChunk = true;
    offset = end + (size % 2);
  }
  return offset === buffer.length && hasImageChunk;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner', 'staff')
@Controller('admin/media')
export class AdminMediaController {
  @Post('images')
  @UseInterceptors(FileInterceptor('image', {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    fileFilter: (_request, file, callback) => callback(null, file.mimetype === 'image/webp'),
  }))
  async uploadImage(@UploadedFile() file: UploadedImage | undefined) {
    if (!file || file.mimetype !== 'image/webp' || !isWebp(file.buffer)) {
      throw new BadRequestException('Envie uma imagem WebP válida.');
    }
    if (process.env.NODE_ENV === 'production' && !process.env.MEDIA_PUBLIC_URL?.startsWith('https://')) {
      throw new ServiceUnavailableException('Configure MEDIA_PUBLIC_URL com o endereço HTTPS público da API.');
    }

    const filename = `${randomUUID()}.webp`;
    const directory = getMediaDirectory();
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, filename), file.buffer, { flag: 'wx', mode: 0o644 });

    const defaultPublicUrl = `http://localhost:${process.env.PORT || 3001}`;
    const publicUrl = (process.env.MEDIA_PUBLIC_URL || defaultPublicUrl).replace(/\/+$/, '');
    return { url: `${publicUrl}/media/${filename}` };
  }
}
