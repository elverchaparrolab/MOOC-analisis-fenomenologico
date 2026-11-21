#!/usr/bin/env node
// Prepara el contenido del vault para publicarlo con direcciones cortas.
//
//   node scripts/publicar.mjs preparar      copia content/ a contenido-publicado/
//   node scripts/publicar.mjs redirecciones crea en public/ las redirecciones
//                                           desde las direcciones antiguas
//
// La carpeta content/ queda tal cual sale del vault de Obsidian. Este script
// trabaja sobre una copia: renombra las notas del curso (seccion-1, seccion-2,
// introduccion, rubrica-y-plantillas), actualiza los enlaces internos que
// apuntan a ellas y añade la navegación del curso (marca "Sección N de 8",
// tarjetas Anterior / Siguiente y la ruta de la portada). El texto académico
// no se modifica.

import fs from "node:fs"
import path from "node:path"

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const ORIGEN = path.join(RAIZ, "content")
const DESTINO = path.join(RAIZ, "contenido-publicado")
const PUBLICO = path.join(RAIZ, "public")
const CARPETA_CURSO = "40 Cursos/Maestría en educación. - Seminario trabajo de grado/MOOC - Análisis fenomenológico"
const MANIFIESTO = path.join(DESTINO, ".redirecciones.json")

// ---------- utilidades ----------
const leer = (f) => fs.readFileSync(f, "utf8")
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const html = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function listar(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? listar(p, base) : [path.relative(base, p)]
  })
}

function separarFrontmatter(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!m) return { fm: "", cuerpo: texto }
  return { fm: m[1], cuerpo: texto.slice(m[0].length) }
}

function tituloDe(fm, respaldo) {
  const m = fm.match(/^title:\s*(?:"(.*)"|'(.*)'|(.*))$/m)
  return (m && (m[1] ?? m[2] ?? m[3]).trim()) || respaldo
}

// Slug que Quartz genera para una ruta (espacios por guiones, sin .md)
const slugQuartz = (rel) => rel.replace(/\.md$/, "").replace(/ /g, "-")

// ---------- nombres nuevos ----------
function nombreNuevo(base) {
  const sec = base.match(/^\d{12} Sección (\d+) - /)
  if (sec) return `seccion-${sec[1]}`
  if (/^\d{12} MOOC - /.test(base)) return "introduccion"
  if (/^Rúbrica y plantillas$/.test(base)) return "rubrica-y-plantillas"
  return null
}

function preparar() {
  fs.rmSync(DESTINO, { recursive: true, force: true })
  const archivos = listar(ORIGEN)

  // 1. Mapa de notas del curso: nombre del vault -> nombre publicado
  const mapa = new Map() // base antigua -> { nuevo, rel }
  for (const rel of archivos) {
    if (!rel.endsWith(".md")) continue
    if (path.dirname(rel) !== CARPETA_CURSO) continue
    const base = path.basename(rel, ".md")
    const nuevo = nombreNuevo(base)
    if (nuevo) mapa.set(base, { nuevo, rel })
  }

  // 2. Datos de cada nota: título y orden
  const notas = [...mapa.values()].map((n) => {
    const { fm } = separarFrontmatter(leer(path.join(ORIGEN, n.rel)))
    const num = n.nuevo.match(/^seccion-(\d+)$/)
    const orden = n.nuevo === "introduccion" ? 0 : num ? Number(num[1]) : 99
    return { ...n, titulo: tituloDe(fm, n.nuevo), orden }
  })
  notas.sort((a, b) => a.orden - b.orden)
  const secciones = notas.filter((n) => n.nuevo.startsWith("seccion-"))

  // 3. Dedicación y pregunta de cada sección, tomadas de la tabla de la introducción
  const ruta = new Map()
  const intro = notas.find((n) => n.nuevo === "introduccion")
  if (intro) {
    for (const linea of leer(path.join(ORIGEN, intro.rel)).split("\n")) {
      const m = linea.match(/^\|\s*\[\[\d{12} Sección (\d+).*?\]\]\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/)
      if (m) ruta.set(`seccion-${m[1]}`, { pregunta: m[2], horas: m[3] })
    }
  }

  // 4. Reescribe enlaces internos hacia los nombres nuevos
  const reescribir = (texto) => {
    for (const [base, { nuevo }] of mapa) {
      texto = texto.replace(new RegExp(`(!?\\[\\[)${escapar(base)}(?=[|\\\\#\\]])`, "g"), `$1${nuevo}`)
    }
    return texto
  }

  const tarjetaNav = (n, etiqueta, clase) =>
    `<a class="internal ${clase}" href="/${n.nuevo}" data-no-popover="true"><span class="pie-etiqueta">${etiqueta}</span><span class="pie-titulo">${html(n.titulo)}</span></a>`

  for (const rel of archivos) {
    const src = path.join(ORIGEN, rel)
    const base = path.basename(rel, ".md")
    const info = rel.endsWith(".md") ? mapa.get(base) : null
    const relDestino = info && path.dirname(rel) === CARPETA_CURSO ? `${info.nuevo}.md` : rel
    const dst = path.join(DESTINO, relDestino)
    fs.mkdirSync(path.dirname(dst), { recursive: true })

    if (!rel.endsWith(".md")) {
      fs.copyFileSync(src, dst)
      continue
    }

    let { fm, cuerpo } = separarFrontmatter(leer(src))
    cuerpo = reescribir(cuerpo)

    // Marca la línea de navegación superior (← Sección 3 · Índice · Sección 5 →)
    cuerpo = cuerpo.replace(/^(←\s.*)$/m, `<span class="nav-curso-marca"></span>$1`)

    if (info) {
      const i = notas.findIndex((n) => n.nuevo === info.nuevo)
      const nota = notas[i]
      const datos = ruta.get(nota.nuevo)
      if (nota.nuevo.startsWith("seccion-")) {
        const n = nota.nuevo.split("-")[1]
        const meta = [`Sección ${n} de ${secciones.length}`]
        if (datos) meta.push(`Dedicación: ${datos.horas}`)
        cuerpo = `<p class="meta-seccion">${meta.join(" · ")}</p>\n\n` + cuerpo
      } else if (nota.nuevo === "introduccion") {
        cuerpo = `<p class="meta-seccion">Empiece aquí</p>\n\n` + cuerpo
      }
      const prev = notas[i - 1]
      const next = notas[i + 1]
      const partes = []
      partes.push(prev ? tarjetaNav(prev, "← Anterior", "pie-prev") : `<a class="internal pie-prev" href="/" data-no-popover="true"><span class="pie-etiqueta">← Portada</span><span class="pie-titulo">Presentación del curso</span></a>`)
      if (next) partes.push(tarjetaNav(next, "Siguiente →", "pie-next"))
      cuerpo = cuerpo.trimEnd() + `\n\n<nav class="pie-seccion" aria-label="Navegación del curso">${partes.join("")}</nav>\n`
    }

    if (rel === "index.md") {
      // Título corto en la portada; el curso y el autor pasan a una línea aparte
      fm = fm.replace(/^title:.*$/m, 'title: "El proceso del análisis fenomenológico"')
      cuerpo =
        `<p class="meta-seccion">MOOC · Maestría en Educación · UPTC</p>\n\n` +
        portada(cuerpo, notas, secciones, ruta).trimStart() +
        `\n\n<p class="autor-curso">Curso preparado por Elver Chaparro Cardozo.</p>\n`
    }

    fs.writeFileSync(dst, (fm ? `---\n${fm}\n---\n` : "") + cuerpo)
  }

  // 5. Manifiesto de redirecciones: dirección antigua -> nueva
  const redirecciones = {}
  const agregar = (antigua, nueva) => {
    redirecciones[antigua] = nueva
    redirecciones[antigua.toLowerCase()] = nueva
  }
  for (const n of notas) agregar(slugQuartz(n.rel), n.nuevo)
  const partes = CARPETA_CURSO.split("/")
  for (let k = 1; k <= partes.length; k++) agregar(slugQuartz(partes.slice(0, k).join("/")) + "/index", "")
  fs.writeFileSync(MANIFIESTO, JSON.stringify(redirecciones, null, 2))
  console.log(`Contenido preparado en ${path.relative(RAIZ, DESTINO)}/ (${notas.length} notas del curso renombradas)`)
}

// Portada: convierte la lista de secciones en la ruta del curso
function portada(cuerpo, notas, secciones, ruta) {
  const horas = [...ruta.values()]
    .map((r) => parseFloat(r.horas))
    .filter((h) => !Number.isNaN(h))
    .reduce((a, b) => a + b, 0)

  // Botones de inicio
  cuerpo = cuerpo.replace(/^(\*\*\[\[introduccion\|.*)$/m, `<span class="acciones-marca"></span>$1`)

  const tarjetas = secciones
    .map((s) => {
      const n = s.nuevo.split("-")[1]
      const d = ruta.get(s.nuevo)
      const titulo = s.titulo.replace(/^Sección \d+\.\s*/, "")
      return `<li><a class="internal tarjeta-seccion" href="/${s.nuevo}" data-no-popover="true"><span class="tarjeta-num">${n}</span><span class="tarjeta-cuerpo"><span class="tarjeta-titulo">${html(titulo)}</span>${d ? `<span class="tarjeta-pregunta">${html(d.pregunta)}</span>` : ""}</span>${d ? `<span class="tarjeta-horas">${html(d.horas)}</span>` : ""}</a></li>`
    })
    .join("")

  const resumen = `<p class="resumen-curso">${secciones.length} secciones${horas ? ` · unas ${horas} horas de trabajo` : ""} · un proyecto final con rúbrica</p>`
  const bloque = `## Ruta del curso\n\n${resumen}\n\n<ol class="ruta-curso">${tarjetas}</ol>\n`

  // Sustituye la sección "## Secciones" (hasta el siguiente encabezado o el final)
  const lineas = cuerpo.split("\n")
  const ini = lineas.findIndex((l) => /^## Secciones\s*$/.test(l))
  if (ini < 0) return cuerpo
  let fin = lineas.findIndex((l, k) => k > ini && /^## /.test(l))
  if (fin < 0) fin = lineas.length
  return [...lineas.slice(0, ini), bloque, ...lineas.slice(fin)].join("\n")
}

function redirecciones() {
  const mapa = JSON.parse(leer(MANIFIESTO))
  let n = 0
  for (const [antigua, nueva] of Object.entries(mapa)) {
    const archivo = path.join(PUBLICO, antigua + ".html")
    if (fs.existsSync(archivo) && !fs.readFileSync(archivo, "utf8").includes("data-redireccion")) {
      // Quartz ya generó una página aquí; no la pisamos
      continue
    }
    const profundidad = antigua.split("/").length - 1
    const destino = (profundidad ? "../".repeat(profundidad) : "./") + nueva
    fs.mkdirSync(path.dirname(archivo), { recursive: true })
    fs.writeFileSync(
      archivo,
      `<!doctype html><html lang="es"><head><meta charset="utf-8" data-redireccion><title>Redirigiendo…</title>` +
        `<link rel="canonical" href="${destino}"><meta name="robots" content="noindex">` +
        `<meta http-equiv="refresh" content="0; url=${destino}">` +
        `<script>location.replace(${JSON.stringify(destino)}+location.hash)</script></head>` +
        `<body><p>Esta página cambió de dirección: <a href="${destino}">ir a la nueva</a>.</p></body></html>`,
    )
    n++
  }
  console.log(`${n} redirecciones creadas en public/`)
}

const orden = process.argv[2]
if (orden === "preparar") preparar()
else if (orden === "redirecciones") redirecciones()
else {
  console.error("Uso: node scripts/publicar.mjs preparar|redirecciones")
  process.exit(1)
}
