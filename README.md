# Documenso — edição FSTT

Fork do [Documenso](https://github.com/documenso/documenso) **v2.17.0** com a
identidade visual do **FSTT — Fundo Social dos Funcionários e Trabalhadores do
Sector dos Transportes**, em produção em `https://assinatura.fstt.co.ao`.

Licença: **AGPL-3.0**, como o original (ver `LICENSE`). Este repositório é
público para cumprir a cláusula 13 da AGPL: quem usa o serviço pela rede tem
direito ao código-fonte modificado. «Documenso» é marca do projecto Documenso;
esta instalação não é operada nem endossada por ele.

## O que muda face ao upstream

| Área | Ficheiros |
|---|---|
| Logótipo da aplicação (cabeçalho, login, assinatura, certificado, audit log) | `apps/remix/app/components/general/branding-logo.tsx`, `branding-logo-icon.tsx` |
| Favicon, ícones PWA, Open Graph, manifest | `apps/remix/public/*`, `packages/assets/site.webmanifest` |
| Logótipo dos e-mails | `apps/remix/public/static/logo.png` (servido em `/static/logo.png`) |
| Paleta (azul FSTT `#0066B2` em vez do verde) | `packages/ui/styles/theme.css`, `packages/lib/constants/theme.ts`, `packages/tailwind-config/index.cjs` — **manter os três em sincronia** |
| Títulos e metadados | `apps/remix/app/utils/meta.ts`, `routes/_recipient+/_layout.tsx`, `routes/_share+/share.$slug.tsx` |
| Rodapé dos e-mails, remetente por defeito, e-mail de suporte | `packages/email/template-components/template-footer.tsx`, `packages/lib/constants/email.ts`, `packages/lib/constants/app.ts` |
| Razão da assinatura embutida no PDF | `packages/signing/index.ts` (`Assinado via FSTT Assinaturas`) |
| Build | `.github/workflows/publish-fstt.yml` (workflows upstream removidos) |

Não se tocou nos catálogos de tradução (`packages/lib/translations`): as poucas
frases com «Documenso» que restam são de ecrãs administrativos.

## Construir e publicar

Nunca construir na VPS (1 vCPU). Em GitHub → Actions → **Publicar imagem FSTT**
→ *Run workflow* → indicar a revisão `N`. Sai `ghcr.io/salvaodorassuilo/documenso-fstt:2.17.0-fstt.N`
(linux/amd64).

## Aplicar na VPS

```bash
cd /opt/documenso
./backup.sh                               # obrigatório
cp compose.yml compose.yml.bak            # para rollback
sed -i 's|image: .*documenso.*|image: ghcr.io/salvaodorassuilo/documenso-fstt:2.17.0-fstt.N|' compose.yml
docker compose pull documenso && docker compose up -d documenso
docker compose logs -f documenso
```

Rollback: `cp compose.yml.bak compose.yml && docker compose up -d documenso`.
Só é seguro enquanto a versão base do Documenso for a mesma — uma base mais
recente corre migrações de BD que não revertem.

## Actualizar o Documenso

```bash
git fetch upstream --tags
git rebase vX.Y.Z          # resolver conflitos nos ficheiros da tabela acima
```

Depois confirmar os três ficheiros da paleta e voltar a publicar.
