# MOOC: El proceso del análisis fenomenológico

Sitio web del MOOC del seminario de trabajo de grado (Maestría en Educación, UPTC), publicado con [Quartz](https://quartz.jzhao.xyz).

- Las notas están en `content/`, con la misma estructura de carpetas del vault de Obsidian.
- Para actualizar el sitio, reemplaza las notas en `content/` y sube los cambios: GitHub Actions lo vuelve a publicar solo.

## Cómo se publica

Las notas de `content/` no se tocan: siguen igual que en el vault. Antes de construir el sitio, `scripts/publicar.mjs` hace una copia en `contenido-publicado/` y en esa copia:

- da a cada nota del curso una dirección corta: `/introduccion`, `/seccion-1` … `/seccion-8`, `/rubrica-y-plantillas`;
- añade la marca «Sección N de 8 · Dedicación», las tarjetas Anterior / Siguiente al final de cada sección y la ruta del curso en la portada (las horas y preguntas salen de la tabla de la introducción);
- después de construir, deja redirecciones desde las direcciones antiguas (`/40-cursos/maestría-en-educación…`) para que los enlaces ya compartidos sigan funcionando.

Para verlo en tu computador: `npm run vista-previa`. Para generar la carpeta `public/` como en GitHub: `npm run publicar`.

Si agregas una nota nueva al curso con el mismo formato de nombre (`AAAAMMDDhhmm Sección 9 - …`), queda como `/seccion-9` sin hacer nada más.

El diseño (colores y tipografías de Investigium) está en `quartz/styles/custom.scss` y en `quartz.config.yaml`.
