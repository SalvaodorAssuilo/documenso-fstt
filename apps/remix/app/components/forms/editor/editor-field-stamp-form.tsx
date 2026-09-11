import {
  FIELD_STAMP_META_DEFAULT_VALUES,
  type TStampFieldMeta,
  type ZStampFieldMeta,
} from '@documenso/lib/types/field-meta';
import { Button } from '@documenso/ui/primitives/button';
import { Trans } from '@lingui/react/macro';
import { type ChangeEvent, useRef, useState } from 'react';
import type { z } from 'zod';

/**
 * Stamps are stored inline on the field as a base64 data URI, so keep them small.
 */
const MAX_STAMP_DIMENSION_PX = 600;
const MAX_STAMP_BYTES = 512 * 1024;

type EditorFieldStampFormProps = {
  value: z.input<typeof ZStampFieldMeta> | undefined;
  onValueChange: (value: TStampFieldMeta) => void;
};

/**
 * Downscales the selected image and returns it as a PNG data URI so that
 * transparency is preserved.
 */
const readImageAsResizedDataUri = async (file: File): Promise<string> =>
  await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Could not read the selected file'));

    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error('Could not decode the selected image'));

      image.onload = () => {
        const scale = Math.min(1, MAX_STAMP_DIMENSION_PX / Math.max(image.width, image.height));

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext('2d');

        if (!context) {
          reject(new Error('Could not process the selected image'));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL('image/png'));
      };

      image.src = String(reader.result);
    };

    reader.readAsDataURL(file);
  });

export const EditorFieldStampForm = ({ value = { type: 'stamp' }, onValueChange }: EditorFieldStampFormProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);

  const imageBase64 = value.imageBase64;

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    event.target.value = '';

    if (!file) {
      return;
    }

    setError(null);

    try {
      const dataUri = await readImageAsResizedDataUri(file);

      if (dataUri.length > MAX_STAMP_BYTES) {
        setError('The image is too large, please use a smaller one.');
        return;
      }

      onValueChange({
        ...FIELD_STAMP_META_DEFAULT_VALUES,
        ...value,
        type: 'stamp',
        imageBase64: dataUri,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the selected image');
    }
  };

  return (
    <fieldset className="mt-2 flex flex-col gap-2">
      <div className="flex h-32 items-center justify-center rounded-md border border-border border-dashed bg-background p-2">
        {imageBase64 ? (
          <img src={imageBase64} alt="Stamp" className="h-full w-full object-contain" />
        ) : (
          <p className="text-muted-foreground text-xs">
            <Trans>No stamp image yet</Trans>
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void onFileChange(event)}
      />

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          {imageBase64 ? <Trans>Replace image</Trans> : <Trans>Upload image</Trans>}
        </Button>

        {imageBase64 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onValueChange({
                ...FIELD_STAMP_META_DEFAULT_VALUES,
                ...value,
                type: 'stamp',
                imageBase64: undefined,
              })
            }
          >
            <Trans>Remove</Trans>
          </Button>
        )}
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}

      <p className="text-muted-foreground text-xs">
        <Trans>A PNG with a transparent background works best. The image is stored on the field itself.</Trans>
      </p>
    </fieldset>
  );
};
