import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// accountId arrives as a plain string here, not a JSON number — this
// DTO validates the non-file fields of a multipart/form-data request
// (multer puts them in req.body as strings), unlike every other DTO in
// this codebase which validates an already-JSON-parsed body.
export const ImportPreviewSchema = z.object({
  accountId: z.coerce.number().int(),
});

export class ImportPreviewDto extends createZodDto(ImportPreviewSchema) {}
