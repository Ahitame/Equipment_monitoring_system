import { dateTime, emptyChart, escapeHtml, number } from './ui.js';

const renderedCharts = new Map();
let resizeTimer;
// При изменении ширины окна перерисовываем график без нового запроса к API.
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    for (const [container, data] of renderedCharts) {
      if (!container.isConnected || !container.querySelector('.chart-svg')) {
        renderedCharts.delete(container);
        continue;
      }
      renderChart(container, data.measurements, data.equipment);
    }
  }, 150);
});

// График рисуется обычным SVG: не нужны библиотеки или внешние CDN.
export function renderChart(container, measurements, equipment = {}) {
  const points = measurements
    .filter(item => item.temperature !== null && Number.isFinite(item.temperature) && Number.isFinite(Date.parse(item.received_at)))
    .map(item => ({ ...item, time: Date.parse(item.received_at) }))
    .sort((left, right) => left.time - right.time || left.id - right.id);

  if (!points.length) {
    renderedCharts.delete(container);
    emptyChart(container, 'За этот период измерений нет', 'Выберите другой период или добавьте новое показание');
    return;
  }

  const width = Math.max(280, Math.min(container.clientWidth || 1100, 1100));
  const height = 270;
  const padding = { top: 16, right: width < 500 ? 42 : 24, bottom: 39, left: 54 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const thresholds = [
    { value: equipment.warning_limit, type: 'warning', label: 'Предупреждение' },
    { value: equipment.critical_limit, type: 'critical', label: 'Критический порог' },
  ].filter(item => Number.isFinite(item.value));
  let minimum = points.reduce((value, point) => Math.min(value, point.temperature), Infinity);
  let maximum = points.reduce((value, point) => Math.max(value, point.temperature), -Infinity);
  thresholds.forEach(item => { minimum = Math.min(minimum, item.value); maximum = Math.max(maximum, item.value); });
  const span = Math.max(maximum - minimum, 10);
  const roughStep = (span * 1.25) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 5, 10].find(value => value * magnitude >= roughStep) * magnitude;
  const yMin = Math.floor((minimum - span * 0.08) / step) * step;
  const yMax = Math.ceil((maximum + span * 0.08) / step) * step;
  if (![span, step, yMin, yMax, yMax - yMin].every(Number.isFinite) || step <= 0 || yMax <= yMin) {
    renderedCharts.delete(container);
    emptyChart(container, 'Слишком большой диапазон температуры', 'Точные значения доступны в таблице измерений');
    return;
  }
  const startTime = points[0].time;
  const endTime = points.at(-1).time;
  const x = time => startTime === endTime ? padding.left + plotWidth / 2 : padding.left + (time - startTime) / (endTime - startTime) * plotWidth;
  const y = value => padding.top + (yMax - value) / (yMax - yMin) * plotHeight;
  const coordinates = points.map(point => `${x(point.time).toFixed(2)},${y(point.temperature).toFixed(2)}`);
  const baseline = padding.top + plotHeight;
  let grid = '';
  for (let index = 0; index < 20; index++) {
    const value = yMin + index * step;
    if (!Number.isFinite(value) || value > yMax + step / 10) break;
    const position = y(value);
    grid += `<line class="chart-grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${position}" y2="${position}"/><text class="chart-axis-label" x="${padding.left - 12}" y="${position + 4}" text-anchor="end">${escapeHtml(number(value))}°</text>`;
  }

  const multiDay = endTime - startTime >= 86400000;
  const tickCount = Math.min(points.length, 7, Math.max(2, Math.floor(plotWidth / 125) + 1));
  const ticks = new Set();
  for (let index = 0; index < tickCount; index++) ticks.add(Math.round(index * (points.length - 1) / Math.max(tickCount - 1, 1)));
  let labels = '';
  ticks.forEach(index => {
    const point = points[index];
    const label = new Intl.DateTimeFormat('ru-RU', multiDay ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' }).format(new Date(point.time));
    labels += `<line class="chart-grid-line" x1="${x(point.time)}" x2="${x(point.time)}" y1="${padding.top}" y2="${baseline}"/><text class="chart-axis-label" x="${x(point.time)}" y="${height - 12}" text-anchor="middle">${escapeHtml(label)}</text>`;
  });

  const thresholdLines = thresholds.map(item => `<line class="chart-threshold ${item.type}" x1="${padding.left}" x2="${width - padding.right}" y1="${y(item.value)}" y2="${y(item.value)}"><title>${item.label}: ${number(item.value)} °C</title></line>`).join('');
  const area = points.length > 1 ? `<polygon class="chart-area" points="${x(startTime)},${baseline} ${coordinates.join(' ')} ${x(endTime)},${baseline}"/>` : '';
  const circles = points.map((point, index) => `<circle class="chart-point" cx="${x(point.time)}" cy="${y(point.temperature)}" r="${points.length > 150 ? 2 : 4}" tabindex="0" data-point="${index}" aria-label="${escapeHtml(`${dateTime(point.received_at)}: ${number(point.temperature)} °C`)}"><title>${escapeHtml(`${dateTime(point.received_at)} · ${number(point.temperature)} °C`)}</title></circle>`).join('');

  container.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="История температуры: ${points.length} измерений. Время по горизонтальной оси, температура в градусах Цельсия по вертикальной.">${grid}${labels}${area}${thresholdLines}<polyline class="chart-line" points="${coordinates.join(' ')}"/>${circles}</svg><div class="chart-tooltip" hidden></div>`;
  renderedCharts.set(container, { measurements, equipment });
  const tooltip = container.querySelector('.chart-tooltip');
  container.querySelectorAll('[data-point]').forEach(circle => {
    const show = () => {
      const point = points[Number(circle.dataset.point)];
      tooltip.innerHTML = `${escapeHtml(dateTime(point.received_at))}<strong>${escapeHtml(number(point.temperature))} °C</strong>${point.pressure !== null && point.pressure !== undefined ? `Давление: ${escapeHtml(number(point.pressure))} бар` : ''}`;
      tooltip.hidden = false;
      const bounds = container.getBoundingClientRect();
      const pointBounds = circle.getBoundingClientRect();
      tooltip.style.left = `${Math.max(0, Math.min(pointBounds.left - bounds.left + 12, bounds.width - tooltip.offsetWidth))}px`;
      tooltip.style.top = `${Math.max(0, pointBounds.top - bounds.top - tooltip.offsetHeight - 10)}px`;
    };
    circle.addEventListener('pointerenter', show);
    circle.addEventListener('focus', show);
    circle.addEventListener('pointerleave', () => { tooltip.hidden = true; });
    circle.addEventListener('blur', () => { tooltip.hidden = true; });
  });
}
