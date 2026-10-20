import { api, dateTime, emptyChart, escapeHtml, latestMeasurement, localDateTime, markUpdated, number, openEquipmentDialog, openMeasurementDialog, setButtonBusy, setConnection, showError, statusBadge, timezoneLabel, toast } from './ui.js';
import { renderChart } from './chart.js';

const id = Number(new URLSearchParams(location.search).get('id'));
const pageError = document.getElementById('page-error');
const chart = document.getElementById('device-chart');
const historyBody = document.getElementById('history-body');
const dateFrom = document.getElementById('date-from');
const dateTo = document.getElementById('date-to');
const historyError = document.getElementById('history-error');
let equipment = null;
let loading = false;
let detailVersion = 0;
let historyVersion = 0;
let quickRange = 24;

document.getElementById('timezone-label').textContent = timezoneLabel();

function setRange(hours) {
  quickRange = hours;
  const end = new Date();
  dateFrom.value = localDateTime(new Date(end.getTime() - hours * 3600000));
  dateTo.value = localDateTime(end);
  document.querySelectorAll('[data-range]').forEach(button => {
    const active = Number(button.dataset.range) === hours;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('button-secondary', active);
    button.classList.toggle('button-ghost', !active);
  });
}

function renderEquipment(item, measurement) {
  document.title = `${item.name} · Мониторинг оборудования`;
  document.getElementById('device-name').textContent = item.name;
  document.getElementById('breadcrumb-name').textContent = item.name;
  document.getElementById('device-type').textContent = item.equipment_type;
  document.getElementById('device-subtitle').textContent = `Устройство №${item.id} · текущие показания и история измерений`;
  document.getElementById('device-serial').textContent = item.serial_number;
  document.getElementById('device-created').textContent = dateTime(item.created_at);
  document.getElementById('device-warning').textContent = `${number(item.warning_limit)} °C`;
  document.getElementById('device-critical').textContent = `${number(item.critical_limit)} °C`;
  document.getElementById('device-status').innerHTML = statusBadge(item.status);
  document.getElementById('latest-temperature').textContent = number(measurement?.temperature);
  document.getElementById('latest-pressure').textContent = number(measurement?.pressure);
  document.getElementById('latest-time').textContent = measurement ? dateTime(measurement.received_at) : 'Показаний пока нет';
  document.getElementById('device-content').hidden = false;
  document.getElementById('edit-equipment').disabled = false;
  document.getElementById('add-measurement').disabled = false;
}

async function loadHistory() {
  if (!equipment) return;
  const version = ++historyVersion;
  const button = document.querySelector('#history-form [type="submit"]');
  const start = new Date(dateFrom.value);
  // datetime-local задаётся с точностью до секунды: включаем выбранную последнюю секунду целиком.
  const end = new Date(new Date(dateTo.value).getTime() + 999);
  dateFrom.removeAttribute('aria-invalid');
  dateTo.removeAttribute('aria-invalid');
  if (!dateFrom.value || !dateTo.value || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    button.disabled = false;
    showError(historyError, 'Укажите начало и конец периода.');
    return;
  }
  if (start > end) {
    button.disabled = false;
    dateTo.setAttribute('aria-invalid', 'true');
    showError(historyError, 'Начало периода должно быть раньше его окончания.');
    return;
  }
  showError(historyError);
  button.disabled = true;
  const params = new URLSearchParams({ date_from: start.toISOString(), date_to: end.toISOString() });
  try {
    const measurements = await api(`/equipment/${id}/measurements/?${params}`);
    if (version !== historyVersion) return;
    renderChart(chart, measurements, equipment);
    document.getElementById('history-count').textContent = `Измерений: ${measurements.length}`;
    const visible = measurements.slice(-200).reverse();
    historyBody.innerHTML = visible.length ? visible.map(item => `<tr><td>${escapeHtml(dateTime(item.received_at))}</td><td class="reading-value">${escapeHtml(number(item.temperature))} °C</td><td class="reading-value">${escapeHtml(number(item.pressure))}${item.pressure !== null && item.pressure !== undefined ? ' бар' : ''}</td></tr>`).join('') : '<tr><td colspan="3" class="table-empty">В выбранном периоде измерений нет</td></tr>';
    document.getElementById('measurements-description').textContent = measurements.length > 200 ? `Последние 200 из ${measurements.length} измерений · сначала новые` : 'Сначала новые';
  } catch (error) {
    if (version !== historyVersion) return;
    showError(historyError, error.message);
    emptyChart(chart, 'Не удалось загрузить историю', 'Повторите запрос с помощью кнопки «Показать»');
    historyBody.innerHTML = '<tr><td colspan="3" class="table-empty">Измерения недоступны. Повторите запрос.</td></tr>';
    document.getElementById('history-count').textContent = 'Данные недоступны';
  } finally {
    if (version === historyVersion) button.disabled = false;
  }
}

async function loadDevice() {
  const version = ++detailVersion;
  if (!Number.isInteger(id) || id <= 0) {
    document.getElementById('device-name').textContent = 'Устройство не найдено';
    showError(pageError, 'В адресе страницы указан некорректный ID. Вернитесь к списку оборудования.');
    return;
  }
  loading = true;
  try {
    const item = await api(`/equipment/${id}`);
    const measurement = await latestMeasurement(id);
    if (version !== detailVersion) return;
    equipment = item;
    renderEquipment(item, measurement);
    showError(pageError);
    setConnection(true);
    markUpdated();
    if (quickRange) setRange(quickRange);
    await loadHistory();
  } catch (error) {
    if (version !== detailVersion) return;
    showError(pageError, error.status === 404 ? 'Оборудование не найдено. Возможно, оно было удалено. Вернитесь к общему списку.' : error.message);
    if (error.status === 404) {
      equipment = null;
      historyVersion++;
      document.getElementById('device-name').textContent = 'Устройство не найдено';
      document.getElementById('device-content').hidden = true;
      document.getElementById('edit-equipment').disabled = true;
      document.getElementById('add-measurement').disabled = true;
    }
    setConnection(error.status === 404);
  } finally {
    if (version === detailVersion) loading = false;
  }
}

document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => { setRange(Number(button.dataset.range)); loadHistory(); }));
document.getElementById('history-form').addEventListener('submit', event => { event.preventDefault(); loadHistory(); });
[dateFrom, dateTo].forEach(input => input.addEventListener('input', () => {
  quickRange = null;
  document.querySelectorAll('[data-range]').forEach(button => { button.setAttribute('aria-pressed', 'false'); button.classList.remove('button-secondary'); button.classList.add('button-ghost'); });
}));
document.getElementById('add-measurement').addEventListener('click', () => { if (equipment) openMeasurementDialog([equipment], id); });
document.getElementById('edit-equipment').addEventListener('click', () => { if (equipment) openEquipmentDialog(equipment); });
document.getElementById('refresh-device').addEventListener('click', loadDevice);
document.addEventListener('equipment:saved', loadDevice);
document.addEventListener('measurement:saved', () => {
  // После ручной отправки показание сразу появляется в выбранном быстром периоде.
  if (quickRange) setRange(quickRange);
  loadDevice();
});
document.getElementById('delete-equipment').addEventListener('click', async event => {
  if (!equipment || !window.confirm(`Удалить «${equipment.name}» и всю историю его измерений?`)) return;
  const button = event.currentTarget;
  setButtonBusy(button, true, 'Удаляем…');
  try {
    await api(`/equipment/${id}`, { method: 'DELETE' });
    try { sessionStorage.setItem('equipment-flash', 'Оборудование удалено'); } catch { /* Необязательное уведомление. */ }
    location.href = './';
  } catch (error) {
    toast(error.message, true);
    setButtonBusy(button, false);
  }
});
setInterval(() => { if (!document.hidden && !document.querySelector('dialog[open]') && !loading) loadDevice(); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !loading) loadDevice(); });
setRange(24);
loadDevice();
