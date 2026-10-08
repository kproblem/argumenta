import Fuse from '../vendor/fuse.7.5.0.min.mjs';

const PALETAS = {
  light: {
    fondo: '#fff',
    texto: '#1a1a1a',
    grid: 'rgba(0, 0, 0, 0.1)',
    series: [
      { color: '#0b4a8f', dash: [], punto: 'circle' },
      { color: '#a33a00', dash: [8, 4], punto: 'triangle' },
    ],
  },
  dark: {
    fondo: '#181c25',
    texto: '#e0e3e7',
    grid: 'rgba(255, 255, 255, 0.15)',
    series: [
      { color: '#5cb0ff', dash: [], punto: 'circle' },
      { color: '#ffa66b', dash: [8, 4], punto: 'triangle' },
    ],
  },
};

function app() {
  return {
    q: '',
    seccion: '',
    fichas: [],
    series: {},
    noticias: [],
    fecha: '',
    cargando: true,
    tema: 'dark',
    aviso: '',
    fuse: null,

    async init() {
      this.tema = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      const get = (f) => fetch(`data/${f}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const [fichas, series, news] = await Promise.all([get('fichas.json'), get('series.json'), get('news.json')]);
      this.fichas = fichas?.fichas ?? [];
      this.series = Object.fromEntries((series?.series ?? []).map((s) => [s.id, s]));
      this.fecha = series?.actualizado?.slice(0, 10) ?? '';
      this.noticias = news?.noticias ?? [];
      this.fuse = new Fuse(this.fichas, {
        keys: ['mito', 'claves', 'etiquetas', 'seccion'],
        threshold: 0.15,
        ignoreLocation: true,
      });
      this.cargando = false;
      if (location.hash) this.$nextTick(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
    },

    get secciones() {
      return [...new Set(this.fichas.map((f) => f.seccion))];
    },

    get filtradas() {
      if (!this.fuse) return [];
      const base = this.q.trim() ? this.fuse.search(this.q.trim()).map((r) => r.item) : this.fichas;
      return this.seccion ? base.filter((f) => f.seccion === this.seccion) : base;
    },

    get resumen() {
      if (this.cargando) return '';
      const n = this.filtradas.length;
      if (n === 0) return 'Sin resultados.';
      return n === 1 ? '1 ficha encontrada.' : `${n} fichas encontradas.`;
    },

    descripcion(s) {
      const tramos = s.series.map((d) => {
        const i = d.datos.map((v) => v !== null);
        const ini = i.indexOf(true);
        const fin = i.lastIndexOf(true);
        return `${d.nombre}: ${d.datos[ini]} en ${s.etiquetas[ini]} y ${d.datos[fin]} en ${s.etiquetas[fin]}`;
      });
      return `Gráfico. ${s.titulo}. ${tramos.join('. ')}. Tabla de datos disponible debajo.`;
    },

    configGrafico(s, p, extra = {}) {
      return {
        type: s.series.length > 1 ? 'line' : 'bar',
        data: {
          labels: s.etiquetas,
          datasets: s.series.map((d, i) => {
            const c = p.series[i % p.series.length];
            return {
              label: d.nombre,
              data: d.datos,
              borderColor: c.color,
              backgroundColor: c.color,
              borderDash: c.dash,
              pointStyle: c.punto,
              pointRadius: 5,
              borderWidth: 3,
            };
          }),
        },
        options: {
          ...extra,
          plugins: {
            title: { display: true, text: s.titulo, color: p.texto, font: { size: 15 } },
            legend: { labels: { usePointStyle: true, color: p.texto, font: { size: 14 } } },
          },
          scales: {
            x: { ticks: { color: p.texto, font: { size: 13 } }, grid: { color: p.grid } },
            y: { ticks: { color: p.texto, font: { size: 13 } }, grid: { color: p.grid } },
          },
        },
      };
    },

    dibujar(canvas, id) {
      const s = this.series[id];
      if (!s || Chart.getChart(canvas)) return;
      const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
      new Chart(canvas, this.configGrafico(s, PALETAS[this.tema], { animation: reducido ? false : undefined }));
    },

    alternarTema() {
      this.tema = this.tema === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = this.tema;
      try {
        localStorage.setItem('tema', this.tema);
      } catch {}
      const p = PALETAS[this.tema];
      Object.values(Chart.instances).forEach((c) => {
        c.data.datasets.forEach((d, i) => {
          d.borderColor = d.backgroundColor = p.series[i % p.series.length].color;
        });
        c.options.plugins.title.color = p.texto;
        c.options.plugins.legend.labels.color = p.texto;
        ['x', 'y'].forEach((e) => {
          c.options.scales[e].ticks.color = p.texto;
          c.options.scales[e].grid.color = p.grid;
        });
        c.update('none');
      });
    },

    enlace(f) {
      return `${location.origin}${location.pathname}#${f.id}`;
    },

    texto(f) {
      return `MITO: ${f.mito}\n\nLA REALIDAD:\n${f.claves.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nFuentes: ${f.fuentes.map((s) => s.url).join(' ')}\n\nMás en: ${this.enlace(f)}`;
    },

    async copiar(f) {
      try {
        await navigator.clipboard.writeText(this.texto(f));
        this.anunciar('Argumento copiado al portapapeles.');
      } catch {
        this.anunciar('No se pudo copiar el argumento.');
      }
    },

    whatsapp(f) {
      return `https://wa.me/?text=${encodeURIComponent(this.texto(f))}`;
    },

    anunciar(msg) {
      this.aviso = '';
      setTimeout(() => (this.aviso = msg), 50);
    },

    async tarjeta(f) {
      this.anunciar('Generando tarjeta…');
      try {
        const src = document.getElementById(f.id);
        const clone = src.cloneNode(true);
        clone.querySelectorAll('template, details, .acciones').forEach((e) => e.remove());
        [clone, ...clone.querySelectorAll('*')].forEach((e) => {
          [...e.attributes].forEach((a) => (a.name === 'id' || /^(x-|[:@])/.test(a.name)) && e.removeAttribute(a.name));
        });
        const p = PALETAS[this.tema];
        clone.setAttribute('data-theme', this.tema);
        const chart = src.querySelector('canvas');
        if (chart) {
          const img = new Image();
          img.alt = chart.getAttribute('aria-label') ?? '';
          const copia = document.createElement('canvas');
          copia.width = chart.clientWidth;
          copia.height = chart.clientHeight;
          const aparte = document.createElement('div');
          aparte.style.cssText = 'position:fixed;left:-9999px;top:0';
          aparte.appendChild(copia);
          document.body.appendChild(aparte);
          const claro = new Chart(copia, this.configGrafico(this.series[f.serie], p, { responsive: false, animation: false }));
          img.src = copia.toDataURL();
          await img.decode();
          img.width = copia.width;
          img.height = copia.height;
          claro.destroy();
          aparte.remove();
          img.style.cssText = 'display:block;width:100%;height:auto';
          clone.querySelector('canvas').replaceWith(img);
        }
        // TODO: marca provisional, sustituir por logo/nombre definitivo
        const marca = document.createElement('p');
        marca.textContent = `Argumenta · ${this.enlace(f).replace(/^https?:\/\//, '')}`;
        marca.style.cssText = `margin:16px 0 0;font-weight:700;font-size:14px;color:${p.texto};text-align:right`;
        clone.appendChild(marca);
        clone.style.cssText = `width:640px;margin:0;box-sizing:border-box;padding:24px;background:${p.fondo};color:${p.texto}`;
        const caja = document.createElement('div');
        caja.style.cssText = 'position:fixed;left:-9999px;top:0';
        caja.appendChild(clone);
        document.body.appendChild(caja);
        let blob;
        try {
          blob = await htmlToImage.toBlob(clone, { backgroundColor: p.fondo, pixelRatio: 2, skipFonts: true });
        } finally {
          caja.remove();
        }
        const file = new File([blob], `${f.id}.png`, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text: this.texto(f) });
          this.anunciar('Tarjeta lista para compartir.');
          return;
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
        this.anunciar('Tarjeta descargada.');
      } catch (e) {
        this.anunciar(e?.name === 'AbortError' ? 'Compartir cancelado.' : 'No se pudo generar la tarjeta.');
      }
    },
  };
}

window.app = app;
