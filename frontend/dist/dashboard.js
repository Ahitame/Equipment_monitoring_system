import { api, dateTime, emptyChart, escapeHtml, icon, latestMeasurement, markUpdated, number, openEquipmentDialog, openMeasurementDialog, setConnection, showError, statusBadge, toast } from './ui.js';
import { renderChart } from './chart.js';

const body = document.getElementById('equipment-body');
const search = document.getElementById('search');
const statusFilter = document.getElementById('status-filter');
const resetFilters = document.getElementById('reset-filters');
const refreshButton = document.getElementById('refresh-dashboard');
const chartSelect = document.getElementById('chart-equipment');
const chartPeriod = document.getElementById('chart-period');
const chart = document.getElementById('dashboard-chart');
const pageError = document.getElementById('page-error');
let equipment = [];
let requestVersion = 0;
let chartVersion = 0;
let loading = false;
let searchTimer;

// Ограничиваем число одновременных запросов показаний для большой таблицы.
async function getLatestReadings(items) {
  const readings = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        readings.set(item.id, { measurement: await latestMeasurement(item.id) });
      } catch (error) {
        readings.set(item.id, { error });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
  return readings;
}

function renderRows(items, readings) {
  if (!items.length) {
    const filtered = search.value.trim() || statusFilter.value;
    body.innerHTML = `<tr><td colspan="6" class="table-empty"><div class="empty-state"><span class="empty-icon">${icon(filtered ? 'search' : 'server')}</span><p class="empty-title">${filtered ? 'Оборудование не найдено' : 'Пока нет оборудования'}</p><p class="empty-description">${filtered ? 'Измените название или выберите другое состояние' : 'Добавьте первое устройство, чтобы начать мониторинг'}</p>${filtered ? '<button class="button button-secondary button-small" type="button" data-reset>Сбросить фильтры</button>' : '<button class="button button-primary button-small" type="button" data-add>Добавить оборудование</button>'}</div></td></tr>`;
    return;
  }
  body.innerHTML = items.map(item => {
    const result = readings.get(item.id);
    const measurement = result?.measurement;
    const time = measurement ? dateTime(measurement.received_at, { year: undefined }) : '';
    const temperature = result?.error ? '<span class="muted">Недоступно</span>' : `${number(measurement?.temperature)}${measurement ? ' °C' : ''}`;
    const pressure = result?.error ? '<span class="muted">Недоступно</span>' : `${number(measurement?.pressure)}${measurement?.pressure !== null && measurement?.pressure !== undefined ? ' бар' : ''}`;
    return `<tr><td><a class="device-link" href="./device.html?id=${item.id}"><span class="device-name">${escapeHtml(item.name)}</span><span class="device-meta">${escapeHtml(item.serial_number)}</span></a></td><td>${escapeHtml(item.equipment_type)}</td><td><div class="reading-value">${temperature}</div>${measurement ? `<div class="reading-time">${escapeHtml(time)}</div>` : `<span class="device-meta">${result?.error ? 'Повторите обновление' : 'Нет показаний'}</span>`}</td><td><span class="reading-value">${pressure}</span></td><td>${statusBadge(item.status)}</td><td><div class="row-actions"><button class="button button-ghost button-icon button-small" type="button" data-measurement="${item.id}" aria-label="Добавить показание: ${escapeHtml(item.name)}" title="Добавить показание">${icon('plus')}</button><a class="button button-ghost button-icon button-small" href="./device.html?id=${item.id}" aria-label="История: ${escapeHtml(item.name)}" title="Открыть устройство">${icon('arrow-right')}</a></div></td></tr>`;
  }).join('');
}

function fillChartSelect() {
  const selected = chartSelect.value;
  chartSelect.replaceChildren(...equipment.map(item => new Option(item.name, String(item.id))));
  chartSelect.disabled = !equipment.length;
  if (!equipment.length) chartSelect.add(new Option('Нет устройств', ''));
  else if (equipment.some(item => String(item.id) === selected)) chartSelect.value = selected;
}

async function loadChart() {
  const version = ++chartVersion;
  const item = equipment.find(item => String(item.id) === chartSelect.value);
  const link = document.getElementById('chart-detail-link');
  if (!item) {
    link.hidden = true;
    document.getElementById('chart-title').textContent = 'История температуры';
    document.getElementById('chart-description').textContent = 'Измерения выбранного устройства';
    emptyChart(chart, 'Здесь появится история температуры', 'Добавьте оборудование и отправьте первое показание');
    return;
  }
  document.getElementById('chart-title').textContent = `История температуры · ${item.name}`;
  document.getElementById('chart-description').textContent = 'Температура и настроенные пороги · время по часовому поясу браузера';
  link.href = `./device.html?id=${item.id}`;
  link.hidden = false;
  const end = new Date();
  const start = new Date(end.getTime() - Number(chartPeriod.value) * 3600000);
  const params = new URLSearchParams({ date_from: start.toISOString(), date_to: end.toISOString() });
  try {
    const history = await api(`/equipment/${item.id}/measurements/?${params}`);
    if (version !== chartVersion) return;
    renderChart(chart, history, item);
  } catch (error) {
    if (version !== chartVersion) return;
    emptyChart(chart, 'Не удалось загрузить историю', error.message);
  }
}

async function loadDashboard() {
  const version = ++requestVersion;
  loading = true;
  body.setAttribute('aria-busy', 'true');
  refreshButton.disabled = true;
  const params = new URLSearchParams();
  if (search.value.trim()) params.set('search', search.value.trim());
  if (statusFilter.value) params.set('status', statusFilter.value);
  resetFilters.hidden = !params.size;
  try {
    const listPromise = api(`/equipment/${params.size ? `?${params}` : ''}`);
    const [statistics, items, allItems] = await Promise.all([
      api('/equipment/statistics'),
      listPromise,
      params.size ? api('/equipment/') : listPromise,
    ]);
    const readings = await getLatestReadings(items);
    if (version !== requestVersion) return;
    equipment = allItems;
    ['total', 'normal', 'warning', 'critical', 'unknown'].forEach(key => {
      document.getElementById(`stat-${key}`).textContent = number(statistics[key], 0);
    });
    renderRows(items, readings);
    fillChartSelect();
    document.getElementById('equipment-count').textContent = params.size ? `Найдено: ${items.length} из ${statistics.total}` : `Всего устройств: ${items.length}`;
    const partialFailure = [...readings.values()].some(value => value.error);
    showError(pageError, partialFailure ? 'Часть показаний не удалось загрузить. Нажмите «Обновить», чтобы повторить запрос.' : '');
    setConnection(true);
    markUpdated();
    await loadChart();
  } catch (error) {
    if (version !== requestVersion) return;
    showError(pageError, error.message);
    setConnection(false);
    if (!equipment.length) {
      body.innerHTML = `<tr><td colspan="6" class="table-empty"><p class="empty-title">Не удалось загрузить оборудование</p><p class="empty-description">Проверьте подключение и нажмите «Обновить»</p></td></tr>`;
      document.getElementById('equipment-count').textContent = 'Данные недоступны';
    }
  } finally {
    if (version === requestVersion) {
      loading = false;
      body.setAttribute('aria-busy', 'false');
      refreshButton.disabled = false;
    }
  }
}

function clearFilters() {
  clearTimeout(searchTimer);
  search.value = '';
  statusFilter.value = '';
  loadDashboard();
}

document.getElementById('add-equipment').addEventListener('click', () => openEquipmentDialog());
document.getElementById('filter-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); loadDashboard(); });
search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadDashboard, 300); });
statusFilter.addEventListener('change', () => { clearTimeout(searchTimer); loadDashboard(); });
resetFilters.addEventListener('click', clearFilters);
refreshButton.addEventListener('click', loadDashboard);
chartSelect.addEventListener('change', loadChart);
chartPeriod.addEventListener('change', loadChart);
body.addEventListener('click', event => {
  const measurementButton = event.target.closest('[data-measurement]');
  if (measurementButton) openMeasurementDialog(equipment, Number(measurementButton.dataset.measurement));
  if (event.target.closest('[data-add]')) openEquipmentDialog();
  if (event.target.closest('[data-reset]')) clearFilters();
});
document.addEventListener('equipment:saved', loadDashboard);
document.addEventListener('measurement:saved', loadDashboard);
setInterval(() => { if (!document.hidden && !document.querySelector('dialog[open]') && !loading) loadDashboard(); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !loading) loadDashboard(); });

try {
  const flash = sessionStorage.getItem('equipment-flash');
  if (flash) { toast(flash); sessionStorage.removeItem('equipment-flash'); }
} catch { /* Работа интерфейса не зависит от доступности sessionStorage. */ }
loadDashboard();
