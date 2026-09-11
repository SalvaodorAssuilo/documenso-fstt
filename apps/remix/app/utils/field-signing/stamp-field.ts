import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import type { TFieldStamp } from '@documenso/lib/types/field';
import type { TSignEnvelopeFieldValue } from '@documenso/trpc/server/envelope-router/sign-envelope-field.types';
import { FieldType } from '@prisma/client';

type HandleStampFieldClickOptions = {
  field: TFieldStamp;
};

/**
 * Stamp fields carry a fixed image configured by the sender, so there is no
 * dialog to open - clicking the field simply inserts (or clears) the image.
 */
// biome-ignore lint/suspicious/useAwait: keeps the same async signature as the other field click handlers
export const handleStampFieldClick = async (
  options: HandleStampFieldClickOptions,
): Promise<Extract<TSignEnvelopeFieldValue, { type: typeof FieldType.STAMP }> | null> => {
  const { field } = options;

  if (field.type !== FieldType.STAMP) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Invalid field type',
    });
  }

  if (field.inserted) {
    return {
      type: FieldType.STAMP,
      value: null,
    };
  }

  const imageBase64 = field.fieldMeta?.imageBase64;

  if (!imageBase64) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'This stamp field has no image configured',
    });
  }

  return {
    type: FieldType.STAMP,
    value: imageBase64,
  };
};
