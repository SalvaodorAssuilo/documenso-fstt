import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { i18n, type MessageDescriptor } from '@lingui/core';

export const APP_NAME = 'FSTT Assinaturas';

export const appMetaTags = (title?: MessageDescriptor) => {
  const description =
    'Plataforma de assinatura digital do FSTT — Fundo Social dos Funcionários e Trabalhadores do Sector dos Transportes.';

  return [
    {
      title: title ? `${i18n._(title)} - ${APP_NAME}` : APP_NAME,
    },
    {
      name: 'description',
      content: description,
    },
    {
      name: 'author',
      content: 'FSTT',
    },
    {
      name: 'robots',
      content: 'noindex, nofollow',
    },
    {
      property: 'og:title',
      content: APP_NAME,
    },
    {
      property: 'og:description',
      content: description,
    },
    {
      property: 'og:image',
      content: `${NEXT_PUBLIC_WEBAPP_URL()}/opengraph-image.jpg`,
    },
    {
      property: 'og:type',
      content: 'website',
    },
    {
      name: 'twitter:card',
      content: 'summary_large_image',
    },
    {
      name: 'twitter:description',
      content: description,
    },
    {
      name: 'twitter:image',
      content: `${NEXT_PUBLIC_WEBAPP_URL()}/opengraph-image.jpg`,
    },
  ];
};
