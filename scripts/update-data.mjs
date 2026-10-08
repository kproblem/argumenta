import { writeFile, mkdir } from 'node:fs/promises';

const OUT = new URL('../data/', import.meta.url);
const UA = 'argumenta-data-bot (+https://github.com/)';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function eurostatParo() {
  const url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_a'
    + '?geo=ES&geo=EU27_2020&sinceTimePeriod=2018&unit=PC_ACT&sex=T&age=Y15-74';
  const d = await getJson(url);
  const years = Object.keys(d.dimension.time.category.index);
  const geos = d.dimension.geo.category.index;
  const pick = (geo) => years.map((_, t) => d.value[geos[geo] * years.length + t] ?? null);
  return {
    id: 'paro-es-ue',
    titulo: 'Tasa de paro (% población activa 15-74)',
    fuente: 'Eurostat (une_rt_a)',
    url: 'https://ec.europa.eu/eurostat/databrowser/view/une_rt_a',
    etiquetas: years,
    series: [
      { nombre: 'España', datos: pick('ES') },
      { nombre: 'UE-27', datos: pick('EU27_2020') },
    ],
  };
}

async function bancoMundialPib() {
  const d = await getJson('https://api.worldbank.org/v2/country/ESP/indicator/NY.GDP.MKTP.KD.ZG?format=json&date=2018:2026');
  const rows = d[1].filter((r) => r.value !== null).sort((a, b) => a.date - b.date);
  return {
    id: 'pib-es',
    titulo: 'Crecimiento del PIB de España (% anual)',
    fuente: 'Banco Mundial (NY.GDP.MKTP.KD.ZG)',
    url: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG?locations=ES',
    etiquetas: rows.map((r) => r.date),
    series: [{ nombre: 'España', datos: rows.map((r) => Number(r.value.toFixed(2))) }],
  };
}

const FEEDS = [
  { medio: 'elDiario.es', url: 'https://www.eldiario.es/rss/economia/' },
];

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
};

async function noticias() {
  const out = [];
  for (const f of FEEDS) {
    try {
      const res = await fetch(f.url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(res.status);
      const xml = await res.text();
      const items = xml.match(/<item[\s\S]*?<\/item>/g) ?? [];
      for (const it of items.slice(0, 10)) {
        out.push({ medio: f.medio, titular: tag(it, 'title'), enlace: tag(it, 'link'), fecha: tag(it, 'pubDate') });
      }
    } catch (e) {
      console.warn(`RSS omitido (${f.medio}): ${e.message}`);
    }
  }
  return out;
}

await mkdir(OUT, { recursive: true });
const series = [];
for (const fn of [eurostatParo, bancoMundialPib]) {
  try {
    series.push(await fn());
  } catch (e) {
    console.warn(`Serie omitida (${fn.name}): ${e.message}`);
  }
}
if (series.length) {
  await writeFile(new URL('series.json', OUT), JSON.stringify({ actualizado: new Date().toISOString(), series }, null, 2) + '\n');
}
const news = await noticias();
if (news.length) {
  await writeFile(new URL('news.json', OUT), JSON.stringify({ actualizado: new Date().toISOString(), noticias: news }, null, 2) + '\n');
}
console.log(`series: ${series.length}, noticias: ${news.length}`);
